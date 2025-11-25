import { RecorderState } from "./RecorderStates";
import { RecorderResult } from "./RecorderResult";

export interface StateChangedEvent {
  state: RecorderState;
}

export interface AudioUrlReadyEvent extends RecorderResult {}

export interface DurationChangedEvent {
  duration: number;
}

export interface RecorderErrorEvent {
  message: string;
}
