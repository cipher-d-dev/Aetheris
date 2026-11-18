package com.aetheris

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Photos and voice notes, sized for a mesh where every byte is relayed by
 * other people's phones:
 *   - photos are downscaled and JPEG-compressed (~50–150 KB)
 *   - voice notes are mono AAC at 24 kbps (~3 KB per second)
 */
class MediaHelper(private val context: Context) {

    data class Image(val base64: String, val width: Int, val height: Int)
    data class Audio(val base64: String, val durationMs: Long)

    companion object {
        const val PICK_IMAGE_REQUEST = 4217
        const val MAX_VOICE_MS = 120_000L
    }

    // ─── Images ────────────────────────────────────────────────────────────

    fun pickImageIntent(): Intent =
        Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }

    fun compressImage(uri: Uri, maxDim: Int, quality: Int): Image {
        val resolver = context.contentResolver

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("Not an image")

        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxDim || bounds.outHeight / (sample * 2) >= maxDim) {
            sample *= 2
        }
        val decoded = resolver.openInputStream(uri).use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw IllegalArgumentException("Could not decode image")

        val rotation = resolver.openInputStream(uri).use { input ->
            if (input == null) 0 else when (
                ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            ) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        }

        val scale = minOf(1f, maxDim.toFloat() / maxOf(decoded.width, decoded.height))
        val matrix = Matrix().apply {
            postScale(scale, scale)
            postRotate(rotation.toFloat())
        }
        val finalBitmap = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)

        val out = ByteArrayOutputStream()
        finalBitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(20, 95), out)
        val result = Image(
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP),
            finalBitmap.width,
            finalBitmap.height,
        )
        if (finalBitmap !== decoded) finalBitmap.recycle()
        decoded.recycle()
        return result
    }

    // ─── Voice notes ───────────────────────────────────────────────────────

    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null
    private var recordStartedAt = 0L

    fun startRecording() {
        cancelRecording()
        val file = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context)
                else @Suppress("DEPRECATION") MediaRecorder()
        r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioChannels(1)
        r.setAudioSamplingRate(16_000)
        r.setAudioEncodingBitRate(24_000)
        r.setMaxDuration(MAX_VOICE_MS.toInt())
        r.setOutputFile(file.absolutePath)
        r.prepare()
        r.start()
        recorder = r
        recordFile = file
        recordStartedAt = SystemClock.elapsedRealtime()
    }

    fun stopRecording(): Audio {
        val r = recorder ?: throw IllegalStateException("Not recording")
        val file = recordFile!!
        val duration = SystemClock.elapsedRealtime() - recordStartedAt
        recorder = null
        recordFile = null
        try {
            r.stop()
        } catch (e: RuntimeException) {
            // Thrown when the recording is too short to contain any audio.
            file.delete()
            throw IllegalStateException("Recording too short")
        } finally {
            r.release()
        }
        val bytes = file.readBytes()
        file.delete()
        return Audio(Base64.encodeToString(bytes, Base64.NO_WRAP), minOf(duration, MAX_VOICE_MS))
    }

    fun cancelRecording() {
        recorder?.let {
            try { it.stop() } catch (_: RuntimeException) {}
            it.release()
        }
        recorder = null
        recordFile?.delete()
        recordFile = null
    }

    private var player: MediaPlayer? = null
    private var playingFile: File? = null

    fun play(base64: String, onDone: () -> Unit) {
        stopPlayback()
        val file = File(context.cacheDir, "play-${System.nanoTime()}.m4a")
        file.writeBytes(Base64.decode(base64, Base64.NO_WRAP))
        val p = MediaPlayer()
        p.setDataSource(file.absolutePath)
        p.setOnCompletionListener {
            stopPlayback()
            onDone()
        }
        p.prepare()
        p.start()
        player = p
        playingFile = file
    }

    fun stopPlayback() {
        player?.let {
            try { it.stop() } catch (_: IllegalStateException) {}
            it.release()
        }
        player = null
        playingFile?.delete()
        playingFile = null
    }

    fun release() {
        cancelRecording()
        stopPlayback()
    }
}
