struct RecorderOptions2: Codable {

    struct Input: Codable {
        var sampleRate = 44100
        var sampleSize = 16
        var channelCount = 1
        var autoGainControl = false
        var echoCancellation = false
        var noiseSuppression = false
    }

    struct Output: Codable {
        var returnBase64 = true
        var mimeType = "audio/wav"
        var maxDuration = 60000
    }

    struct Calibration: Codable {
        var enabled = true
        var duration = 3000
    }

    struct Detection: Codable {
        var startThreshold = -50.0
        var startDuration = 500
        var stopThreshold = -60.0
        var stopDuration = 1000
        var maxSilenceDuration = 5000
    }

    struct DSP: Codable {
        struct Gain: Codable { var enabled = true; var gain = 5.0 }
        struct LowPass: Codable { var enabled = false; var frequency = 12000.0 }
        struct HighPass: Codable { var enabled = false; var frequency = 100.0 }
        struct Compressor: Codable { var enabled = true; var threshold = -24.0; var knee = 30.0; var ratio = 12.0; var attack = 0.003; var release = 0.25 }
        struct Limiter: Codable { var enabled = true; var threshold = -1.0; var release = 0.1 }
        struct PseudoStereo: Codable { var enabled = false; var delay = 20.0 }

        var gain = Gain()
        var lowPass = LowPass()
        var highPass = HighPass()
        var compressor = Compressor()
        var limiter = Limiter()
        var pseudoStereo = PseudoStereo()
    }

    var input = Input()
    var output = Output()
    var calibration = Calibration()
    var detection = Detection()
    var dsp = DSP()
}

extension RecorderOptions2 {

    /// 預設設定
    static var defaults: RecorderOptions2 { RecorderOptions2() }

    /// 從 JS dictionary 產生 RecorderOptions（自動 merge）
    static func from(jsDict: [String: Any]) -> RecorderOptions2 {
        let merged = deepMerge(defaults.toDictionary(), jsDict)
        do {
            let data = try JSONSerialization.data(withJSONObject: merged)
            return try JSONDecoder().decode(RecorderOptions2.self, from: data)
        } catch {
            print("⚠️ RecorderOptions decode failed:", error)
            return defaults
        }
    }

    /// struct → Dictionary
    func toDictionary() -> [String: Any] {
        guard let data = try? JSONEncoder().encode(self),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return dict
    }

    /// struct → JSON String
    func toJSONString(pretty: Bool = true) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = pretty ? [.prettyPrinted] : []
        guard let data = try? encoder.encode(self),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    /// 深度合併兩個 dictionary（遞迴）
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

    /// merge dictionary → 新的 RecorderOptions2
    func merged(with partial: [String: Any]) -> RecorderOptions2 {
        let mergedDict = RecorderOptions2.deepMerge(self.toDictionary(), partial)
        return RecorderOptions2.from(jsDict: mergedDict)
    }
}
