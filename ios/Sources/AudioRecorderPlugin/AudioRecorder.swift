import Foundation
import AVFoundation
import Accelerate
import Capacitor

enum RecorderState: String {
    case inactive
    case recording
    case paused
    case initializing
    case error
    case stopping
}

struct RecorderOptions {
    var sampleRate: Double?
    var sampleSize: Int?
    var channelCount: Int?
    var maxDuration: Double?
    var returnBase64: Bool
    var mimeType: String?
    var inputGain: Float

    static func from(call: CAPPluginCall) -> RecorderOptions {
        let sampleRate = call.getDouble("sampleRate")
        let sampleSize = call.getInt("sampleSize")
        let channelCount = call.getInt("channelCount")
        let maxDuration = call.getDouble("maxDuration")
        let returnBase64 = call.getBool("returnBase64") ?? false
        let mimeType = call.getString("mimeType")
        let inputGain = call.getFloat("inputGain") ?? 1
        return RecorderOptions(
            sampleRate: sampleRate,
            sampleSize: sampleSize,
            channelCount: channelCount,
            maxDuration: maxDuration,
            returnBase64: returnBase64,
            mimeType: mimeType,
            inputGain: inputGain
        )
    }
}

class AudioRecorder: NSObject {
    private let session = AVAudioSession.sharedInstance()
    private var engine: AVAudioEngine?
    private var mixer: AVAudioMixerNode?
    private var file: AVAudioFile?
    private var outputUrl: URL?
    private var stateValue: RecorderState = .inactive {
        didSet {
            onStateChanged?(stateValue)
        }
    }

    private var startDate: Date?
    private var pauseDate: Date?
    private var accumulatedPause: TimeInterval = 0
    private var durationTimer: Timer?
    private var currentOptions: RecorderOptions?
    private var inputGain: Float = 1
    private let gainQueue = DispatchQueue(label: "com.xenix.audiorecorder.gain", qos: .userInitiated)

    var onStateChanged: ((RecorderState) -> Void)?
    var onAudioUrlReady: (([String: Any]) -> Void)?
    var onDurationChanged: ((Double) -> Void)?

    var state: RecorderState { stateValue }

    func capabilities() -> [String: Any] {
        return [
            "supported": true,
            "mimeTypes": ["audio/wav"],
            "preferredMimeType": "audio/wav",
            "sampleRates": [44100, 48000],
            "sampleSizes": [16, 32],
            "channelCounts": [1, 2]
        ]
    }

    func checkPermissions(completion: @escaping (String) -> Void) {
        let permission = session.recordPermission
        switch permission {
        case .denied:
            completion("denied")
        case .undetermined:
            completion("prompt")
        case .granted:
            completion("granted")
        @unknown default:
            completion("prompt")
        }
    }

    func requestPermissions(completion: @escaping (String) -> Void) {
        session.requestRecordPermission { granted in
            DispatchQueue.main.async {
                completion(granted ? "granted" : "denied")
            }
        }
    }

    func start(options: RecorderOptions, completion: @escaping (Error?) -> Void) {
        guard stateValue != .recording else {
            completion(NSError(domain: "AudioRecorder", code: -1, userInfo: [NSLocalizedDescriptionKey: "Already recording"]))
            return
        }

        DispatchQueue.main.async {
            self.stateValue = .initializing
            self.currentOptions = options
            self.inputGain = options.inputGain

            do {
                try self.configureSession(sampleRate: options.sampleRate)
                try self.beginRecording(options: options)
                self.stateValue = .recording
                completion(nil)
            } catch {
                self.stateValue = .error
                self.cleanup()
                completion(error)
            }
        }
    }

    func stop(completion: @escaping ([String: Any]?, Error?) -> Void) {
        guard stateValue == .recording || stateValue == .paused else {
            completion(nil, NSError(domain: "AudioRecorder", code: -2, userInfo: [NSLocalizedDescriptionKey: "Not recording"]))
            return
        }
        DispatchQueue.main.async {
            self.stateValue = .stopping
            self.stopTimer()
            self.engine?.inputNode.removeTap(onBus: 0)
            self.engine?.stop()

            let durationMs = self.currentDurationMs()
            let mime = "audio/wav"

            guard let url = self.outputUrl else {
                self.cleanup()
                self.stateValue = .inactive
                completion(nil, NSError(domain: "AudioRecorder", code: -3, userInfo: [NSLocalizedDescriptionKey: "Missing file URL"]))
                return
            }

            var base64: String? = nil
            if self.currentOptions?.returnBase64 == true {
                do {
                    let data = try Data(contentsOf: url)
                    base64 = data.base64EncodedString()
                } catch {
                    // fall through without base64
                }
            }

            let result: [String: Any] = [
                "duration": durationMs,
                "mime": mime,
                "uri": url.absoluteString,
                "blob": base64 as Any
            ]

            self.onAudioUrlReady?(result)
            self.cleanup()
            self.stateValue = .inactive
            completion(result, nil)
        }
    }

