package com.aetheris

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import android.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.Timer
import java.util.TimerTask

@ReactModule(name = AetherisModule.NAME)
class AetherisModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "AetherisNativeModule"
        private const val PEER_TIMEOUT_MS = 10_000L
        private const val PEER_CHECK_INTERVAL_MS = 3_000L
    }

    private val bleManager = BLEManager(reactContext)

    private val wifiDirectManager = WifiDirectManager(
        context = reactContext,
        onMessageReceived = { peerId, data ->
            reactContext.runOnJSQueueThread {
                val params = Arguments.createMap().apply {
                    putString("peerId", peerId)
                    putString("data", Base64.encodeToString(data, Base64.NO_WRAP))
                }
                sendEvent("AetherisMessageReceived", params)
            }
        },
        onConnectionStateChanged = { peerId, state ->
            reactContext.runOnJSQueueThread {
                val params = Arguments.createMap().apply {
                    putString("peerId", peerId)
                    putString("state", state)
                }
                sendEvent("AetherisConnectionStateChanged", params)
            }
        }
    )

    private val seenPeers = ConcurrentHashMap<String, Long>()
    private var peerTimeoutTimer: Timer? = null
    private var currentNodeId: String = ""

    override fun getName(): String = NAME

    // ─── Event emission ───────────────────────────────────────────────────────

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ─── Discovery ────────────────────────────────────────────────────────────

    @ReactMethod
    fun startDiscovery(nodeId: String, promise: Promise) {
        if (bleManager.isAdvertising || bleManager.isScanning) {
            promise.resolve("Already discovering")
            return
        }
        try {
            if (!bleManager.isBluetoothEnabled()) {
                promise.reject("BT_DISABLED", "Bluetooth is disabled. Please enable it.")
                return
            }

            currentNodeId = nodeId
            wifiDirectManager.start(nodeId)
            bleManager.startAdvertising(nodeId)

            bleManager.startScanning { peerId, rssi ->
                reactContext.runOnJSQueueThread {
                    val now = System.currentTimeMillis()
                    val isNew = !seenPeers.containsKey(peerId)
                    seenPeers[peerId] = now

                    if (isNew) {
                        val params = Arguments.createMap().apply {
                            putString("id", peerId)
                            putInt("rssi", rssi)
                            putDouble("lastSeen", now.toDouble())
                        }
                        sendEvent("AetherisPeerDiscovered", params)
                    } else {
                        val params = Arguments.createMap().apply {
                            putString("id", peerId)
                            putInt("rssi", rssi)
                            putDouble("lastSeen", now.toDouble())
                        }
                        sendEvent("AetherisPeerUpdated", params)
                    }
                }
            }

            startPeerTimeoutChecker()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCOVERY_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            bleManager.stopAdvertising()
            bleManager.stopScanning()
            wifiDirectManager.stop()
            stopPeerTimeoutChecker()
            seenPeers.clear()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        promise.resolve(bleManager.isBluetoothEnabled())
    }

    // ─── Wi-Fi Direct ─────────────────────────────────────────────────────────

    /**
     * Initiate a Wi-Fi Direct connection to a peer.
     *
     * @param deviceAddress The Wi-Fi Direct MAC address of the peer device.
     *                      On Android this comes from WifiP2pDevice.deviceAddress.
     *                      The JS side must pass this after resolving it from
     *                      Wi-Fi Direct peer discovery (separate from BLE).
     * @param peerId        The Aetheris node ID of the peer (from BLE discovery).
     */
    @ReactMethod
    fun connectToPeer(deviceAddress: String, peerId: String, promise: Promise) {
        try {
            wifiDirectManager.connectToDevice(deviceAddress, peerId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun disconnectFromPeer(peerId: String, promise: Promise) {
        try {
            wifiDirectManager.disconnect(peerId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message ?: "Unknown error")
        }
    }

    /**
     * Send raw bytes to a connected peer.
     * Data must be Base64-encoded on the JS side.
     */
    @ReactMethod
    fun sendRawBytes(peerId: String, base64Data: String, promise: Promise) {
        try {
            val bytes = Base64.decode(base64Data, Base64.NO_WRAP)
            val success = wifiDirectManager.sendBytes(peerId, bytes)
            if (success) {
                promise.resolve(null)
            } else {
                promise.reject("SEND_FAILED", "No active connection to peer $peerId")
            }
        } catch (e: Exception) {
            promise.reject("SEND_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun getConnectedPeers(promise: Promise) {
        val peers = wifiDirectManager.getConnectedPeerIds()
        val arr = Arguments.createArray()
        peers.forEach { arr.pushString(it) }
        promise.resolve(arr)
    }

    @ReactMethod
    fun isConnectedTo(peerId: String, promise: Promise) {
        promise.resolve(wifiDirectManager.isConnectedTo(peerId))
    }

    // ─── Peer timeout checker ─────────────────────────────────────────────────

    private fun startPeerTimeoutChecker() {
        stopPeerTimeoutChecker()
        peerTimeoutTimer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    val now = System.currentTimeMillis()
                    val lostPeers = seenPeers.entries
                        .filter { (_, lastSeen) -> now - lastSeen > PEER_TIMEOUT_MS }
                        .map { it.key }

                    lostPeers.forEach { peerId ->
                        reactContext.runOnJSQueueThread {
                            seenPeers.remove(peerId)
                            val params = Arguments.createMap().apply {
                                putString("id", peerId)
                            }
                            sendEvent("AetherisPeerLost", params)
                        }
                    }
                }
            }, PEER_CHECK_INTERVAL_MS, PEER_CHECK_INTERVAL_MS)
        }
    }

    private fun stopPeerTimeoutChecker() {
        peerTimeoutTimer?.cancel()
        peerTimeoutTimer = null
    }

    // ─── Required for RN event emitter ───────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    override fun invalidate() {
        super.invalidate()
        bleManager.stopAdvertising()
        bleManager.stopScanning()
        wifiDirectManager.stop()
        stopPeerTimeoutChecker()
    }
}