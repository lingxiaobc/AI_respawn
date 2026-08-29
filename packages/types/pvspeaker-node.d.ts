declare module "@picovoice/pvspeaker-node" {
  export class PvSpeaker {
    constructor(
      sampleRate: number,
      bitsPerSample: number,
      options?: { bufferSizeSecs?: number; deviceIndex?: number },
    );
    static getAvailableDevices(): string[];
    readonly sampleRate: number;
    readonly bitsPerSample: number;
    readonly bufferSizeSecs: number;
    readonly version: string;
    readonly isStarted: boolean;
    start(): void;
    stop(): void;
    write(pcm: ArrayBuffer): number;
    flush(pcm?: ArrayBuffer): number;
    getSelectedDevice(): string;
    release(): void;
  }
}
