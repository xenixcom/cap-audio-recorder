package com.xenix.plugins.audiorecorder

import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresPermission
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.google.gson.Gson
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

class AudioRecorder(
    private val ctx: Context,
    private val notify: (String, JSObject) -> Unit
) {

    private var state: RecorderState = RecorderState.INACTIVE
    private var audioRecord: AudioRecord? = null
    private val recordingExecutor = Executors.newSingleThreadExecutor()
    private var recordingFlag = AtomicBoolean(false)
    private var paused = AtomicBoolean(false)
    private var stopping = AtomicBoolean(false)

    private var bufferStream = ByteArrayOutputStream()
    private var startTime = 0L
    private var durationRunnable: Runnable? = null
    private val mainHandler by lazy { android.os.Handler(android.os.Looper.getMainLooper()) }

    private var bitsPerSample = 16

    private var auto: Boolean = false
    private var options = RecorderOptions()

    private fun detectInputChannelCount(): Int {
        val stereoMin = AudioRecord.getMinBufferSize(
            44100,
            AudioFormat.CHANNEL_IN_STEREO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        return if (stereoMin > 0) 2 else 1
    }

    private fun setState(s: RecorderState) {
        state = s
        notify("stateChanged", JSObject().put("state", s.value))
    }

    private fun startDurationTimer() {
        mainHandler.removeCallbacks(durationRunnable ?: Runnable { })
        durationRunnable = object : Runnable {
            override fun run() {
                if (state == RecorderState.RECORDING) {
                    val duration = System.currentTimeMillis() - startTime
                    notify("durationChanged", JSObject().put("duration", duration.toDouble()))
                }
                mainHandler.postDelayed(this, 200)
            }
        }
        mainHandler.postDelayed(durationRunnable!!, 200)
    }

    private fun stopInternal(): Pair<JSObject?, String?> {
        if (state != RecorderState.RECORDING && state != RecorderState.PAUSED) {
            stopping.set(false)
            return Pair(null, "not recording")
        }
        setState(RecorderState.STOPPING)
        mainHandler.removeCallbacks(durationRunnable ?: Runnable { })

        try {
            audioRecord?.stop()
        } catch (_: Exception) {
        }
        audioRecord?.release()
        audioRecord = null

        return try {
            val data = bufferStream.toByteArray()
            bufferStream.reset()

            val wavFile = writeWav(data)
            val duration = System.currentTimeMillis() - startTime
            val result = JSObject()
            result.put("duration", duration.toDouble())
            result.put("mime", "audio/wav")
            result.put("uri", wavFile?.let { Uri.fromFile(it).toString() })

            if (options.returnBase64 && wavFile != null) {
                val bytes = wavFile.readBytes()
                result.put(
                    "blob",
                    android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                )
            } else {
                result.put("blob", null)
            }

            notify("audioUrlReady", result)
            setState(RecorderState.INACTIVE)
            stopping.set(false)
            Pair(result, null)
        } catch (e: Exception) {
            setState(RecorderState.ERROR)
            stopping.set(false)
            Pair(null, e.localizedMessage ?: "stop failed")
        }
    }

    private fun applyGainInPlace(buffer: ByteArray, read: Int) {
        if (bitsPerSample == 16) {
            val shortBuffer =
                ByteBuffer.wrap(buffer, 0, read).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
            val shorts = ShortArray(shortBuffer.remaining())
            shortBuffer.get(shorts)
            for (i in shorts.indices) {
                val scaled = (shorts[i] * options.gain).toInt()
                shorts[i] =
                    scaled.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
            ByteBuffer.wrap(buffer, 0, read).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                .put(shorts)
        } else {
            // leave 32-bit float untouched (gain not applied)
        }
    }

    private fun writeWav(pcm: ByteArray): File? {
        if (pcm.isEmpty()) return null
        val file = File(ctx.cacheDir, "cap-rec-${System.currentTimeMillis()}.wav")
        val totalAudioLen = pcm.size.toLong()
        val byteRate = options.sampleRate * options.channelCount * (bitsPerSample / 8)
        val totalDataLen = totalAudioLen + 36

        FileOutputStream(file).use { fos ->
            val header = ByteArray(44)
            // RIFF/WAVE header
            writeString(header, 0, "RIFF")
            writeInt(header, 4, totalDataLen.toInt())
            writeString(header, 8, "WAVE")
            writeString(header, 12, "fmt ")
            writeInt(header, 16, 16) // Subchunk1Size for PCM
            writeShort(header, 20, 1) // PCM
            writeShort(header, 22, options.channelCount.toShort())
            writeInt(header, 24, options.sampleRate)
            writeInt(header, 28, byteRate)
            writeShort(header, 32, (options.channelCount * (bitsPerSample / 8)).toShort())
            writeShort(header, 34, bitsPerSample.toShort())
            writeString(header, 36, "data")
            writeInt(header, 40, totalAudioLen.toInt())
            fos.write(header, 0, 44)
            fos.write(pcm)
        }
        return file
    }

    private fun writeInt(data: ByteArray, offset: Int, value: Int) {
        data[offset] = (value and 0xff).toByte()
        data[offset + 1] = (value shr 8 and 0xff).toByte()
        data[offset + 2] = (value shr 16 and 0xff).toByte()
        data[offset + 3] = (value shr 24 and 0xff).toByte()
    }

    private fun writeShort(data: ByteArray, offset: Int, value: Short) {
        data[offset] = (value.toInt() and 0xff).toByte()
        data[offset + 1] = (value.toInt() shr 8 and 0xff).toByte()
    }

    private fun writeString(data: ByteArray, offset: Int, value: String) {
        val bytes = value.toByteArray()
        for (i in bytes.indices) {
            data[offset + i] = bytes[i]
        }
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun start(_auto: Boolean, _options: JSObject, callback: (String?) -> Unit) {
        if (state == RecorderState.RECORDING || state == RecorderState.PAUSED) {
            callback("already recording")
            return
        }

        setState(RecorderState.INITIALIZING)

        auto = _auto == true
        setOptions(_options)

        Logger.info("options", options.toString())

        val channelConfig =
            if (options.channelCount > 1) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
        val audioFormat =
            if (options.sampleSize == 32 && Build.VERSION.SDK_INT >= 31) AudioFormat.ENCODING_PCM_32BIT else AudioFormat.ENCODING_PCM_16BIT
        val minBuffer = AudioRecord.getMinBufferSize(options.sampleRate, channelConfig, audioFormat)
        if (minBuffer <= 0) {
            setState(RecorderState.ERROR)
            callback("unable to init audio record")
            return
        }

        val audioSource = if (Build.VERSION.SDK_INT >= 31) {
            MediaRecorder.AudioSource.UNPROCESSED
        } else {
            MediaRecorder.AudioSource.MIC
        }

        audioRecord = AudioRecord.Builder()
            .setAudioSource(audioSource)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(audioFormat)
                    .setSampleRate(options.sampleRate)
                    .setChannelMask(channelConfig)
                    .build()
            )
            .setBufferSizeInBytes(minBuffer * 2)
            .build()

        bitsPerSample = if (options.sampleSize == 32 && Build.VERSION.SDK_INT >= 31) 32 else 16

        audioRecord?.audioSessionId?.let { sessionId ->
            if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(sessionId)?.enabled =
                false
            if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(sessionId)?.enabled = false
            if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(sessionId)?.enabled =
                false
        }

        bufferStream.reset()
        recordingFlag.set(true)
        paused.set(false)

        audioRecord?.startRecording()
        startTime = System.currentTimeMillis()
        startDurationTimer()
        setState(RecorderState.RECORDING)

        recordingExecutor.execute {
            val buffer = ByteArray(minBuffer)
            while (recordingFlag.get()) {
                if (paused.get()) {
                    Thread.sleep(50)
                    continue
                }
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    applyGainInPlace(buffer, read)
                    bufferStream.write(buffer, 0, read)
                }
                if (options.maxDuration > 0) {
                    val elapsed = System.currentTimeMillis() - startTime
                    if (elapsed >= options.maxDuration) {
                        if (stopping.compareAndSet(false, true)) {
                            stopInternal()
                        }
                        break
                    }
                }
            }
        }

        callback(null)
    }

    fun stop(callback: (JSObject?, String?) -> Unit) {
        if (!stopping.compareAndSet(false, true)) {
            // already stopping; let the first caller resolve
            callback(null, null)
            return
        }
        recordingFlag.set(false)
        paused.set(false)
        recordingExecutor.execute {
            val result = stopInternal()
            mainHandler.post { callback(result.first, result.second) }
        }
    }

    fun pause(callback: (String?) -> Unit) {
        if (state != RecorderState.RECORDING) {
            callback(null)
            return
        }
        paused.set(true)
        try {
            audioRecord?.stop()
        } catch (_: Exception) {
        }
        setState(RecorderState.PAUSED)
        callback(null)
    }

    fun resume(callback: (String?) -> Unit) {
        if (state != RecorderState.PAUSED) {
            callback(null)
            return
        }
        paused.set(false)
        try {
            audioRecord?.startRecording()
        } catch (_: Exception) {
        }
        setState(RecorderState.RECORDING)
        callback(null)
    }

    fun getCapabilities(): JSObject {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager

        // 1. detect sample rates
        val supportedRates = mutableSetOf(44100, 48000)
        am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)
            ?.toIntOrNull()?.let { supportedRates.add(it) }

        // 2. detect channel counts
        val inputChannels = detectInputChannelCount()
        val channelCounts = if (inputChannels >= 2) listOf(1, 2) else listOf(1)

        // 3. sample sizes (Android PCM only supports 16-bit reliably)
        val sampleSizes = listOf(16, 32)

        val ret = JSObject()
        ret.put("supported", true)
        ret.put("sampleRates", JSArray(supportedRates.toList()))
        ret.put("sampleSizes", JSArray(sampleSizes))
        ret.put("channelCounts", JSArray(channelCounts))

        return ret
    }

    fun getCurrentState(): String = state.value

    fun getOptions(): JSObject {
        val json = Gson().toJson(options)
        return JSObject(json)
    }

    fun setOptions(partial: JSObject) {
        val baseJson = JSONObject(Gson().toJson(options))
        val patchJson = JSONObject(partial.toString())
        val merged = deepMerge(baseJson, patchJson)
        options = Gson().fromJson(merged.toString(), RecorderOptions::class.java)
        bitsPerSample = if (options.sampleSize == 32 && Build.VERSION.SDK_INT >= 31) 32 else 16
    }

    fun resetOptions() {
        options = RecorderOptions()
    }

    fun setInputGain(value: Float) {
        options.gain = max(0f, value)
    }

    // helper


}
