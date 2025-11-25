import { RecorderOptions } from './RecorderOptions';

export const defaultOptions: RecorderOptions = {

    sampleRate: 44100,
    sampleSize: 16,
    channelCount: 1,
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,

    returnBase64: true,
    format: 'wav',
    maxDuration: 60000,
    gain: 1,

    workletUrl: '',

    calibration: {
        enabled: true,
        duration: 3000,
    },
    detection: {
        startThreshold: -50,
        startDuration: 500,
        stopThreshold: -60,
        stopDuration: 1000,
        maxSilenceDuration: 5000,
    },
    dsp: {
        gain: {
            enabled: true,
            gain: 5,
        },
        lowPassFilter: {
            enabled: false,
            frequency: 12000,
        },
        highPassFilter: {
            enabled: false,
            frequency: 100,
        },
        compressor: {
            enabled: true,
            threshold: -24,
            knee: 30,
            ratio: 12,
            attack: 0.003,
            release: 0.25,
        },
        limiter: {
            enabled: true,
            threshold: -1,
            release: 0.1,
        },
        pseudoStereo: {
            enabled: false,
            delay: 20,
        }
    }
}; 
