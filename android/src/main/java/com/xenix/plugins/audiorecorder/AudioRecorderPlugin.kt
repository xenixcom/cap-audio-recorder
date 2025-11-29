package com.xenix.plugins.audiorecorder

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.annotation.RequiresPermission
import androidx.core.content.ContextCompat
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

// 定義 RecorderState
enum class RecorderState(val value: String) {
    INACTIVE("inactive"),
    RECORDING("recording"),
    PAUSED("paused"),
    INITIALIZING("initializing"),
    ERROR("error"),
    STOPPING("stopping")
}

// 定義 RecordingFormat 的 Enum (放在最外層方便使用)
enum class RecordingFormat {
    WAV,
    MP3
}

/**
 * 主要的 RecorderOptions Data Class，包含所有巢狀選項。
 */
data class RecorderOptions(
    var sampleRate: Int = 44100,
    var sampleSize: Int = 16,
    var channelCount: Int = 1,
    var autoGainControl: Boolean = false,
    var echoCancellation: Boolean = false,
    var noiseSuppression: Boolean = false,
    var returnBase64: Boolean = true,
    var format: RecordingFormat = RecordingFormat.WAV,
    var maxDuration: Int = 60000,
    var gain: Float = 1.0f,
    var workletUrl: String? = null,

    // 巢狀結構，使用預設的空 Data Class 實例
    var calibration: CalibrationOptions = CalibrationOptions(),
    var detection: DetectionOptions = DetectionOptions(),
    var dsp: DspOptions = DspOptions()
) {
    // Calibration 選項的巢狀 Data Class
    data class CalibrationOptions(
        var enabled: Boolean = true,
        var duration: Int = 3000
    )

    // Detection 選項的巢狀 Data Class
    data class DetectionOptions(
        var startThreshold: Int = -50,
        var startDuration: Int = 500,
        var stopThreshold: Int = -60,
        var stopDuration: Int = 1000,
        var maxSilenceDuration: Int = 5000
    )

    // DSP 選項的巢狀 Data Class
    data class DspOptions(
        var enabled: Boolean = true,
        var gain: DspGainOptions = DspGainOptions(),
        var lowPassFilter: DspFilterOptions = DspFilterOptions(),
        var highPassFilter: DspFilterOptions = DspFilterOptions(),
        var compressor: DspCompressorOptions = DspCompressorOptions(),
        var limiter: DspLimiterOptions = DspLimiterOptions(),
        var pseudoStereo: DspPseudoStereoOptions = DspPseudoStereoOptions()
    ) {
        // DSP 子選項的通用結構
        data class DspGainOptions(var enabled: Boolean = true, var gain: Double = 5.0)
        data class DspFilterOptions(var enabled: Boolean = false, var frequency: Double = 0.0)
        data class DspCompressorOptions(
            var enabled: Boolean = false,
            var threshold: Double = -24.0,
            var knee: Double = 30.0,
            var ratio: Double = 12.0,
            var attack: Double = 0.003,
            var release: Double = 0.25
        )

        data class DspLimiterOptions(
            var enabled: Boolean = true,
            var threshold: Double = -1.0,
            var release: Double = 0.1
        )

        data class DspPseudoStereoOptions(
            var enabled: Boolean = false,
            var delay: Double = 20.0
        )
    }
}

fun deepMerge(base: JSONObject, patch: JSONObject): JSONObject {
    val result = JSONObject(base.toString())
    for (key in patch.keys()) {
        val value = patch.get(key)
        if (value is JSONObject && result.has(key) && result.get(key) is JSONObject) {
            result.put(key, deepMerge(result.getJSONObject(key), value))
        } else {
            result.put(key, value)
        }
    }
    return result
}

@CapacitorPlugin(
    name = "AudioRecorder",
    permissions = [Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO])]
)
class AudioRecorderPlugin : Plugin() {

    private lateinit var implementation: AudioRecorder

    override fun load() {
        implementation = AudioRecorder(context) { event, payload ->
            notifyListeners(event, mapUri(payload))
        }
    }

    // ----- permissions -----

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    override fun checkPermissions(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        val state = if (granted) "granted" else "prompt"
        call.resolve(JSObject().put("state", state))
    }

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    override fun requestPermissions(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            call.resolve(JSObject().put("state", "granted"))
        } else {
            call.save()
            requestPermissionForAlias("microphone", call, "permissionsCallback")
        }
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        val state = if (granted) "granted" else "denied"
        call.resolve(JSObject().put("state", state))
    }

    private fun hasMicPermission(call: PluginCall): Boolean {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            call.save()
            requestPermissionForAlias("microphone", call, "startWithPermission")
            return false
        }
        return true
    }

    // ----- recording -----

    private fun mapUri(obj: JSObject): JSObject {
        val uri = obj.getString("uri") ?: return obj
        val parsed = Uri.parse(uri)
        val path = parsed.path ?: return obj
        val localBase = bridge?.localUrl ?: return obj
        val mapped = if (path.startsWith("/")) {
            "$localBase${Bridge.CAPACITOR_FILE_START}$path"
        } else {
            "$localBase${Bridge.CAPACITOR_FILE_START}/$path"
        }
        obj.put("uri", mapped)
        return obj
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    @PluginMethod
    fun start(call: PluginCall) {
        if (!hasMicPermission(call)) return
        val auto = call.getBoolean("auto") ?: false
        val options = call.getObject("options") ?: JSObject()
        implementation.start(auto, options) { err ->
            err?.let { call.reject(err) } ?: call.resolve()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        implementation.stop { result, err ->
            if (err != null) {
                call.reject(err)
            } else {
                call.resolve(result?.let { mapUri(it) } ?: JSObject())
            }
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        implementation.pause { err ->
            if (err != null) call.reject(err) else call.resolve()
        }
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        implementation.resume { err ->
            if (err != null) call.reject(err) else call.resolve()
        }
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        call.resolve(implementation.getCapabilities())
    }

    @PluginMethod
    fun getCurrentState(call: PluginCall) {
        call.resolve(JSObject().put("state", implementation.getCurrentState()))
    }

    @PluginMethod
    fun getOptions(call: PluginCall) {
        call.resolve(implementation.getOptions())
    }

    @PluginMethod
    fun setOptions(call: PluginCall) {
        val options = call.getObject("options")
        if (options != null) {
            implementation.setOptions(options)
        }
        call.resolve()
    }

    @PluginMethod
    fun resetOptions(call: PluginCall) {
        implementation.resetOptions()
        call.resolve()
    }

    @PluginMethod
    fun setInputGain(call: PluginCall) {
        val gain = call.getDouble("value") ?: call.getDouble("gain") ?: 1.0
        implementation.setInputGain(gain.toFloat())
        call.resolve()
    }
}
