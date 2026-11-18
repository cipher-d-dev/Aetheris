package com.aetheris

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Radio layer for Aetheris, built on Google Nearby Connections.
 *
 * Nearby does the hard parts for us: it discovers peers over Bluetooth LE,
 * connects, and transparently upgrades the link to Wi-Fi (hotspot / Wi-Fi
 * Direct / LAN) when that is faster. With Strategy.P2P_CLUSTER every phone
 * can hold several links at once, which is what a relay node needs.
 *
 * This class knows nothing about routing. It just keeps links to nearby
 * Aetheris phones up and moves opaque text frames over them. All mesh logic
 * lives in TypeScript (src/mesh/meshNode.ts).
 */
class NearbyMeshManager(
    context: Context,
    private val listener: Listener,
) {
    interface Listener {
        fun onPeerFound(endpointId: String, nodeId: String)
        fun onPeerLost(endpointId: String)
        fun onLinkUp(endpointId: String, nodeId: String)
        fun onLinkDown(endpointId: String)
        fun onFrame(endpointId: String, data: String)
        fun onError(code: String, message: String)
    }

    companion object {
        private const val TAG = "AetherisNearby"
        private const val SERVICE_ID = "com.aetheris.mesh.v2"
        private const val NAME_PREFIX = "AE2:"
        /** Bluetooth gets unstable well before Nearby's own limits. */
        private const val MAX_LINKS = 6
        /** If the "lower ID dials" rule hasn't produced a link by now, dial anyway. */
        private const val FALLBACK_DIAL_MS = 8_000L
        private const val RETRY_BACKOFF_MS = 15_000L
    }

    private val client: ConnectionsClient = Nearby.getConnectionsClient(context)
    private val main = Handler(Looper.getMainLooper())
    private val streamReader = Executors.newCachedThreadPool()

    private var nodeId: String = ""
    private var running = false
    private var discovering = false

    // Duty cycle: discoveryOnMs of scanning, then discoveryOffMs of rest.
    // offMs = 0 means scan continuously.
    private var discoveryOnMs = 0L
    private var discoveryOffMs = 0L

    private val found = ConcurrentHashMap<String, String>()      // endpointId → nodeId
    private val pending = ConcurrentHashMap<String, Long>()       // endpointId → dial time
    private val links = ConcurrentHashMap<String, String>()       // endpointId → nodeId
    private val lastFailure = ConcurrentHashMap<String, Long>()   // nodeId → time

    // ─── Lifecycle ─────────────────────────────────────────────────────────

    fun start(nodeId: String) {
        if (running && this.nodeId == nodeId) return
        if (running) stop()
        this.nodeId = nodeId
        running = true
        startAdvertising()
        startDiscoveryCycle()
    }

    fun stop() {
        running = false
        main.removeCallbacksAndMessages(null)
        try {
            client.stopAdvertising()
            client.stopDiscovery()
            client.stopAllEndpoints()
        } catch (e: Exception) {
            Log.w(TAG, "stop: ${e.message}")
        }
        discovering = false
        val dropped = links.keys.toList()
        links.clear()
        pending.clear()
        found.clear()
        dropped.forEach { listener.onLinkDown(it) }
    }

    fun shutdown() {
        stop()
        streamReader.shutdownNow()
    }

    fun linkCount(): Int = links.size

    /**
     * Battery control from JS. onMs/offMs = 0/0 → scan continuously.
     * Advertising stays on so others can always find us.
     */
    fun setDiscoveryDutyCycle(onMs: Long, offMs: Long) {
        discoveryOnMs = onMs
        discoveryOffMs = offMs
        if (running) {
            main.removeCallbacks(dutyCycleTick)
            startDiscoveryCycle()
        }
    }

    // ─── Advertising & discovery ───────────────────────────────────────────

    private fun startAdvertising() {
        val options = AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        client.startAdvertising(NAME_PREFIX + nodeId, SERVICE_ID, lifecycle, options)
            .addOnFailureListener { e ->
                if (!isAlready(e)) listener.onError("ADVERTISE_FAILED", e.message ?: "advertising failed")
            }
    }

    private fun startDiscovery() {
        if (discovering || !running) return
        val options = DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build()
        client.startDiscovery(SERVICE_ID, discovery, options)
            .addOnSuccessListener { discovering = true }
            .addOnFailureListener { e ->
                if (isAlready(e)) discovering = true
                else listener.onError("DISCOVERY_FAILED", e.message ?: "discovery failed")
            }
    }

    private fun stopDiscovery() {
        if (!discovering) return
        client.stopDiscovery()
        discovering = false
    }

    private val dutyCycleTick = object : Runnable {
        override fun run() {
            if (!running) return
            if (discovering) {
                stopDiscovery()
                main.postDelayed(this, discoveryOffMs)
            } else {
                startDiscovery()
                main.postDelayed(this, discoveryOnMs)
            }
        }
    }

    private fun startDiscoveryCycle() {
        startDiscovery()
        if (discoveryOffMs > 0 && discoveryOnMs > 0) {
            main.postDelayed(dutyCycleTick, discoveryOnMs)
        }
    }

    private val discovery = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (info.serviceId != SERVICE_ID) return
            val name = info.endpointName
            if (!name.startsWith(NAME_PREFIX)) return
            val peerId = name.removePrefix(NAME_PREFIX)
            if (peerId == nodeId || peerId.isEmpty()) return
            found[endpointId] = peerId
            listener.onPeerFound(endpointId, peerId)
            considerDialing(endpointId, peerId, fallback = false)
        }

        override fun onEndpointLost(endpointId: String) {
            found.remove(endpointId)
            listener.onPeerLost(endpointId)
        }
    }

    /**
     * Both phones discover each other, so to avoid two simultaneous dials the
     * phone with the lower node ID dials first. The other dials only if
     * nothing has happened after FALLBACK_DIAL_MS.
     */
    private fun considerDialing(endpointId: String, peerId: String, fallback: Boolean) {
        if (!running) return
        if (links.containsKey(endpointId) || pending.containsKey(endpointId)) return
        if (links.containsValue(peerId)) return
        if (links.size >= MAX_LINKS) return
        val failedAt = lastFailure[peerId]
        if (failedAt != null && System.currentTimeMillis() - failedAt < RETRY_BACKOFF_MS) {
            main.postDelayed({ found[endpointId]?.let { considerDialing(endpointId, it, true) } }, RETRY_BACKOFF_MS)
            return
        }

        if (!fallback && nodeId > peerId) {
            main.postDelayed({
                found[endpointId]?.let { considerDialing(endpointId, it, true) }
            }, FALLBACK_DIAL_MS)
            return
        }

        pending[endpointId] = System.currentTimeMillis()
        client.requestConnection(NAME_PREFIX + nodeId, endpointId, lifecycle)
            .addOnFailureListener { e ->
                pending.remove(endpointId)
                if (!isAlready(e)) {
                    lastFailure[peerId] = System.currentTimeMillis()
                    Log.w(TAG, "requestConnection to $peerId failed: ${e.message}")
                }
            }
    }

    // ─── Connections ───────────────────────────────────────────────────────

    private val lifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            val name = info.endpointName
            if (!name.startsWith(NAME_PREFIX) || links.size >= MAX_LINKS) {
                client.rejectConnection(endpointId)
                return
            }
            found[endpointId] = name.removePrefix(NAME_PREFIX)
            pending[endpointId] = System.currentTimeMillis()
            // Accept at the radio level; the mesh layer then authenticates the
            // peer cryptographically and drops the link if the proof fails.
            client.acceptConnection(endpointId, payloads)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            pending.remove(endpointId)
            val peerId = found[endpointId] ?: return
            when (result.status.statusCode) {
                ConnectionsStatusCodes.STATUS_OK -> {
                    links[endpointId] = peerId
                    lastFailure.remove(peerId)
                    listener.onLinkUp(endpointId, peerId)
                }
                else -> {
                    lastFailure[peerId] = System.currentTimeMillis()
                    Log.w(TAG, "connection to $peerId failed: ${result.status.statusCode}")
                }
            }
        }

        override fun onDisconnected(endpointId: String) {
            val peerId = links.remove(endpointId)
            if (peerId != null) listener.onLinkDown(endpointId)
            // It may still be in range: try again later.
            main.postDelayed({
                found[endpointId]?.let { considerDialing(endpointId, it, true) }
            }, RETRY_BACKOFF_MS)
        }
    }

    fun disconnect(endpointId: String) {
        client.disconnectFromEndpoint(endpointId)
        if (links.remove(endpointId) != null) listener.onLinkDown(endpointId)
    }

    // ─── Payloads ──────────────────────────────────────────────────────────

    /**
     * Send one frame. Small frames go as a BYTES payload; larger ones (photos,
     * voice notes) as a STREAM so we aren't limited to MAX_BYTES_DATA_SIZE.
     */
    fun send(endpointId: String, frame: String, onDone: (Exception?) -> Unit) {
        if (!links.containsKey(endpointId)) {
            onDone(IllegalStateException("no link $endpointId"))
            return
        }
        val bytes = frame.toByteArray(Charsets.UTF_8)
        val payload = if (bytes.size <= ConnectionsClient.MAX_BYTES_DATA_SIZE) {
            Payload.fromBytes(bytes)
        } else {
            Payload.fromStream(ByteArrayInputStream(bytes))
        }
        client.sendPayload(endpointId, payload)
            .addOnSuccessListener { onDone(null) }
            .addOnFailureListener { e -> onDone(e) }
    }

    private val payloads = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            when (payload.type) {
                Payload.Type.BYTES -> {
                    val bytes = payload.asBytes() ?: return
                    listener.onFrame(endpointId, String(bytes, Charsets.UTF_8))
                }
                Payload.Type.STREAM -> {
                    val input = payload.asStream()?.asInputStream() ?: return
                    streamReader.execute {
                        try {
                            val out = ByteArrayOutputStream()
                            val buf = ByteArray(16 * 1024)
                            var total = 0
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                total += n
                                if (total > 4 * 1024 * 1024) throw IllegalStateException("frame too large")
                                out.write(buf, 0, n)
                            }
                            listener.onFrame(endpointId, out.toString("UTF-8"))
                        } catch (e: Exception) {
                            Log.w(TAG, "stream from $endpointId failed: ${e.message}")
                        } finally {
                            try { input.close() } catch (_: Exception) {}
                        }
                    }
                }
                else -> { /* FILE payloads are not used */ }
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
    }

    private fun isAlready(e: Exception): Boolean {
        val code = (e as? ApiException)?.statusCode ?: return false
        return code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING ||
            code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING ||
            code == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT
    }
}
