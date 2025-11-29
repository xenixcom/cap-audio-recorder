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
} from '../definitions';

import { defaultOptions } from './RecorderConstants';
import { RecordingFormat } from './RecorderOptions';

// ---------- types & helpers ----------

type RecorderEventMap = {
  stateChanged: StateChangedEvent;
  audioUrlReady: AudioUrlReadyEvent;
  durationChanged: DurationChangedEvent;
  error: { message: string };
};

type RecorderListener<K extends keyof RecorderEventMap> = (event: RecorderEventMap[K]) => void;

type AudioContextCtor = typeof AudioContext;

type EncodeInitMessage = {
  cmd: 'init';
  config: { channels: number; sampleRate: number; format: RecordingFormat; debug?: boolean };
};

type EncodeDataMessage = {
  cmd: 'encode';
  bufferL: Float32Array;
  bufferR?: Float32Array;
};

type EncodeFinishMessage = { cmd: 'finish' };

type EncodeDoneMessage = {
  cmd: 'done';
  blob?: Blob;
  format: RecordingFormat;
  sampleRate: number;
  channels: number;
};

type EncodeResetMessage = { cmd: 'reset' };

type EncodeWorkerMessage = EncodeInitMessage | EncodeDataMessage | EncodeFinishMessage | EncodeResetMessage;
type EncodeWorkerResponse = EncodeDoneMessage;

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  return Ctor || null;
};

const cloneOptions = (options?: RecorderOptions): RecorderOptions =>
  deepMerge({} as RecorderOptions, options || {});

