export interface AudioRecorderPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
}
