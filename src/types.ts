export type TransitionType = "none" | "fade" | "crossfade";

export type OutputFormat = "mp4" | "webm";

export type OutputPreset = "original" | "1080p" | "720p" | "480p";

export type AspectMode = "fit" | "fill" | "original";

export type FpsMode = "source" | "24" | "30" | "60";

export interface ClipMetadata {
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string | null;
}

export interface Clip {
  id: string;
  file: File;
  sourceUrl: string;
  name: string;
  size: number;
  mimeType: string;
  metadata: ClipMetadata;
  metadataAvailable: boolean;
  sourceSlot?: number;
  trimStart: number;
  trimEnd: number;
  muted: boolean;
  transitionToNext: TransitionType;
}

export interface OutputSettings {
  filename: string;
  format: OutputFormat;
  preset: OutputPreset;
  aspectMode: AspectMode;
  fps: FpsMode;
  quality: "best" | "balanced" | "small";
  normalizeAudio: boolean;
}

export interface ProcessingState {
  active: boolean;
  stage: string;
  progress: number | null;
  elapsedMs: number;
  canCancel: boolean;
}

export interface MergeResult {
  blob: Blob;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  size: number;
}

export interface EngineCapabilities {
  formats: OutputFormat[];
  videoCodecs: Record<OutputFormat, string[]>;
  audioCodecs: Record<OutputFormat, string[]>;
}
