/// <reference lib="dom" />

import type {
  AudioUrlReadyEvent,
  PermissionState,
  PermissionStatus,
  RecorderCapabilities,
  RecorderState,
  RecorderResult,
  DurationChangedEvent,
  RecorderOptions,
  StateChangedEvent,
} from './definitions';

type RecorderEventMap = {
  stateChanged: StateChangedEvent;
  audioUrlReady: AudioUrlReadyEvent;
  durationChanged: DurationChangedEvent;
};

type RecorderListener<K extends keyof RecorderEventMap> = (event: RecorderEventMap[K]) => void;

type AudioContextCtor = typeof AudioContext;

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  return Ctor || null;
};

const WORKLET_NAME = 'processor-worklet';
const DEFAULT_BITS_PER_SAMPLE = 16;


export class AudioRecorder {

  private state: RecorderState = 'inactive';

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private recordedBuffers: Float32Array[][] = [];
  private totalSamples = 0;
  private workletModuleUrl: string | null = null;
  private startTimestamp = 0;
  private durationTimer: number | null = null;

  private options: RecorderOptions | undefined;
  private inputGain = 1;

  private listeners = new Map<keyof RecorderEventMap, Set<RecorderListener<any>>>();

  // ----- events -----

  addEventListener<K extends keyof RecorderEventMap>(
    eventName: K,
    listener: RecorderListener<K>,
  ): void {
    const set = this.listeners.get(eventName) ?? new Set<RecorderListener<K>>();
    set.add(listener);
    this.listeners.set(eventName, set);
  }

  removeEventListener<K extends keyof RecorderEventMap>(
    eventName: K,
    listener: RecorderListener<K>,
  ): void {
    this.listeners.get(eventName)?.delete(listener);
  }

