import Foundation
import Capacitor
import AVFoundation

@objc(AudioRecorderPlugin)
public class AudioRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioRecorderPlugin"
    public let jsName = "AudioRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setInputGain", returnType: CAPPluginReturnPromise)
    ]

    private let implementation = AudioRecorder()

    public override func load() {
        implementation.onStateChanged = { [weak self] state in
            self?.notifyListeners("stateChanged", data: ["state": state.rawValue])
        }
        implementation.onAudioUrlReady = { [weak self] result in
            let mapped = self?.withPortableUri(result: result) ?? result
            self?.notifyListeners("audioUriReady", data: mapped)
        }
        implementation.onDurationChanged = { [weak self] duration in
            self?.notifyListeners("durationChanged", data: ["duration": duration])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let options = RecorderOptions.from(call: call)
        implementation.start(options: options) { error in
            if let error = error {
                call.reject("start failed: \(error.localizedDescription)")
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

    @objc func getCurrentState(_ call: CAPPluginCall) {
        call.resolve(["state": implementation.state.rawValue])
    }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve(implementation.capabilities())
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

    @objc func setInputGain(_ call: CAPPluginCall) {
        let value = call.getFloat("value") ?? 1
        implementation.setInputGain(value: value)
        call.resolve()
    }

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
}
