import AVFoundation
import Accelerate
import Capacitor
import Foundation

enum RecorderState: String {
    case inactive
    case recording
    case paused
    case initializing
    case error
    case stopping
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
    private var auto: Bool = false
    private var currentOptions: RecorderOptions = .defaults
    private let gainQueue = DispatchQueue(
        label: "com.xenix.audiorecorder.gain", qos: .userInitiated)

    var onStateChanged: ((RecorderState) -> Void)?
    var onAudioUrlReady: (([String: Any]) -> Void)?
    var onDurationChanged: ((Double) -> Void)?

    var state: RecorderState { stateValue }

    // MARK: - Private

    private func normalize(options: RecorderOptions) -> RecorderOptions {
        var opt = options
        let session = AVAudioSession.sharedInstance()

        let hwSampleRate = session.sampleRate
        let hwChannels = session.inputNumberOfChannels
        // sampleRate 不超過 hardware 支援
        if let sr = opt.sampleRate, sr > hwSampleRate {
            opt.sampleRate = hwSampleRate
        } else if opt.sampleRate == nil {
            opt.sampleRate = hwSampleRate
        }

        // channelCount 不超過 hardware 支援
        if let ch = opt.channelCount, ch > hwChannels {
            opt.channelCount = hwChannels
        } else if opt.channelCount == nil {
            opt.channelCount = hwChannels
        }

        // 可以在這裡 normalize其他屬性，例如 sampleSize 等
        #if targetEnvironment(simulator)
            if opt.sampleRate == 48000 {
                print("⚠️ Simulator does not support 48000 → fallback to 44100")
                opt.sampleRate = 44100
            }
        #endif

        return opt
    }

    private func configureSession(sampleRate: Double?) throws {
        try session.setCategory(
            .playAndRecord, mode: .measurement,
            options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
        try session.setActive(true)
        if let sampleRate {
            try session.setPreferredSampleRate(sampleRate)
        }
        try? session.setPreferredIOBufferDuration(0.01)
    }

    private func beginRecording(options: RecorderOptions) throws {
        engine = AVAudioEngine()
        guard let engine else {
            throw NSError(
                domain: "AudioRecorder", code: -4,
                userInfo: [NSLocalizedDescriptionKey: "Engine unavailable"])
        }

        /*
        let inputNode = engine.inputNode
        let inputFormat = inputNode.inputFormat(forBus: 0)
        
        let sampleRate = options.sampleRate ?? inputFormat.sampleRate
        let channels = options.channelCount ?? Int(inputFormat.channelCount)
        let bitDepth = options.sampleSize ?? 16
        */

        let session = AVAudioSession.sharedInstance()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.inputFormat(forBus: 0)

        // ---- 正確的硬體值 fallback ----
        let sampleRate = options.sampleRate ?? session.sampleRate
        let channels = options.channelCount ?? Int(session.inputNumberOfChannels)
        let bitDepth = options.sampleSize ?? 16

        let tapFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: AVAudioChannelCount(channels),
            interleaved: false
        )

        outputUrl = makeTempUrl()
        guard let outputUrl else {
            throw NSError(
                domain: "AudioRecorder", code: -5,
                userInfo: [NSLocalizedDescriptionKey: "Cannot create output file"])
        }

        file = try AVAudioFile(
            forWriting: outputUrl,
            settings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: sampleRate,
                AVNumberOfChannelsKey: channels,
                AVLinearPCMBitDepthKey: 16,   // bitDepth,
                AVLinearPCMIsFloatKey: false, // bitDepth == 32,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: !(tapFormat?.isInterleaved ?? false),
            ])

        let mixer = AVAudioMixerNode()
        self.mixer = mixer

        engine.attach(mixer)
        engine.connect(inputNode, to: mixer, format: inputFormat)
        engine.connect(mixer, to: engine.mainMixerNode, format: tapFormat)
        engine.mainMixerNode.outputVolume = 0  // keep silent monitor

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
        let gain = gainQueue.sync { self.currentOptions.gain }
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
        // let file = dir.appendingPathComponent("cap-rec-temp.wav")
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
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) {
            [weak self] _ in
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

        // if let url = outputUrl {
        //     try? FileManager.default.removeItem(at: url)
        // }

        /*
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            try? FileManager.default.removeItem(at: url)
        }
        */
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

    func start(auto: Bool, options: [String: Any], completion: @escaping (Error?) -> Void) {
        guard stateValue != .recording else {
            completion(
                NSError(
                    domain: "AudioRecorder", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Already recording"]))
            return
        }

        DispatchQueue.main.async {
            self.stateValue = .initializing
            self.auto = auto
            self.currentOptions = self.currentOptions.merged(with: options)
            self.currentOptions = self.normalize(options: self.currentOptions)

            do {
                try self.configureSession(sampleRate: self.currentOptions.sampleRate)
                try self.beginRecording(options: self.currentOptions)
                self.stateValue = .recording
                completion(nil)
            } catch {
                self.stateValue = .error
                self.cleanup()
                completion(error)
            }
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

    func stop(completion: @escaping ([String: Any]?, Error?) -> Void) {
        guard stateValue == .recording || stateValue == .paused else {
            completion(
                nil,
                NSError(
                    domain: "AudioRecorder", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Not recording"]))
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
                completion(
                    nil,
                    NSError(
                        domain: "AudioRecorder", code: -3,
                        userInfo: [NSLocalizedDescriptionKey: "Missing file URL"]))
                return
            }

            var base64: String? = nil
            if self.currentOptions.returnBase64 == true {
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
                "blob": base64 as Any,
            ]

            self.onAudioUrlReady?(result)
            self.cleanup()
            self.stateValue = .inactive
            completion(result, nil)
        }
    }

    func getCapabilities() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()

        // 实际硬体采样率
        let hwSampleRate = session.sampleRate

        // 实际麦克风通道数
        let hwChannels = session.inputNumberOfChannels

        let sampleRates: [Double] = {
            var list: [Double] = [44100, 48000]
            if !list.contains(hwSampleRate) {
                list.append(hwSampleRate)
            }
            return Array(Set(list)).sorted()
        }()

        let channelCounts: [Int] = {
            if hwChannels >= 2 { return [1, 2] }
            return [1]
        }()

        return [
            "supported": true,
            "sampleRates": sampleRates,
            "sampleSizes": [16, 32],
            "channelCounts": channelCounts,
        ]
    }

    func setInputGain(value: Float) {
        gainQueue.sync { self.currentOptions.gain = value }
    }

    public func getOptions() -> [String: Any] {
        return currentOptions.toDictionary()
    }

    public func setOptions(_options: [String: Any]) {
        currentOptions = currentOptions.merged(with: _options)
    }

    public func resetOptions() {
        currentOptions = RecorderOptions.defaults
    }
}