const recorderProcessorUrl = new URL('./RecorderProcessor.worklet.js', import.meta.url).href;
const recorderEncodeWorkerUrl = new URL('./RecorderEncode.worker.js', import.meta.url).href;
const ENCODE_TIMEOUT_MS = 5000;

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result: any = Array.isArray(target) ? [...target] : { ...target };
  for (const key in source) {
    const sourceVal = source[key];
    const targetVal = (result as any)[key];

    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(
        (targetVal && typeof targetVal === 'object' ? targetVal : {}) as Partial<T[keyof T]>,
        sourceVal as Partial<T[keyof T]>
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export class AudioRecorder {

  private state: RecorderState = 'inactive';
  private auto: boolean = false;
  private options: RecorderOptions = cloneOptions(defaultOptions);
  private encodingFormat: RecordingFormat = 'wav';

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private encodeWorker: Worker | null = null;
  private workletModuleUrl: string | null = null;
  private workletModuleObjectUrl: string | null = null;
  private recordingObjectUrl: string | null = null;
  private startTimestamp = 0;
  private durationTimer: number | null = null;

  private events = new EventTarget();
  private listenerWrappers = new Map<keyof RecorderEventMap, Map<RecorderListener<any>, EventListener>>();

  // ----- events -----

  addEventListener<K extends keyof RecorderEventMap>(
    eventName: K,
    listener: RecorderListener<K>,
  ): void {
    const wrapper: EventListener = (event: Event) => {
      const detail = (event as CustomEvent<RecorderEventMap[K]>).detail;
      listener(detail);
    };
    const map = this.listenerWrappers.get(eventName) ?? new Map();
    map.set(listener, wrapper);
    this.listenerWrappers.set(eventName, map);
    this.events.addEventListener(eventName, wrapper);
  }

  removeEventListener<K extends keyof RecorderEventMap>(
    eventName: K,
    listener: RecorderListener<K>,
  ): void {
    const map = this.listenerWrappers.get(eventName);
    const wrapper = map?.get(listener);
    if (wrapper) {
      this.events.removeEventListener(eventName, wrapper);
      map?.delete(listener);
    }
  }

  private emitEvent<K extends keyof RecorderEventMap>(eventName: K, detail: RecorderEventMap[K]) {
    this.events.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // ----- state -----

  private setState(state: RecorderState) {
    this.state = state;
    this.emitEvent('stateChanged', { state });
  }

  // ----- timer & cleanup -----

  private startDurationTimer(maxDurationMs?: number) {
    this.clearDurationTimer();
    const tick = () => {
      if (this.state === 'recording') {
        const duration = Date.now() - this.startTimestamp;
        this.emitEvent('durationChanged', { duration });
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
    this.revokeWorkletModuleUrl();
  }

  private stopStreamTracks() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private resetRecordingState(keepRecordingUrl = false) {
    if (!keepRecordingUrl) {
      this.revokeRecordingUrl();
    }
    this.teardownEncodeWorker();
    this.clearDurationTimer();
  }

  private revokeRecordingUrl() {
    if (this.recordingObjectUrl) {
      URL.revokeObjectURL(this.recordingObjectUrl);
      this.recordingObjectUrl = null;
    }
  }

  private revokeWorkletModuleUrl() {
    if (this.workletModuleObjectUrl) {
      URL.revokeObjectURL(this.workletModuleObjectUrl);
      this.workletModuleObjectUrl = null;
    }
    this.workletModuleUrl = null;
  }

  // ----- worklet + encoding -----

  private async ensureWorkletModule(context: AudioContext, url?: string) {
    let moduleUrl = url || this.workletModuleUrl || recorderProcessorUrl;
    if (url) {
      this.workletModuleUrl = moduleUrl;
      this.workletModuleObjectUrl = null;
    } else if (!this.workletModuleUrl) {
      this.workletModuleUrl = moduleUrl;
      this.workletModuleObjectUrl = moduleUrl;
    }
    await context.audioWorklet.addModule(moduleUrl);
  }

  private getEncodingFormat(): RecordingFormat {
    const fmt = this.options?.format?.toLowerCase();
    if (fmt === 'mp3') return 'mp3';
    const mime = (this.options as any)?.mimeType?.toLowerCase();
    if (mime && (mime.includes('mp3') || mime === 'audio/mpeg')) return 'mp3';
    return 'wav';
  }

  private setupEncodeWorker(sampleRate: number, channelCount: number) {
    this.teardownEncodeWorker();
    try {
      this.encodeWorker = new Worker(recorderEncodeWorkerUrl, { type: 'module' });
      const initMessage: EncodeInitMessage = {
        cmd: 'init',
        config: {
          channels: channelCount,
          sampleRate,
          format: this.encodingFormat,
        },
      };
      this.encodeWorker.postMessage(initMessage);
    } catch (err) {
      console.error('[AudioRecorder] failed to start encode worker', err);
      this.encodeWorker = null;
    }
  }

  private async finishEncoding(
    duration: number
  ): Promise<RecorderResult> {
    if (!this.encodeWorker) {
      throw new Error('Encoder worker not available');
    }

    const result = await this.waitForEncodeResult(this.encodeWorker);
    const blob = result.blob;
    const mime = this.encodingFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const uri = blob ? URL.createObjectURL(blob) : undefined;
    this.recordingObjectUrl = uri || null;
    const base64 = blob && this.options?.returnBase64 ? await this.blobToBase64(blob) : undefined;
    return { blob: base64, duration, mime, uri };
  }

  private waitForEncodeResult(worker: Worker): Promise<EncodeWorkerResponse> {
    return new Promise<EncodeWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Encode worker timeout'));
      }, ENCODE_TIMEOUT_MS);
      const onMessage = (event: MessageEvent) => {
        const data = event.data as EncodeWorkerResponse | EncodeWorkerMessage;
        if (!data || (data as any).cmd !== 'done') return;
        cleanup();
        resolve(data as EncodeWorkerResponse);
      };
      const onError = (err: any) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        window.clearTimeout(timeout);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      const finishMessage: EncodeFinishMessage = { cmd: 'finish' };
      worker.postMessage(finishMessage);
    });
  }

  private teardownEncodeWorker() {
    if (this.encodeWorker) {
      this.encodeWorker.terminate();
      this.encodeWorker = null;
    }
  }

  private handleWorkletData(data: any) {
    if (!data || data.event !== 'data' || !Array.isArray(data.channelData)) return;
    const channels = data.channelData as Float32Array[];
    if (!this.encodeWorker) {
      this.emitEvent('error', { message: 'Encoder worker missing' });
      this.setState('error');
      return;
    }
    const message: EncodeDataMessage = {
      cmd: 'encode',
      bufferL: channels[0],
      bufferR: channels[1],
    };
    try {
      this.encodeWorker.postMessage(message);
    } catch (err) {
      console.error('[AudioRecorder] encode worker postMessage failed', err);
      this.teardownEncodeWorker();
      this.emitEvent('error', { message: 'Encode worker failed to accept data' });
      this.setState('error');
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

  // ----- capability & permission -----

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

  async isAvailable(): Promise<boolean> {
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    const hasGetUserMedia =
      hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const AudioCtx = getAudioContextCtor();
    const hasAudioWorklet = !!AudioCtx && 'audioWorklet' in AudioCtx.prototype;
    return hasGetUserMedia && !!AudioCtx && hasAudioWorklet;
  }

  async start(auto: boolean = false, options?: RecorderOptions): Promise<void> {
    if (this.state === 'recording') {
      throw new Error('already recording');
    }
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Web Audio recorder not available');
    }

    this.resetRecordingState();
    this.auto = auto;
    this.options = deepMerge(this.options, options || {});
    this.encodingFormat = this.getEncodingFormat();
    this.setState('initializing');

    const constraints: MediaStreamConstraints = {
      audio: {
        sampleRate: options?.sampleRate,
        sampleSize: options?.sampleSize,
        channelCount: options?.channelCount,
        autoGainControl: options?.autoGainControl,
        echoCancellation: options?.echoCancellation,
        noiseSuppression: options?.noiseSuppression,
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
      await this.ensureWorkletModule(audioContext, this.options?.workletUrl);
      this.setupEncodeWorker(audioContext.sampleRate, options?.channelCount || 1);
      if (!this.encodeWorker) {
        throw new Error('Failed to start encoder worker');
      }

      this.workletNode = new AudioWorkletNode(audioContext, 'recorder-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: options?.channelCount,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      });
      this.workletNode.port.onmessage = ev => this.handleWorkletData(ev.data);
      this.workletNode.port.postMessage({ event: 'gain', value: this.options.gain });

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

    try {
      const channelCount = this.options?.channelCount || 1;
      const duration = Date.now() - this.startTimestamp;
      const result = await this.finishEncoding(duration);
      this.emitEvent('audioUrlReady', result);
      return result;
    } finally {
      this.teardownAudioGraph();
      this.stopStreamTracks();
      this.resetRecordingState(true);
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

  async getCapabilities(): Promise<RecorderCapabilities> {
    const supported = await this.isAvailable();
    const constraints =
      typeof navigator !== 'undefined' && navigator.mediaDevices?.getSupportedConstraints
        ? navigator.mediaDevices.getSupportedConstraints()
        : {};
    const sampleRates = [44100, 48000];
    const sampleSizes = [16, 32];
    const channelCounts = constraints.channelCount ? [1, 2] : [1];
    return {
      supported,
      sampleRates,
      sampleSizes,
      channelCounts
    };
  }

  async getCurrentState(): Promise<{ state: RecorderState }> {
    return { state: this.state };
  }

  async setInputGain(value: number) {
    if (!Number.isFinite(value)) return;
    this.options.gain = value;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ event: 'gain', value });
    }
  }

  async getOptions(): Promise<RecorderOptions> {
    return cloneOptions(this.options);
  }

  async setOptions(value: { options: RecorderOptions }): Promise<void> {
    if (value && value.options) {
      this.options = deepMerge(this.options, value.options);
      this.encodingFormat = this.getEncodingFormat();
    }
    return;
  }

  async resetOptions(): Promise<void> {
    this.options = cloneOptions(defaultOptions);
    return;
  }
}
