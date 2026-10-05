import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type {
  Clip,
  ClipMetadata,
  EngineCapabilities,
  MergeResult,
  OutputPreset,
  OutputSettings,
  TransitionType,
} from "@/types";
import { sanitizeOutputFileName } from "@/utils/format";

const CORE_VERSION = "0.12.6";

const PRESET_DIMENSIONS: Record<Exclude<OutputPreset, "original">, { width: number; height: number }> = {
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  "480p": { width: 854, height: 480 },
};

interface MergeCallbacks {
  onStage: (stage: string) => void;
  onProgress: (progress: number | null) => void;
  onClipMetadata?: (clipId: string, metadata: ClipMetadata) => void;
}

const qualityToCrf = (quality: OutputSettings["quality"], format: OutputSettings["format"]): string => {
  if (format === "webm") {
    if (quality === "best") return "27";
    if (quality === "small") return "34";
    return "31";
  }

  if (quality === "best") return "19";
  if (quality === "small") return "25";
  return "22";
};

const buildScaleFilter = (mode: OutputSettings["aspectMode"], width: number, height: number): string => {
  if (mode === "fill") {
    return [
      `scale='if(gt(a,${width}/${height}),-2,${width})':'if(gt(a,${width}/${height}),${height},-2)'`,
      `crop=${width}:${height}`,
      "setsar=1",
    ].join(",");
  }

  return [
    `scale='if(gt(a,${width}/${height}),${width},-2)':'if(gt(a,${width}/${height}),-2,${height})'`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "setsar=1",
  ].join(",");
};

const buildTargetResolution = (clips: Clip[], preset: OutputPreset): { width: number; height: number } => {
  if (preset !== "original") {
    return PRESET_DIMENSIONS[preset];
  }

  const width = Math.max(...clips.map((clip) => clip.metadata.width || 1));
  const height = Math.max(...clips.map((clip) => clip.metadata.height || 1));
  const normalizedWidth = Math.max(2, Math.floor(width / 2) * 2);
  const normalizedHeight = Math.max(2, Math.floor(height / 2) * 2);
  return { width: normalizedWidth, height: normalizedHeight };
};

const getExtension = (name: string): string => name.split(".").pop()?.toLowerCase() ?? "";

export class VideoProcessingService {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private logBuffer: string[] = [];
  private progressHandler: ((progress: number) => void) | null = null;

  readonly capabilities: EngineCapabilities = {
    formats: ["mp4", "webm"],
    videoCodecs: {
      mp4: ["libx264"],
      webm: ["libvpx-vp9"],
    },
    audioCodecs: {
      mp4: ["aac"],
      webm: ["libopus"],
    },
  };

  async ensureLoaded(onStage?: (stage: string) => void): Promise<void> {
    if (this.loaded) return;

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadEngine(onStage).catch((error: unknown) => {
        this.loadingPromise = null;
        throw error;
      });
    }

