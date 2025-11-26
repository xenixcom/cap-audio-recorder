struct RecorderOptions: Codable {

    var sampleRate: Double? = 44100
    var sampleSize: Int? = 16
    var channelCount: Int? = 1
    var autoGainControl: Bool = false
    var echoCancellation: Bool = false
    var noiseSuppression: Bool = false

    var returnBase64: Bool = false
    var format: String = "wav"
    var maxDuration: Double? = 60000

    var gain: Float = 1
    var workletUrl: String? = nil

    struct Calibration: Codable {
        var enabled: Bool = true
        var duration: Double? = 3000
    }

    struct Detection: Codable {
        var startThreshold: Double = -50
        var startDuration: Double? = 500
        var stopThreshold: Double = -60
        var stopDuration: Double? = 1000
        var maxSilenceDuration: Double? = 5000
    }

    struct DSP: Codable {
        var enabled: Bool = true
        struct Gain: Codable { var enabled: Bool = true; var gain: Double = 5 }
        struct LowPass: Codable { var enabled: Bool = false; var frequency: Double = 12000 }
        struct HighPass: Codable { var enabled: Bool = false; var frequency: Double = 100 }
        struct Compressor: Codable { var enabled: Bool = true; var threshold: Double = -24; var knee: Double = 30; var ratio: Double = 12; var attack: Double = 0.003; var release: Double = 0.25 }
        struct Limiter: Codable { var enabled: Bool = true; var threshold: Double = -1; var release: Double = 0.1 }
        struct PseudoStereo: Codable { var enabled: Bool = false; var delay: Double = 20 }

        var gain = Gain()
        var lowPassFilter = LowPass()
        var highPassFilter = HighPass()
        var compressor = Compressor()
        var limiter = Limiter()
        var pseudoStereo = PseudoStereo()
    }

    var calibration = Calibration()
    var detection = Detection()
    var dsp = DSP()
}

extension RecorderOptions {

    static var defaults: RecorderOptions { RecorderOptions() }

    static func from(jsDict: [String: Any]) -> RecorderOptions {
        let merged = deepMerge(defaults.toDictionary(), jsDict)
        do {
            let data = try JSONSerialization.data(withJSONObject: merged)
            return try JSONDecoder().decode(RecorderOptions.self, from: data)
        } catch {
            print("⚠️ RecorderOptions decode failed:", error)
            return defaults
        }
    }

    func toDictionary() -> [String: Any] {
        guard let data = try? JSONEncoder().encode(self),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return dict
    }

    static func deepMerge(_ base: [String: Any], _ partial: [String: Any]) -> [String: Any] {
        var result = base
        for (key, value) in partial {
            if let valDict = value as? [String: Any],
               let baseDict = base[key] as? [String: Any] {
                result[key] = deepMerge(baseDict, valDict)
            } else {
                result[key] = value
            }
        }
        return result
    }

    func merged(with partial: [String: Any]) -> RecorderOptions {
        let mergedDict = RecorderOptions.deepMerge(self.toDictionary(), partial)
        return RecorderOptions.from(jsDict: mergedDict)
    }
}