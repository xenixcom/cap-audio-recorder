import AVFoundation
import Capacitor
import Foundation

@objc(AudioRecorderPlugin)
public class AudioRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioRecorderPlugin"
    public let jsName = "AudioRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setInputGain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetOptions", returnType: CAPPluginReturnPromise),
    ]

    private let implementation = AudioRecorder()

    private func withPortableUri(result: [String: Any]) -> [String: Any] {
        guard
            let uriString = result["uri"] as? String,
            let url = URL(string: uriString),
            let portable = bridge?.portablePath(fromLocalURL: url)
        else {
            return result
        }
        var updated = result
        updated["uri"] = portable.absoluteString
        return updated
    }

    public override func load() {
        implementation.onStateChanged = { [weak self] state in
            self?.notifyListeners("stateChanged", data: ["state": state.rawValue])
        }
        implementation.onAudioUrlReady = { [weak self] result in
            let mapped = self?.withPortableUri(result: result) ?? result
            self?.notifyListeners("audioUrlReady", data: mapped)
        }
        implementation.onDurationChanged = { [weak self] duration in
            self?.notifyListeners("durationChanged", data: ["duration": duration])
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        implementation.checkPermissions { status in
            call.resolve(["state": status])
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        implementation.requestPermissions { status in
            call.resolve(["state": status])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let auto = call.getBool("auto") ?? false
        let options = call.getObject("options") ?? [:]
        implementation.start(auto: auto, options: options) { error in
            if let error = error {
                call.reject("start failed: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        implementation.pause { error in
            if let error = error {
                call.reject("pause failed: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        implementation.resume { error in
            if let error = error {
                call.reject("resume failed: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        implementation.stop { result, error in
            if let error = error {
                call.reject("stop failed: \(error.localizedDescription)")
            } else {
                let mapped = result.flatMap { self.withPortableUri(result: $0) } ?? [:]
                call.resolve(mapped)
            }
        }
    }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve(implementation.getCapabilities())
    }

    @objc func getCurrentState(_ call: CAPPluginCall) {
        call.resolve(["state": implementation.state.rawValue])
    }

    @objc func setInputGain(_ call: CAPPluginCall) {
        let value = call.getFloat("gain") ?? 1
        implementation.setInputGain(value: value)
        call.resolve()
    }

    @objc func getOptions(_ call: CAPPluginCall) {
        let options = implementation.getOptions()
        call.resolve(["options": options])
    }

    @objc func setOptions(_ call: CAPPluginCall) {
        let options = call.getObject("options") ?? [:]
        implementation.setOptions(_options: options)
        call.resolve()
    }

    @objc func resetOptions(_ call: CAPPluginCall) {
        implementation.resetOptions()
        call.resolve()
    }
}