    await this.loadingPromise;
  }

  private async probeVideoMetadata(file: File): Promise<ClipMetadata> {
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) {
      throw new Error("Video engine is not available to inspect this file.");
    }

    const extension = getExtension(file.name) || "mp4";
    const inputName = `probe_${crypto.randomUUID()}.${extension}`;
    this.logBuffer = [];

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      try {
        await ffmpeg.exec(["-i", inputName]);
      } catch {
        // FFmpeg exits non-zero for an input-only probe; stream details are in its log.
      }
    } finally {
      await this.safeDelete(inputName);
    }

    const log = this.logBuffer.join("\n");
    const durationMatch = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/i);
    const videoStream = log.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/i);
    if (!durationMatch || !videoStream) {
      throw new Error("The video stream could not be identified by the local video engine.");
    }

    const duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
    const width = Number(videoStream[1]);
    const height = Number(videoStream[2]);
    if (!Number.isFinite(duration) || duration <= 0 || !width || !height) {
      throw new Error("The video has invalid duration or resolution metadata.");
    }

    return { duration, width, height, thumbnailUrl: null };
  }

  async mergeClips(
    inputClips: Clip[],
    settings: OutputSettings,
    callbacks: MergeCallbacks,
    signal?: AbortSignal
  ): Promise<MergeResult> {
    if (!inputClips.length) {
      throw new Error("Please add at least one clip before merging.");
    }

    await this.ensureLoaded(callbacks.onStage);

    const clips: Clip[] = [];
    for (let index = 0; index < inputClips.length; index += 1) {
      const clip = inputClips[index];
      if (clip.metadataAvailable) {
        clips.push(clip);
        continue;
      }

      callbacks.onStage(`Inspecting clip ${index + 1} of ${inputClips.length}`);
      const metadata = await this.probeVideoMetadata(clip.file);
      callbacks.onClipMetadata?.(clip.id, metadata);
      clips.push({
        ...clip,
        metadata,
        metadataAvailable: true,
        trimEnd: clip.trimEnd > 0 ? clip.trimEnd : metadata.duration,
      });
    }

    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) {
      throw new Error("Video engine is not available.");
    }

    if (clips.some((clip) => clip.transitionToNext !== "none")) {
      callbacks.onStage("Transitions are currently disabled for reliability. Using clean cuts.");
    }

    callbacks.onStage("Preparing clips");
    callbacks.onProgress(null);
    this.logBuffer = [];

    const targetResolution = buildTargetResolution(clips, settings.preset);
    const fpsFilter = settings.fps === "source" ? "" : `,fps=${settings.fps}`;
    const scaleFilter = buildScaleFilter(settings.aspectMode, targetResolution.width, targetResolution.height);
    const outputExtension = settings.format;
    const outputName = sanitizeOutputFileName(settings.filename, outputExtension);

    const inputNames: string[] = [];
    const hasAudioFlags: boolean[] = [];
    const cleanupPaths = new Set<string>();

    const onAbort = () => {
      this.cancel();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      this.progressHandler = (value) => {
        callbacks.onProgress(value);
      };

      for (let index = 0; index < clips.length; index += 1) {
        callbacks.onStage(`Preparing clip ${index + 1} of ${clips.length}`);
        callbacks.onProgress(null);
        const clip = clips[index];
        const ext = clip.name.split(".").pop()?.toLowerCase() || "mp4";
        const inputName = `input_${index}.${ext}`;
        inputNames.push(inputName);
        cleanupPaths.add(inputName);
        await ffmpeg.writeFile(inputName, await fetchFile(clip.file));
        hasAudioFlags.push(await this.probeHasAudio(inputName));
      }

      callbacks.onStage("Checking clip compatibility");
      const directConcatResult = await this.tryDirectConcat({
        clips,
        settings,
        inputNames,
        outputName,
      });

      if (directConcatResult) {
        cleanupPaths.add(outputName);
        callbacks.onStage("Finalizing movie");
        return {
          blob: directConcatResult,
          fileName: outputName,
          width: clips[0]?.metadata.width || targetResolution.width,
          height: clips[0]?.metadata.height || targetResolution.height,
          duration: clips.reduce((sum, clip) => sum + Math.max(0, clip.trimEnd - clip.trimStart), 0),
          size: directConcatResult.size,
        };
      }

      const filterParts: string[] = [];
      const concatInputs: string[] = [];

      for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index];
        const clipDuration = Math.max(0.05, clip.trimEnd - clip.trimStart);
        const normalizedTransition = this.normalizeTransition(clip.transitionToNext);

        const videoFilter = [
          `[${index}:v]trim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)}`,
          "setpts=PTS-STARTPTS",
          scaleFilter,
          `format=${settings.format === "mp4" ? "yuv420p" : "yuv420p"}`,
          `${settings.normalizeAudio ? "eq=contrast=1.0:brightness=0.0:saturation=1.0" : "null"}${fpsFilter}`,
          `settb=AVTB[v${index}]`,
        ].join(",");

        filterParts.push(videoFilter);

        if (clip.muted || !hasAudioFlags[index]) {
          filterParts.push(
            `anullsrc=r=48000:cl=stereo,atrim=duration=${clipDuration.toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`
          );
        } else {
          const audioFilters = [
            `[${index}:a]atrim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)}`,
            "asetpts=PTS-STARTPTS",
            "aresample=48000",
            "aformat=sample_fmts=fltp:channel_layouts=stereo",
          ];

          if (settings.normalizeAudio) {
            audioFilters.push("dynaudnorm=f=150:g=31");
          }

          filterParts.push(`${audioFilters.join(",")}[a${index}]`);
        }

        if (normalizedTransition !== "none" && index < clips.length - 1) {
          callbacks.onStage(
            `Transition ${index + 1} set to ${normalizedTransition}; clean cut rendering keeps stability for browser mode.`
          );
        }

        concatInputs.push(`[v${index}][a${index}]`);
      }

      filterParts.push(`${concatInputs.join("")}concat=n=${clips.length}:v=1:a=1[vout][aout]`);

      const command = [
        ...inputNames.flatMap((name) => ["-i", name]),
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
      ];

      if (settings.format === "webm") {
        command.push(
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "0",
          "-crf",
          qualityToCrf(settings.quality, settings.format),
          "-c:a",
          "libopus",
          "-deadline",
          "good"
        );
      } else {
        command.push(
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          qualityToCrf(settings.quality, settings.format),
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart"
        );
      }

      command.push("-shortest", outputName);

      callbacks.onStage("Merging video streams");
      callbacks.onProgress(0);

      await ffmpeg.exec(command);
      callbacks.onStage("Finalizing movie");

      const outputData = await ffmpeg.readFile(outputName);
      cleanupPaths.add(outputName);
      const uint8 = outputData instanceof Uint8Array ? outputData : new Uint8Array();
      const outputBuffer = uint8.buffer.slice(
        uint8.byteOffset,
        uint8.byteOffset + uint8.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([outputBuffer], {
        type: settings.format === "mp4" ? "video/mp4" : "video/webm",
      });

      return {
        blob,
        fileName: outputName,
        width: targetResolution.width,
        height: targetResolution.height,
        duration: clips.reduce((sum, clip) => sum + Math.max(0, clip.trimEnd - clip.trimStart), 0),
        size: blob.size,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("Processing cancelled by user.");
      }

      const message = error instanceof Error ? error.message : "Unknown video processing error";
      if (message.toLowerCase().includes("memory")) {
        throw new Error("Not enough browser memory to process this project. Try fewer clips or a lower preset.");
      }

      throw new Error("This video set could not be processed. Try converting clips to MP4 or WebM and try again.");
    } finally {
      callbacks.onProgress(null);
      this.progressHandler = null;
      for (const path of cleanupPaths) {
        await this.safeDelete(path);
      }
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async tryDirectConcat(args: {
    clips: Clip[];
    settings: OutputSettings;
    inputNames: string[];
    outputName: string;
  }): Promise<Blob | null> {
    const { clips, settings, inputNames, outputName } = args;
    if (!this.ffmpeg) return null;

    const allUntouched = clips.every(
      (clip) =>
        clip.trimStart <= 0.01 &&
        Math.abs(clip.trimEnd - clip.metadata.duration) <= 0.03 &&
        !clip.muted &&
        clip.transitionToNext === "none"
    );
    const strictOriginalSettings =
      settings.preset === "original" &&
      settings.aspectMode === "original" &&
      settings.fps === "source" &&
      !settings.normalizeAudio;
    const extension = settings.format;
    const allSameContainer = clips.every((clip) => getExtension(clip.name) === extension);
    const sameDimensions = clips.every(
      (clip) =>
        clip.metadata.width === clips[0].metadata.width && clip.metadata.height === clips[0].metadata.height
    );

    if (!allUntouched || !strictOriginalSettings || !allSameContainer || !sameDimensions) {
      return null;
    }

    const concatFile = "concat_list.txt";
    const listText = inputNames.map((name) => `file '${name.replace(/'/g, "'\\''")}'`).join("\n");

    try {
      await this.ffmpeg.writeFile(concatFile, new TextEncoder().encode(listText));
      await this.ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputName]);
      const output = await this.ffmpeg.readFile(outputName);
      const data = output instanceof Uint8Array ? output : new Uint8Array();
      const outBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      return new Blob([outBuffer], {
        type: settings.format === "mp4" ? "video/mp4" : "video/webm",
      });
    } catch {
      return null;
    } finally {
      await this.safeDelete(concatFile);
    }
  }

  cancel(): void {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loaded = false;
    this.loadingPromise = null;
  }

  private async loadEngine(onStage?: (stage: string) => void): Promise<void> {
    onStage?.("Preparing video engine...");

    const baseURLs = [
      `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
    ];
    let lastError: unknown;

    for (const baseURL of baseURLs) {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => {
        this.logBuffer.push(message);
        if (this.logBuffer.length > 150) {
          this.logBuffer.shift();
        }
      });

      ffmpeg.on("progress", ({ progress }) => {
        const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(progress, 1)) : 0;
        this.progressHandler?.(safeProgress);
      });

      try {
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript");
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm");
        await ffmpeg.load({ coreURL, wasmURL });
        this.ffmpeg = ffmpeg;
        this.loaded = true;
        return;
      } catch (error) {
        lastError = error;
        ffmpeg.terminate();
      }
    }

    const detail = lastError instanceof Error ? lastError.message : "Unknown download error";
    throw new Error(`Unable to download the video engine from available CDNs. Check your internet connection and retry. ${detail}`);
  }

  private async probeHasAudio(inputName: string): Promise<boolean> {
    if (!this.ffmpeg) return false;
    this.logBuffer = [];
    try {
      await this.ffmpeg.exec(["-i", inputName]);
    } catch {
      // ffmpeg -i exits with non-zero; logs are still useful.
    }
    return this.logBuffer.some((line) => /Audio:\s/.test(line));
  }

  private normalizeTransition(transition: TransitionType): TransitionType {
    if (transition === "fade" || transition === "crossfade") {
      return transition;
    }
    return "none";
  }

  private async safeDelete(path: string): Promise<void> {
    if (!this.ffmpeg) return;
    try {
      await this.ffmpeg.deleteFile(path);
    } catch {
      // Ignore files that are already removed.
    }
  }
}
