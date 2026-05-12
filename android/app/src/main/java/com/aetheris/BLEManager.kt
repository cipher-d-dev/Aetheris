package com.aetheris

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/**
 * BLEManager handles:
 *  - Advertising this device as an Aetheris node
 *  - Scanning for nearby Aetheris nodes
 *
 * Discovery-only: we do NOT open GATT connections here.
 * BLE is used purely for peer detection. Data transfer
 * happens over Wi-Fi Direct (Day 3).
 */
class BLEManager(private val context: Context) {

    companion object {
        private const val TAG = "Aetheris:BLE"

        // Unique service UUID — identifies Aetheris nodes on the network.
        // Any device advertising this UUID is an Aetheris peer.
        val MESH_SERVICE_UUID: UUID = 
    UUID.fromString("6e400001-ade1-4527-8ecc-000000000001")

        // Manufacturer ID — arbitrary 2-byte value for our manufacturer data
        const val MANUFACTURER_ID = 0x4145 // "AE" in hex

        // Payload structure in manufacturer data:
        // [0]     Protocol version (1 byte)
        // [1-8]   First 8 bytes of node ID (Base58 public key bytes)
        const val PROTOCOL_VERSION: Byte = 0x01
        const val NODE_ID_BYTES = 8
    }

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null

    var isAdvertising = false
        private set
    var isScanning = false
        private set

    // ─── Advertising ──────────────────────────────────────────────────────────

    /**
     * Start advertising this node.
     * @param nodeIdBase58 The full Base58 public key string (we take first 8 bytes)
     */
    fun startAdvertising(nodeIdBase58: String) {
        val adapter = bluetoothAdapter ?: run {
            Log.e(TAG, "Bluetooth not available")
            return
        }

        if (!adapter.isEnabled) {
            Log.e(TAG, "Bluetooth is disabled")
            return
        }

        advertiser = adapter.bluetoothLeAdvertiser ?: run {
            Log.e(TAG, "BLE advertising not supported on this device")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false) // Discovery only — no GATT connection
            .setTimeout(0)         // Advertise indefinitely
            .build()

        val payload = buildAdvertisePayload(nodeIdBase58)

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(MESH_SERVICE_UUID))
            .addManufacturerData(MANUFACTURER_ID, payload)
            .setIncludeDeviceName(false) // Save space in the 31-byte limit
            .build()

        advertiseCallback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                isAdvertising = true
                Log.d(TAG, "BLE advertising started")
            }

            override fun onStartFailure(errorCode: Int) {
                isAdvertising = false
                Log.e(TAG, "BLE advertising failed: $errorCode")
            }
        }

        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    fun stopAdvertising() {
        advertiseCallback?.let { advertiser?.stopAdvertising(it) }
        advertiseCallback = null
        isAdvertising = false
        Log.d(TAG, "BLE advertising stopped")
    }

    // ─── Scanning ─────────────────────────────────────────────────────────────

    /**
     * Start scanning for Aetheris peers.
     * @param onPeerFound Called when a new peer advertisement is received
     * @param onPeerLost  Called when a peer is no longer seen (handled externally via timeout)
     */
    fun startScanning(
        onPeerFound: (peerId: String, rssi: Int) -> Unit,
    ) {
        if (!hasPermissions()) {
            Log.e(TAG, "Missing permissions! Cannot scan.")
            return 
        }
        
        val adapter = bluetoothAdapter ?: run {
            Log.e(TAG, "Bluetooth not available")
            return
        }

        if (!adapter.isEnabled) {
            Log.e(TAG, "Bluetooth is disabled")
            return
        }

        scanner = adapter.bluetoothLeScanner ?: run {
            Log.e(TAG, "BLE scanning not supported")
            return
        }

        // Filter: only pick up devices advertising our service UUID
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(MESH_SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER) // Battery friendly
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_STICKY)
            .build()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val peerId = parsePeerIdFromResult(result) ?: return
                val rssi = result.rssi
                onPeerFound(peerId, rssi)
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) {
                results.forEach { result ->
                    val peerId = parsePeerIdFromResult(result) ?: return@forEach
                    onPeerFound(peerId, result.rssi)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                isScanning = false
                Log.e(TAG, "BLE scan failed: $errorCode")
            }
        }

        scanner?.startScan(listOf(filter), settings, scanCallback)
        isScanning = true
        Log.d(TAG, "BLE scanning started")
    }

    fun stopScanning() {
        scanCallback?.let { scanner?.stopScan(it) }
        scanCallback = null
        isScanning = false
        Log.d(TAG, "BLE scanning stopped")
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Build the manufacturer data payload:
     * [0]    Protocol version
     * [1-8]  First 8 bytes of the Base58 node ID as ASCII
     */
    private fun buildAdvertisePayload(nodeIdBase58: String): ByteArray {
        val payload = ByteArray(1 + NODE_ID_BYTES)
        payload[0] = PROTOCOL_VERSION

        val idBytes = nodeIdBase58.toByteArray(Charsets.US_ASCII)
        val copyLen = minOf(idBytes.size, NODE_ID_BYTES)
        System.arraycopy(idBytes, 0, payload, 1, copyLen)

        return payload
    }

    /**
     * Extract the peer node ID string from a scan result's manufacturer data.
     * Returns null if the packet doesn't contain valid Aetheris data.
     */
    private fun parsePeerIdFromResult(result: ScanResult): String? {
        val manufacturerData = result.scanRecord
            ?.getManufacturerSpecificData(MANUFACTURER_ID)
            ?: return null

        if (manufacturerData.size < 1 + NODE_ID_BYTES) return null
        if (manufacturerData[0] != PROTOCOL_VERSION) return null

        val idBytes = manufacturerData.copyOfRange(1, 1 + NODE_ID_BYTES)
        return String(idBytes, Charsets.US_ASCII).trimEnd('\u0000')
    }

    private fun hasPermissions(): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
    }

    fun isBluetoothEnabled(): Boolean = bluetoothAdapter?.isEnabled == true
}