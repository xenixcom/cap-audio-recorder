declare const registerProcessor: (name: string, processorCtor: any) => void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

class RecorderProcessor extends AudioWorkletProcessor {
  private gain = 1;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.event === 'gain' && Number.isFinite(data.value)) {
        this.gain = data.value;
      }
    };
  }

  process(inputs: Float32Array[][]) {
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

registerProcessor('recorder-processor', RecorderProcessor);

export {};
