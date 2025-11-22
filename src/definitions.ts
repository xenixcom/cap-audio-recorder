import { PluginListenerHandle } from "@capacitor/core";

export type RecorderState = 'inactive' | 'recording' | 'paused' | 'initializing' | 'error' | 'stopping';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionStatus {
  state: PermissionState;
}

export interface RecorderOptions {
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  maxDuration?: number;
  returnBase64?: boolean;
  mimeType?: string;
  inputGain?: number;
  useWorklet?: boolean;
  workletUrl?: string;
}

export interface RecorderResult {
  blob?: string; // base64
  duration?: number; // milliseconds
  mime?: string;
  uri?: string;
}

export interface RecorderCapabilities {
  supported?: boolean;
  mimeTypes?: string[];
  preferredMimeType?: string;
  sampleRates?: number[];
  sampleSizes?: number[];
  channelCounts?: number[];
}

export interface StateChangedEvent {
  state: RecorderState;
}

export interface AudioUrlReadyEvent extends RecorderResult {}

export interface DurationChangedEvent {
  duration: number;
}

export interface AudioRecorderPlugin {
  
  start(options?: RecorderOptions): Promise<void>;
  stop(): Promise<RecorderResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setInputGain(options: { value: number }): Promise<void>;

  getCurrentState(): Promise<{ state: RecorderState }>;
  getCapabilities(): Promise<RecorderCapabilities>;

  checkPermissions(): Promise<PermissionStatus>;
  requestPermissions(): Promise<PermissionStatus>;

  addListener(
    eventName: 'stateChanged', 
    listenerFunc: (event: StateChangedEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'audioUriReady', 
    listenerFunc: (event: AudioUrlReadyEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'durationChanged', 
    listenerFunc: (event: DurationChangedEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener( // generic fallback
    eventName: string, 
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
