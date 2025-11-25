import { WebPlugin } from '@capacitor/core';

import type { 
  AudioRecorderPlugin, 
  AudioUrlReadyEvent, 
  StateChangedEvent, 
  DurationChangedEvent, 
  RecorderOptions,
  RecorderState,
  RecorderResult,
  RecorderCapabilities,
  PermissionStatus,
  RecorderErrorEvent,
} from './definitions';

import { AudioRecorder } from './AudioRecorder/AudioRecorder';

export class AudioRecorderWeb extends WebPlugin implements AudioRecorderPlugin {

  private implementation = new AudioRecorder();

  constructor() {
    super();

    this.implementation.addEventListener('stateChanged', (ev: StateChangedEvent) => {
      this.notifyListeners('stateChanged', ev);
    });

    this.implementation.addEventListener('audioUrlReady', (ev: AudioUrlReadyEvent) => {
      this.notifyListeners('audioUriReady', ev);
    });

    this.implementation.addEventListener('durationChanged', (ev: DurationChangedEvent) => {
      this.notifyListeners('durationChanged', ev);
    });   

    this.implementation.addEventListener('error', (ev: RecorderErrorEvent) => {
      this.notifyListeners('error', ev);
    });
  }

  async start(value?: { auto?: boolean; options?: RecorderOptions }): Promise<void> {
    const opts = value?.options ?? (value as RecorderOptions | undefined);
    const auto = value?.auto ?? false;
    return this.implementation.start(auto, opts);
  }

  async stop(): Promise<RecorderResult> {
    return this.implementation.stop();
  }

  async pause(): Promise<void> {
    return this.implementation.pause();
  }

  async resume(): Promise<void> {
    return this.implementation.resume();
  }

  async setInputGain(options: { gain: number } | number): Promise<void> {
    const value = typeof options === 'number' ? options : options?.gain;
    if (typeof value === 'number') {
      this.implementation.setInputGain(value);
    }
  }

  async getCurrentState(): Promise<{ state: RecorderState }> {
    return this.implementation.getCurrentState();
  }

  async getCapabilities(): Promise<RecorderCapabilities> {
    return this.implementation.getCapabilities();
  }

  async checkPermissions(): Promise<PermissionStatus> {
    return this.implementation.checkPermissions();
  }

  async requestPermissions(): Promise<PermissionStatus> {
    return this.implementation.requestPermissions();
  }

  async getOptions(): Promise<{ options: RecorderOptions }> {
    return this.implementation.getOptions();
  };
  
  async setOptions(value: { options: RecorderOptions }): Promise<void> {
    return this.implementation.setOptions(value);
  };

  async resetOptions(): Promise<void> {
    return this.implementation.resetOptions();
  }

}
