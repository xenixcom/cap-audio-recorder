import Foundation

@objc public class AudioRecorder: NSObject {
    @objc public func echo(_ value: String) -> String {
        print(value)
        return value
    }
}
