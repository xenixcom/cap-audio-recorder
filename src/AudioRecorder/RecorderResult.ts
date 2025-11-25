export interface RecorderResult {
  blob?: string; // base64
  duration?: number; // milliseconds
  mime?: string;
  uri?: string;
}

export interface RecorderCapabilities {
  supported?: boolean;
  sampleRates?: number[];
  sampleSizes?: number[];
  channelCounts?: number[];
}
