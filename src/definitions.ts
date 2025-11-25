import { PluginListenerHandle } from "@capacitor/core";
import { RecorderState, PermissionStatus } from "./AudioRecorder/RecorderStates";
import { RecorderOptions } from "./AudioRecorder/RecorderOptions";
import { RecorderResult, RecorderCapabilities } from "./AudioRecorder/RecorderResult";
import { StateChangedEvent, AudioUrlReadyEvent, DurationChangedEvent, RecorderErrorEvent } from "./AudioRecorder/RecorderEvents";

export * from './AudioRecorder/RecorderStates';
export * from './AudioRecorder/RecorderOptions';
export * from './AudioRecorder/RecorderResult';
export * from './AudioRecorder/RecorderEvents';

export interface AudioRecorderPlugin {

  checkPermissions(): Promise<PermissionStatus>;
  requestPermissions(): Promise<PermissionStatus>;
  
  start(value: { auto?: boolean; options?: RecorderOptions }): Promise<void>;
  stop(): Promise<RecorderResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;

  getCapabilities(): Promise<RecorderCapabilities>;
  getCurrentState(): Promise<{ state: RecorderState }>;
  setInputGain(value: { gain: number }): Promise<void>;
  getOptions(): Promise<{ options: RecorderOptions }>;
  setOptions(value: { options: RecorderOptions }): Promise<void>;
  resetOptions(): Promise<void>;

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

  addListener(
    eventName: 'error',
    listenerFunc: (event: RecorderErrorEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener( // generic fallback
    eventName: string, 
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
