package com.aetheris

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.p2p.*
import android.os.Looper
import android.util.Log
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

class WifiDirectManager(
    private val context: Context,
    private val onMessageReceived: (peerId: String, data: ByteArray) -> Unit,
    private val onConnectionStateChanged: (peerId: String, state: String) -> Unit,
) {
    companion object {
        private const val TAG = "Aetheris:WiFiDirect"
        private const val TCP_PORT = 8765
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val SOCKET_TIMEOUT_MS = 30_000
        private const val HANDSHAKE_MAGIC = "AETHERIS_HELLO:"
        // On Wi-Fi Direct, the Group Owner always gets this IP on the client's side
        private const val GO_IP = "192.168.49.1"
    }

    private val executor = Executors.newCachedThreadPool()

    private val wifiP2pManager: WifiP2pManager =
        context.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager

    private val channel: WifiP2pManager.Channel =
        wifiP2pManager.initialize(context, Looper.getMainLooper(), null)

    // Active sockets keyed by Aetheris peer ID
    private val activeConnections = mutableMapOf<String, Socket>()

    private var serverSocket: ServerSocket? = null
    private var isServerRunning = false
    private var myNodeId: String = ""

    // ─── Broadcast Receiver ───────────────────────────────────────────────────

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
                WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                    val networkInfo = intent.getParcelableExtra<android.net.NetworkInfo>(
                        WifiP2pManager.EXTRA_NETWORK_INFO
                    )
                    if (networkInfo?.isConnected == true) {
                        requestGroupInfo()
                    } else {
                        Log.d(TAG, "Wi-Fi Direct disconnected")
                    }
                }
            }
        }
    }

    private val intentFilter = IntentFilter().apply {
        addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    fun start(nodeId: String) {
        myNodeId = nodeId
        context.registerReceiver(receiver, intentFilter)
        Log.d(TAG, "WifiDirectManager started")
    }

    fun stop() {
        try { context.unregisterReceiver(receiver) } catch (e: Exception) { }
        stopServer()
        disconnectAll()
        wifiP2pManager.removeGroup(channel, null)
        Log.d(TAG, "WifiDirectManager stopped")
    }

    // ─── Connect ──────────────────────────────────────────────────────────────

    /**
     * Initiate a Wi-Fi Direct connection to a peer device.
     * Call this once BLE has confirmed the peer is nearby.
     *
     * @param deviceAddress Wi-Fi Direct MAC address of the target device
     * @param peerId        Aetheris node ID from BLE discovery
     */
    fun connectToDevice(deviceAddress: String, peerId: String) {
        val config = WifiP2pConfig().apply {
            this.deviceAddress = deviceAddress
            wps.setup = android.net.wifi.WpsInfo.PBC
        }

        wifiP2pManager.connect(channel, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.d(TAG, "Wi-Fi Direct connect initiated to $deviceAddress")
                onConnectionStateChanged(peerId, "connecting")
            }

            override fun onFailure(reason: Int) {
                Log.e(TAG, "Wi-Fi Direct connect failed, reason: $reason")
                onConnectionStateChanged(peerId, "failed")
            }
        })
    }

    private fun requestGroupInfo() {
        wifiP2pManager.requestGroupInfo(channel) { group ->
            if (group == null) {
                Log.w(TAG, "Group info is null")
                return@requestGroupInfo
            }
            Log.d(TAG, "Group formed. isGroupOwner=${group.isGroupOwner}")

            if (group.isGroupOwner) {
                startTcpServer()
            } else {
                connectTcpClient(GO_IP)
            }
        }
    }

    // ─── TCP Server (Group Owner) ─────────────────────────────────────────────

    private fun startTcpServer() {
        if (isServerRunning) return
        isServerRunning = true

        executor.execute {
            try {
                serverSocket = ServerSocket(TCP_PORT)
                Log.d(TAG, "TCP server listening on port $TCP_PORT")

                while (isServerRunning) {
                    try {
                        val clientSocket = serverSocket?.accept() ?: break
                        executor.execute { handleSocket(clientSocket) }
                    } catch (e: Exception) {
                        if (isServerRunning) Log.e(TAG, "Accept error: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "TCP server error: ${e.message}")
            }
        }
    }

    private fun stopServer() {
        isServerRunning = false
        try { serverSocket?.close() } catch (e: Exception) { }
        serverSocket = null
    }

    // ─── TCP Client (non-GO peer) ─────────────────────────────────────────────

    private fun connectTcpClient(goIp: String) {
        executor.execute {
            try {
                val socket = Socket()
                socket.connect(InetSocketAddress(goIp, TCP_PORT), CONNECT_TIMEOUT_MS)
                Log.d(TAG, "TCP client connected to $goIp:$TCP_PORT")
                handleSocket(socket)
            } catch (e: Exception) {
                Log.e(TAG, "TCP client connection failed: ${e.message}")
            }
        }
    }

    // ─── Socket Handler ───────────────────────────────────────────────────────

    /**
     * Handles a connected socket:
     * 1. Exchange identity handshake
     * 2. Register the connection
     * 3. Listen for incoming length-prefixed frames
     *
     * Frame format: [4-byte big-endian int = payload length][payload bytes]
     * Handshake:    "AETHERIS_HELLO:{nodeId}\n"
     */
    private fun handleSocket(socket: Socket) {
        val remote = socket.inetAddress?.hostAddress ?: "unknown"
        Log.d(TAG, "Handling socket from $remote")

        try {
            socket.soTimeout = SOCKET_TIMEOUT_MS
            val output = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
            val input = DataInputStream(BufferedInputStream(socket.getInputStream()))

            // Send our handshake
            val handshake = "$HANDSHAKE_MAGIC$myNodeId\n"
            output.write(handshake.toByteArray(Charsets.UTF_8))
            output.flush()

            // Read remote handshake
            val remoteLine = readLineFromStream(input, maxBytes = 256)
            if (remoteLine == null || !remoteLine.startsWith(HANDSHAKE_MAGIC)) {
                Log.w(TAG, "Invalid handshake: $remoteLine")
                socket.close()
                return
            }

            val remotePeerId = remoteLine.removePrefix(HANDSHAKE_MAGIC).trim()
            Log.d(TAG, "Handshake complete with peer: $remotePeerId")

            activeConnections[remotePeerId] = socket
            onConnectionStateChanged(remotePeerId, "connected")

            // Read incoming frames
            while (!socket.isClosed) {
                try {
                    val length = input.readInt()
                    if (length <= 0 || length > 10 * 1024 * 1024) {
                        Log.w(TAG, "Invalid frame length: $length — closing")
                        break
                    }
                    val data = ByteArray(length)
                    input.readFully(data)
                    Log.d(TAG, "Received ${data.size} bytes from $remotePeerId")
                    onMessageReceived(remotePeerId, data)
                } catch (e: EOFException) {
                    Log.d(TAG, "EOF from $remotePeerId — connection closed")
                    break
                }
            }

        } catch (e: Exception) {
            Log.e(TAG, "Socket error with $remote: ${e.message}")
        } finally {
            val peerId = activeConnections.entries.find { it.value == socket }?.key
            if (peerId != null) {
                activeConnections.remove(peerId)
                onConnectionStateChanged(peerId, "disconnected")
            }
            try { socket.close() } catch (e: Exception) { }
        }
    }

    // ─── Send ─────────────────────────────────────────────────────────────────

    fun sendBytes(peerId: String, data: ByteArray): Boolean {
        val socket = activeConnections[peerId]
        if (socket == null || socket.isClosed) {
            Log.w(TAG, "No active connection to $peerId")
            return false
        }
        return try {
            val output = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
            output.writeInt(data.size)
            output.write(data)
            output.flush()
            Log.d(TAG, "Sent ${data.size} bytes to $peerId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Send failed to $peerId: ${e.message}")
            activeConnections.remove(peerId)
            onConnectionStateChanged(peerId, "disconnected")
            false
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    fun isConnectedTo(peerId: String): Boolean =
        activeConnections[peerId]?.isClosed == false

    fun getConnectedPeerIds(): List<String> =
        activeConnections.filter { !it.value.isClosed }.keys.toList()

    fun disconnect(peerId: String) {
        activeConnections.remove(peerId)?.let {
            try { it.close() } catch (e: Exception) { }
        }
    }

    private fun disconnectAll() {
        activeConnections.values.forEach {
            try { it.close() } catch (e: Exception) { }
        }
        activeConnections.clear()
    }

    private fun readLineFromStream(input: DataInputStream, maxBytes: Int): String? {
        val buffer = ByteArrayOutputStream()
        var count = 0
        while (count < maxBytes) {
            val b = try { input.read() } catch (e: Exception) { return null }
            if (b == -1) return null
            if (b == '\n'.code) break
            buffer.write(b)
            count++
        }
        return buffer.toString(Charsets.UTF_8.name())
    }
}