  private emit<K extends keyof RecorderEventMap>(eventName: K, event: RecorderEventMap[K]) {
    const set = this.listeners.get(eventName);
    if (!set || !set.size) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (e) {
        console.error('[AudioRecorder] listener error', e);
      }
    }
  }

  // ----- state -----

  private setState(state: RecorderState) {
    this.state = state;
    this.emit('stateChanged', { state });
  }

  getState(): RecorderState {
    return this.state;
  }

  // ----- capability & permission -----

  async isAvailable(): Promise<boolean> {
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    const hasGetUserMedia =
      hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const AudioCtx = getAudioContextCtor();
    const hasAudioWorklet = !!AudioCtx && 'audioWorklet' in AudioCtx.prototype;
    return hasGetUserMedia && !!AudioCtx && hasAudioWorklet;
  }

  async getCurrentState (): Promise<{ state: RecorderState }> {
    return { state: this.state };
  }

  async getCapabilities(): Promise<RecorderCapabilities> {
    const supported = await this.isAvailable();
    const sampleRates = [44100, 48000];
    const sampleSizes = [16, 32];
    const channelCounts = [1, 2];
    const mimeTypes = ['audio/wav'];
    const preferredMimeType = 'audio/wav';

    return { supported, mimeTypes, preferredMimeType, sampleRates, sampleSizes, channelCounts };
  }

  async checkPermissions(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      return { state: 'prompt' } as PermissionStatus;
    }
    try {
      const status = await (navigator.permissions as any).query({ name: 'microphone' });
      const state = status.state as PermissionState;
      return { state } as PermissionStatus;
    } catch {
      return { state: 'prompt' } as PermissionStatus;
    }
  }

  async requestPermissions(): Promise<PermissionStatus> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return { state: 'granted' } as PermissionStatus;
    } catch {
      return { state: 'denied' } as PermissionStatus;
    }
  }

  // ----- start / stop / pause / resume -----

  async start(options?: RecorderOptions): Promise<void> {
    if (this.state === 'recording') {
      throw new Error('already recording');
    }
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Web Audio recorder not available');
    }

    this.resetRecordingState();
    this.options = options;
    this.setState('initializing');

    const channelCount = options?.channelCount ?? 1;
    const constraints: MediaStreamConstraints = {
      audio: {
        sampleRate: options?.sampleRate,
        sampleSize: options?.sampleSize,
        channelCount: options?.channelCount,
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false, 
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;

      const AudioCtx = getAudioContextCtor();
      if (!AudioCtx) {
        throw new Error('AudioContext unavailable');
      }

      const audioContext = new AudioCtx({ sampleRate: options?.sampleRate });
      this.audioContext = audioContext;

      await audioContext.resume();
      await this.ensureWorkletModule(audioContext, options?.workletUrl);
      this.inputGain = typeof options?.inputGain === 'number' ? options.inputGain : 1;

      this.workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      });
      this.workletNode.port.onmessage = ev => this.handleWorkletData(ev.data);
      this.workletNode.port.postMessage({ event: 'gain', value: this.inputGain });

      this.sourceNode = audioContext.createMediaStreamSource(stream);

      this.sourceNode.connect(this.workletNode);

      this.startTimestamp = Date.now();
      this.startDurationTimer(options?.maxDuration);
      this.setState('recording');
    } catch (err) {
      this.stopStreamTracks();
      this.teardownAudioGraph();
      this.resetRecordingState();
      this.setState('error');
      throw err;
    }
  }

  async stop(): Promise<RecorderResult> {
    if (this.state !== 'recording' && this.state !== 'paused') {
      throw new Error('not recording');
    }
    if (!this.audioContext) {
      throw new Error('audio context missing');
    }

    this.setState('stopping');
    this.clearDurationTimer();

    try {
      await this.audioContext.suspend();
    } catch {
      // ignore
    }

    const sampleRate = this.audioContext.sampleRate || this.options?.sampleRate || 44100;

    try {
      const channelCount = Math.max(1, this.recordedBuffers.length || this.options?.channelCount || 1);
      const bitsPerSample = this.options?.sampleSize || DEFAULT_BITS_PER_SAMPLE;

      const wavBlob = this.buildWavBlob(sampleRate, channelCount, bitsPerSample);
      const duration = Date.now() - this.startTimestamp;
      const uri = wavBlob ? URL.createObjectURL(wavBlob) : undefined;
      const mime = wavBlob ? 'audio/wav' : undefined;

      let blobBase64: string | undefined = undefined;
      if (wavBlob && this.options?.returnBase64) {
        blobBase64 = await this.blobToBase64(wavBlob);
      }

      const result: RecorderResult = { blob: blobBase64, duration, mime, uri };
      this.emit('audioUrlReady', result);
      return result;
    } finally {
      this.teardownAudioGraph();
      this.stopStreamTracks();
      this.resetRecordingState();
      this.setState('inactive');
    }
  }

  async pause(): Promise<void> {
    if ((this.state !== 'recording' && this.state !== 'paused') || !this.audioContext) return;
    if (this.state === 'paused') return;
    await this.audioContext.suspend();
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused' || !this.audioContext) return;
    await this.audioContext.resume();
    this.startDurationTimer(this.options?.maxDuration);
    this.setState('recording');
  }

  // ----- timer & cleanup -----

  private startDurationTimer(maxDurationMs?: number) {
    this.clearDurationTimer();
    const tick = () => {
      if (this.state === 'recording') {
        const duration = Date.now() - this.startTimestamp;
        this.emit('durationChanged', { duration });
        if (maxDurationMs && duration >= maxDurationMs) {
          this.stop().catch(e => console.error('[AudioRecorder] auto stop error', e));
          return;
        }
      }
      this.durationTimer = window.setTimeout(tick, 200);
    };
    this.durationTimer = window.setTimeout(tick, 200);
  }

  private clearDurationTimer() {
    if (this.durationTimer != null) {
      window.clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private teardownAudioGraph() {
    this.workletNode?.port?.close();
    this.workletNode?.disconnect();
    this.workletNode = null;

    this.sourceNode?.disconnect();
    this.sourceNode = null;

    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }

  private stopStreamTracks() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private resetRecordingState() {
    this.recordedBuffers = [];
    this.totalSamples = 0;
    this.clearDurationTimer();
    this.options = undefined;
    this.inputGain = 1;
  }

  // ----- worklet + encoding -----

  private async ensureWorkletModule(context: AudioContext, url?: string) {
    const moduleUrl = url || this.workletModuleUrl || this.createDefaultWorkletUrl();
    this.workletModuleUrl = moduleUrl;
    await context.audioWorklet.addModule(moduleUrl);
  }

  private createDefaultWorkletUrl(): string {
    const processor = `
      class RecorderProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.gain = 1;
          this.port.onmessage = event => {
            const data = event.data;
            if (data && data.event === 'gain' && Number.isFinite(data.value)) {
              this.gain = data.value;
            }
          };
        }
        process(inputs) {
          const input = inputs[0];
          if (!input || input.length === 0) return true;
          const channelData = input.map(channel => {
            const copy = channel.slice();
            if (this.gain !== 1) {
              for (let i = 0; i < copy.length; i++) {
                copy[i] *= this.gain;
              }
            }
            return copy;
          });
          this.port.postMessage({ event: 'data', channelData });
          return true;
        }
      }
      registerProcessor('${WORKLET_NAME}', RecorderProcessor);
    `;
    const blob = new Blob([processor], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  private handleWorkletData(data: any) {
    if (!data || data.event !== 'data' || !Array.isArray(data.channelData)) return;
    const channels = data.channelData as Float32Array[];
    if (!this.recordedBuffers.length) {
      this.recordedBuffers = channels.map(() => []);
    }
    channels.forEach((chunk, idx) => {
      const safeCopy = new Float32Array(chunk);
      this.recordedBuffers[idx].push(safeCopy);
    });
    this.totalSamples += channels[0]?.length || 0;
  }

  private mergeChannelBuffers(buffers: Float32Array[]): Float32Array {
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    buffers.forEach(b => {
      result.set(b, offset);
      offset += b.length;
    });
    return result;
  }

  private buildWavBlob(sampleRate: number, channelCount: number, bitsPerSample: number): Blob | null {
    if (!this.recordedBuffers.length || this.totalSamples === 0) {
      return null;
    }

    const mergedChannels = this.recordedBuffers.map(buffers => this.mergeChannelBuffers(buffers));
    const alignedChannels = mergedChannels.slice(0, channelCount);
    while (alignedChannels.length < channelCount) {
      alignedChannels.push(new Float32Array(this.totalSamples));
    }

    const bytesPerSample = bitsPerSample === 32 ? 4 : 2;
    const blockAlign = channelCount * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const sampleFrames = alignedChannels[0].length;
    const dataSize = sampleFrames * channelCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    const isFloat = bitsPerSample === 32;
    view.setUint16(20, isFloat ? 3 : 1, true); // PCM or IEEE float
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < sampleFrames; i++) {
      for (let c = 0; c < channelCount; c++) {
        const sample = alignedChannels[c][i] ?? 0;
        const s = Math.max(-1, Math.min(1, sample));
        if (isFloat) {
          view.setFloat32(offset, s, true);
          offset += 4;
        } else {
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          offset += 2;
        }
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  setInputGain(value: number) {
    if (!Number.isFinite(value)) return;
    this.inputGain = value;
    if (this.options) {
      this.options.inputGain = value;
    }
    if (this.workletNode) {
      this.workletNode.port.postMessage({ event: 'gain', value });
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64 = result.split(',')[1] || '';
          resolve(base64);
        } else {
          reject(new Error('Failed to read blob as base64'));
        }
      };
      reader.onerror = err => reject(err);
      reader.readAsDataURL(blob);
    });
  }
}
