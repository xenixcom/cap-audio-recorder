export type RecordingFormat = 'wav' | 'mp3';

export interface RecorderOptions {

    sampleRate?: number;
    sampleSize?: number;
    channelCount?: number;
    autoGainControl?: boolean;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;

    returnBase64?: boolean;
    format?: RecordingFormat;
    maxDuration?: number;

    gain?: number;

    workletUrl?: string;

    calibration?: {
        enabled?: boolean;
        duration?: number;
    }
    detection?: {
        startThreshold?: number;
        startDuration?: number;
        stopThreshold?: number;
        stopDuration?: number;
        maxSilenceDuration?: number;
    }
    dsp?: {
        enabled?: boolean;
        gain?: {
            enabled?: boolean;
            gain?: number;
        },
        lowPassFilter?: {
            enabled?: boolean;
            frequency?: number;
        },
        highPassFilter?: {
            enabled?: boolean;
            frequency?: number;
        }
        compressor?: {
            enabled?: boolean;
            threshold?: number;
            knee?: number;
            ratio?: number;
            attack?: number;
            release?: number;
        }
        limiter?: {
            enabled?: boolean;
            threshold?: number;
            release?: number;
        }
        pseudoStereo?: {
            enabled?: boolean;
            delay?: number;
        }
    }
}
