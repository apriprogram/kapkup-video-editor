/** Bagian sherpa-onnx-node yang dipakai Kapkup (paketnya tidak membawa deklarasi tipe). */
declare module "sherpa-onnx-node" {
  export type GeneratedAudio = { samples: Float32Array; sampleRate: number };

  export class GenerationConfig {
    constructor(options?: {
      sid?: number;
      speed?: number;
      numSteps?: number;
      silenceScale?: number;
      extra?: Record<string, number | string>;
    });
  }

  export class OfflineTts {
    constructor(config: Record<string, unknown>);
    readonly numSpeakers: number;
    readonly sampleRate: number;
    generate(request: { text: string; sid?: number; speed?: number; enableExternalBuffer?: boolean; generationConfig?: GenerationConfig }): GeneratedAudio;
  }

  export function writeWave(filename: string, wave: GeneratedAudio): boolean;
}
