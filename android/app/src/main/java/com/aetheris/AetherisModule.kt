package com.aetheris

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.ConcurrentHashMap
import java.util.Timer
import java.util.TimerTask

@ReactModule(name = AetherisModule.NAME)
class AetherisModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "AetherisNativeModule"

        // How long (ms) before we consider a peer "lost" if not seen again
        private const val PEER_TIMEOUT_MS = 10_000L
        private const val PEER_CHECK_INTERVAL_MS = 3_000L
    }

    private val bleManager = BLEManager(reactContext)

    // Map of peerId -> last seen timestamp (ms)
    private val seenPeers = ConcurrentHashMap<String, Long>()
    private var peerTimeoutTimer: Timer? = null

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
            promise.resolve("Already discoverying")
            return
        }
        try {
            if (!bleManager.isBluetoothEnabled()) {
                promise.reject("BT_DISABLED", "Bluetooth is disabled. Please enable it.")
                return
            }

            // Start advertising this node
            bleManager.startAdvertising(nodeId)

            // Start scanning for other nodes
            bleManager.startScanning { peerId, rssi ->
                reactContext.runOnJSQueueThread { // <--- Ensure we are on the right thread
                    val now = System.currentTimeMillis()
                    val isNew = !seenPeers.containsKey(peerId)
                    seenPeers[peerId] = now

                    if (isNew) {
                        // New peer — emit discovery event
                        val params = Arguments.createMap().apply {
                            putString("id", peerId)
                            putInt("rssi", rssi)
                            putDouble("lastSeen", now.toDouble())
                        }
                        sendEvent("AetherisPeerDiscovered", params)
                    } else {
                        // Known peer — emit RSSI update
                        val params = Arguments.createMap().apply {
                            putString("id", peerId)
                            putInt("rssi", rssi)
                            putDouble("lastSeen", now.toDouble())
                        }
                        sendEvent("AetherisPeerUpdated", params)
                    }
                }
            }

            // Start the peer timeout checker
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

    // ─── Peer timeout checker ─────────────────────────────────────────────────

    /**
     * Periodically checks if any peer hasn't been seen for PEER_TIMEOUT_MS.
     * Emits AetherisPeerLost for any timed-out peer.
     */
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
                        reactContext.runOnJSQueueThread { // <--- Ensure we are on the right thread
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

    // ─── Stubs for Day 3 (Wi-Fi Direct) ──────────────────────────────────────

    @ReactMethod
    fun connectToPeer(peerId: String, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "Wi-Fi Direct connection coming in Day 3")
    }

    @ReactMethod
    fun sendRawBytes(peerId: String, base64Data: String, promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "Data transfer coming in Day 3")
    }

    // ─── Required for RN event emitter ───────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // ─── Cleanup on module destroy ────────────────────────────────────────────

    override fun invalidate() {
        super.invalidate()
        bleManager.stopAdvertising()
        bleManager.stopScanning()
        stopPeerTimeoutChecker()
    }
}