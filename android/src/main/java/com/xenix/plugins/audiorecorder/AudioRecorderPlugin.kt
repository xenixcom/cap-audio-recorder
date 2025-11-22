package com.xenix.plugins.audiorecorder

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.net.Uri
import com.getcapacitor.Bridge

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

    // ----- recording -----

    @PluginMethod
    fun start(call: PluginCall) {
        if (!hasMicPermission(call)) return
        val opts = call.data
        implementation.start(opts) { err ->
            if (err != null) {
                call.reject(err)
            } else {
                call.resolve()
            }
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
    fun getCurrentState(call: PluginCall) {
        call.resolve(JSObject().put("state", implementation.getCurrentState()))
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        call.resolve(implementation.getCapabilities())
    }

    @PluginMethod
    fun setInputGain(call: PluginCall) {
        val value = call.getDouble("value") ?: call.getDouble("inputGain") ?: 1.0
        implementation.setInputGain(value.toFloat())
        call.resolve()
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

    @PermissionCallback
    private fun startWithPermission(call: PluginCall) {
        if (hasMicPermission(call)) {
            start(call)
        }
    }

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
}
