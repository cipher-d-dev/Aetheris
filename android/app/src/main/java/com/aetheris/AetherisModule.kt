package com.aetheris

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors

/**
 * JS bridge for Aetheris. Exposes:
 *   - the radio (NearbyMeshManager): start/stop, send frames, duty cycle
 *   - media (MediaHelper): pick + compress photo, record/play voice notes
 *   - a "new message" notification
 *
 * Events emitted to JS:
 *   AetherisPeerFound     {endpointId, nodeId}
 *   AetherisPeerLost      {endpointId}
 *   AetherisLinkUp        {linkId, nodeId}
 *   AetherisLinkDown      {linkId}
 *   AetherisFrame         {linkId, data}
 *   AetherisRadioError    {code, message}
 *   AetherisAudioFinished {id}
 *   AetherisTick          {}   periodic heartbeat that drives routing adverts.
 *                              JS timers pause in the background; this doesn't.
 */
@ReactModule(name = AetherisModule.NAME)
class AetherisModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "AetherisNativeModule"
        private const val MESSAGE_CHANNEL_ID = "AetherisMessages"
    }

    private val worker = Executors.newSingleThreadExecutor()
    private val media = MediaHelper(reactContext)
    private var pickPromise: Promise? = null
    private var pickMaxDim = 1024
    private var pickQuality = 60

    private val tickHandler = Handler(Looper.getMainLooper())
    private var tickMs = 0L
    private val tick = object : Runnable {
        override fun run() {
            if (tickMs <= 0) return
            emit("AetherisTick", Arguments.createMap())
            tickHandler.postDelayed(this, tickMs)
        }
    }

    private val radio = NearbyMeshManager(reactContext, object : NearbyMeshManager.Listener {
        override fun onPeerFound(endpointId: String, nodeId: String) =
            emit("AetherisPeerFound", Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("nodeId", nodeId)
            })

        override fun onPeerLost(endpointId: String) =
            emit("AetherisPeerLost", Arguments.createMap().apply { putString("endpointId", endpointId) })

        override fun onLinkUp(endpointId: String, nodeId: String) =
            emit("AetherisLinkUp", Arguments.createMap().apply {
                putString("linkId", endpointId)
                putString("nodeId", nodeId)
            })

        override fun onLinkDown(endpointId: String) =
            emit("AetherisLinkDown", Arguments.createMap().apply { putString("linkId", endpointId) })

        override fun onFrame(endpointId: String, data: String) =
            emit("AetherisFrame", Arguments.createMap().apply {
                putString("linkId", endpointId)
                putString("data", data)
            })

        override fun onError(code: String, message: String) =
            emit("AetherisRadioError", Arguments.createMap().apply {
                putString("code", code)
                putString("message", message)
            })
    })

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    private fun emit(event: String, params: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    // ─── Radio ─────────────────────────────────────────────────────────────

    @ReactMethod
    fun start(nodeId: String, promise: Promise) {
        try {
            radio.start(nodeId)
            ContextCompat.startForegroundService(
                reactContext, Intent(reactContext, AetherisService::class.java)
            )
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e.message ?: "Could not start radio", e)
        }
    }

    @ReactMethod
    fun setTickInterval(ms: Double, promise: Promise) {
        tickHandler.removeCallbacks(tick)
        tickMs = ms.toLong()
        if (tickMs > 0) tickHandler.postDelayed(tick, tickMs)
        promise.resolve(null)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            tickMs = 0
            tickHandler.removeCallbacks(tick)
            radio.stop()
            reactContext.stopService(Intent(reactContext, AetherisService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message ?: "Could not stop radio", e)
        }
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        promise.resolve(manager?.adapter?.isEnabled == true)
    }

    @ReactMethod
    fun setDiscoveryDutyCycle(onMs: Double, offMs: Double, promise: Promise) {
        radio.setDiscoveryDutyCycle(onMs.toLong(), offMs.toLong())
        promise.resolve(null)
    }

    @ReactMethod
    fun sendFrame(linkId: String, data: String, promise: Promise) {
        radio.send(linkId, data) { error ->
            if (error == null) promise.resolve(null)
            else promise.reject("SEND_FAILED", error.message ?: "Send failed", error)
        }
    }

    @ReactMethod
    fun disconnect(linkId: String, promise: Promise) {
        radio.disconnect(linkId)
        promise.resolve(null)
    }

    // ─── Media ─────────────────────────────────────────────────────────────

    @ReactMethod
    fun pickImage(maxDim: Double, quality: Double, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "App is not in the foreground")
            return
        }
        pickPromise?.reject("CANCELLED", "Superseded by a new pick")
        pickPromise = promise
        pickMaxDim = maxDim.toInt()
        pickQuality = quality.toInt()
        try {
            activity.startActivityForResult(media.pickImageIntent(), MediaHelper.PICK_IMAGE_REQUEST)
        } catch (e: Exception) {
            pickPromise = null
            promise.reject("PICK_FAILED", e.message ?: "Could not open picker", e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != MediaHelper.PICK_IMAGE_REQUEST) return
        val promise = pickPromise ?: return
        pickPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
            promise.resolve(null) // user cancelled
            return
        }
        worker.execute {
            try {
                val img = media.compressImage(uri, pickMaxDim, pickQuality)
                promise.resolve(Arguments.createMap().apply {
                    putString("data", img.base64)
                    putString("mime", "image/jpeg")
                    putInt("width", img.width)
                    putInt("height", img.height)
                })
            } catch (e: Exception) {
                promise.reject("IMAGE_FAILED", e.message ?: "Could not read image", e)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {}

    @ReactMethod
    fun startRecording(promise: Promise) {
        try {
            media.startRecording()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("RECORD_FAILED", e.message ?: "Could not start recording", e)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        try {
            val audio = media.stopRecording()
            promise.resolve(Arguments.createMap().apply {
                putString("data", audio.base64)
                putString("mime", "audio/mp4")
                putDouble("durationMs", audio.durationMs.toDouble())
            })
        } catch (e: Exception) {
            promise.reject("RECORD_FAILED", e.message ?: "Recording failed", e)
        }
    }

    @ReactMethod
    fun cancelRecording(promise: Promise) {
        media.cancelRecording()
        promise.resolve(null)
    }

    @ReactMethod
    fun playAudio(id: String, base64: String, promise: Promise) {
        try {
            media.play(base64) {
                emit("AetherisAudioFinished", Arguments.createMap().apply { putString("id", id) })
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PLAY_FAILED", e.message ?: "Could not play audio", e)
        }
    }

    @ReactMethod
    fun stopAudio(promise: Promise) {
        media.stopPlayback()
        promise.resolve(null)
    }

    // ─── Notifications ─────────────────────────────────────────────────────

    @ReactMethod
    fun showMessageNotification(title: String, body: String, promise: Promise) {
        try {
            val manager = NotificationManagerCompat.from(reactContext)
            if (!manager.areNotificationsEnabled()) {
                promise.resolve(false)
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val system = reactContext.getSystemService(NotificationManager::class.java)
                system.createNotificationChannel(
                    NotificationChannel(MESSAGE_CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH)
                )
            }
            val launch = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
            val pending = PendingIntent.getActivity(
                reactContext, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(reactContext, MESSAGE_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.resolve(false)
        }
    }

    // ─── RN event emitter plumbing ─────────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}

    override fun invalidate() {
        super.invalidate()
        reactContext.removeActivityEventListener(this)
        tickMs = 0
        tickHandler.removeCallbacks(tick)
        radio.shutdown()
        media.release()
        worker.shutdown()
        reactContext.stopService(Intent(reactContext, AetherisService::class.java))
    }
}