    func pause(completion: @escaping (Error?) -> Void) {
        guard stateValue == .recording else {
            completion(nil)
            return
        }
        DispatchQueue.main.async {
            self.pauseDate = Date()
            self.engine?.pause()
            self.stateValue = .paused
            completion(nil)
        }
    }

    func resume(completion: @escaping (Error?) -> Void) {
        guard stateValue == .paused else {
            completion(nil)
            return
        }
        DispatchQueue.main.async {
            if let pauseDate = self.pauseDate {
                self.accumulatedPause += Date().timeIntervalSince(pauseDate)
                self.pauseDate = nil
            }
            do {
                try self.engine?.start()
                self.stateValue = .recording
                completion(nil)
            } catch {
                self.stateValue = .error
                completion(error)
            }
        }
    }

    func setInputGain(value: Float) {
        gainQueue.sync { inputGain = value }
        DispatchQueue.main.async {
            self.mixer?.outputVolume = value
        }
    }

    // MARK: - Private

    private func configureSession(sampleRate: Double?) throws {
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
        try session.setActive(true)
        if let sampleRate {
            try session.setPreferredSampleRate(sampleRate)
        }
        try? session.setPreferredIOBufferDuration(0.01)
    }

    private func beginRecording(options: RecorderOptions) throws {
        engine = AVAudioEngine()
        guard let engine else { throw NSError(domain: "AudioRecorder", code: -4, userInfo: [NSLocalizedDescriptionKey: "Engine unavailable"]) }

        let inputNode = engine.inputNode
        let inputFormat = inputNode.inputFormat(forBus: 0)

        let sampleRate = options.sampleRate ?? inputFormat.sampleRate
        let channels = options.channelCount ?? Int(inputFormat.channelCount)
        let bitDepth = options.sampleSize ?? 16

        let tapFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: AVAudioChannelCount(channels),
            interleaved: false
        )

        outputUrl = makeTempUrl()
        guard let outputUrl else { throw NSError(domain: "AudioRecorder", code: -5, userInfo: [NSLocalizedDescriptionKey: "Cannot create output file"]) }

        file = try AVAudioFile(forWriting: outputUrl, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: channels,
            AVLinearPCMBitDepthKey: bitDepth,
            AVLinearPCMIsFloatKey: bitDepth == 32,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: !(tapFormat?.isInterleaved ?? false)
        ])

        let mixer = AVAudioMixerNode()
        self.mixer = mixer
        mixer.outputVolume = inputGain

        engine.attach(mixer)
        engine.connect(inputNode, to: mixer, format: inputFormat)
        engine.connect(mixer, to: engine.mainMixerNode, format: tapFormat)
        engine.mainMixerNode.outputVolume = 0 // keep silent monitor

        installTap(node: mixer, format: tapFormat)

        engine.prepare()
        try engine.start()

        startDate = Date()
        accumulatedPause = 0
        pauseDate = nil
        startTimer(maxDurationMs: options.maxDuration)
    }

    private func installTap(node: AVAudioNode, format: AVAudioFormat?) {
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            if self.stateValue != .recording { return }
            self.applyGain(buffer: buffer)
            self.write(buffer: buffer)
        }
    }

    private func applyGain(buffer: AVAudioPCMBuffer) {
        let gain = gainQueue.sync { inputGain }
        guard let channelData = buffer.floatChannelData else { return }
        let channelCount = Int(buffer.format.channelCount)
        let frameLength = Int(buffer.frameLength)
        for channel in 0..<channelCount {
            let data = channelData[channel]
            vDSP_vsmul(data, 1, [gain], data, 1, vDSP_Length(frameLength))
        }
    }

    private func write(buffer: AVAudioPCMBuffer) {
        do {
            try file?.write(from: buffer)
        } catch {
            stateValue = .error
            stopTimer()
        }
    }

    private func makeTempUrl() -> URL? {
        let dir = FileManager.default.temporaryDirectory
        let file = dir.appendingPathComponent("cap-rec-\(UUID().uuidString).wav")
        return file
    }

    private func currentDurationMs() -> Double {
        guard let startDate else { return 0 }
        let now = stateValue == .paused ? (pauseDate ?? Date()) : Date()
        let elapsed = now.timeIntervalSince(startDate) - accumulatedPause
        return max(0, elapsed * 1000)
    }

    private func startTimer(maxDurationMs: Double?) {
        stopTimer()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.stateValue == .recording {
                let duration = self.currentDurationMs()
                self.onDurationChanged?(duration)
                if let maxDurationMs, duration >= maxDurationMs {
                    self.stop { _, _ in }
                }
            }
        }
    }

    private func stopTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }

    private func cleanup() {
        stopTimer()
        mixer?.removeTap(onBus: 0)
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        mixer = nil
        file = nil
        startDate = nil
        pauseDate = nil
        accumulatedPause = 0
        try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    }
}
