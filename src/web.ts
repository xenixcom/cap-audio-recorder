import { WebPlugin } from '@capacitor/core';

import type { AudioRecorderPlugin } from './definitions';

export class AudioRecorderWeb extends WebPlugin implements AudioRecorderPlugin {
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }
}
