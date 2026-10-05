import { useEffect, useMemo, useRef, useState } from "react";
import { VideoUploader } from "@/components/VideoUploader";
import type { Clip, MergeResult, OutputSettings, ProcessingState } from "@/types";
import { validateVideoFile } from "@/utils/fileValidation";
import { extractVideoMetadata } from "@/utils/media";
import { formatBytes, formatDuration } from "@/utils/format";
import { SortableTimeline } from "@/components/SortableTimeline";
import { ClipPreviewModal } from "@/components/ClipPreviewModal";
import { TrimEditor } from "@/components/TrimEditor";
import { SequencePreviewModal } from "@/components/SequencePreviewModal";
import { OutputSettingsPanel } from "@/components/OutputSettingsPanel";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { ResultPreview } from "@/components/ResultPreview";
import { VideoProcessingService } from "@/services/videoProcessingService";

const SETTINGS_STORAGE_KEY = "movie-merge-settings";

const defaultSettings: OutputSettings = {
  filename: "Merged_Movie.mp4",
  format: "mp4",
  preset: "original",
  aspectMode: "fit",
  fps: "source",
  quality: "best",
  normalizeAudio: false,
};

const createClipId = () => `clip_${crypto.randomUUID()}`;

export default function App() {
  const serviceRef = useRef(new VideoProcessingService());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const outputUrlRef = useRef<string | null>(null);

  const [clips, setClips] = useState<Clip[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [trimClipId, setTrimClipId] = useState<string | null>(null);
  const [isSequencePreviewOpen, setIsSequencePreviewOpen] = useState(false);
  const [settings, setSettings] = useState<OutputSettings>(defaultSettings);
  const [processing, setProcessing] = useState<ProcessingState>({
    active: false,
    stage: "",
    progress: null,
    elapsedMs: 0,
    canCancel: false,
  });
  const [result, setResult] = useState<MergeResult | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const previewClip = clips.find((clip) => clip.id === previewClipId) ?? null;
  const trimClip = clips.find((clip) => clip.id === trimClipId) ?? null;

  const totalTrimmedDuration = useMemo(
    () => clips.reduce((sum, clip) => sum + Math.max(0, clip.trimEnd - clip.trimStart), 0),
    [clips]
  );
  const totalSourceSize = useMemo(() => clips.reduce((sum, clip) => sum + clip.size, 0), [clips]);
  const isLargeProject = totalSourceSize >= 2 * 1024 * 1024 * 1024;

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as OutputSettings;
      setSettings((current) => ({ ...current, ...parsed }));
    } catch {
      // Ignore malformed local config.
    }
  }, []);

  useEffect(() => {
    const prevent = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    outputUrlRef.current = outputUrl;
  }, [outputUrl]);

  useEffect(() => {
    return () => {
      clipsRef.current.forEach((clip) => URL.revokeObjectURL(clip.sourceUrl));
      if (outputUrlRef.current) {
        URL.revokeObjectURL(outputUrlRef.current);
      }
    };
  }, []);

  const addFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    if (!files.length) return;

    setIsImporting(true);
    setErrorMessage(null);

    const accepted: Clip[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const validation = validateVideoFile(file);
      if (!validation.valid) {
        errors.push(validation.message || `${file.name} is not a valid video file.`);
        continue;
      }

      const sourceUrl = URL.createObjectURL(file);

      try {
        const metadata = await extractVideoMetadata(sourceUrl);
        const clip: Clip = {
          id: createClipId(),
          file,
          sourceUrl,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          metadata,
          trimStart: 0,
          trimEnd: metadata.duration || 0,
          muted: false,
          transitionToNext: "none",
        };
        accepted.push(clip);
      } catch {
        URL.revokeObjectURL(sourceUrl);
        errors.push(`${file.name} could not be read. Try converting it to MP4 or WebM.`);
      }
    }

    if (accepted.length) {
      setClips((current) => [...current, ...accepted]);
      if (!processing.active) {
        void serviceRef.current.ensureLoaded();
      }
    }

    if (errors.length) {
      setErrorMessage(errors.join(" "));
    }

    setIsImporting(false);
  };

  const updateClip = (clipId: string, updater: (clip: Clip) => Clip) => {
    setClips((current) => current.map((clip) => (clip.id === clipId ? updater(clip) : clip)));
  };

  const removeClip = (clipId: string) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;
    if (!window.confirm(`Remove ${clip.name}?`)) return;

    URL.revokeObjectURL(clip.sourceUrl);
    setClips((current) => current.filter((item) => item.id !== clipId));
  };

  const duplicateClip = (clipId: string) => {
    const clip = clips.find((item) => item.id === clipId);
    if (!clip) return;

    const duplicated: Clip = {
      ...clip,
      id: createClipId(),
      sourceUrl: URL.createObjectURL(clip.file),
      name: `${clip.name.replace(/(\.[^.]+)?$/, "")}_copy.${clip.name.split(".").pop() || "mp4"}`,
    };

    const index = clips.findIndex((item) => item.id === clipId);
    setClips((current) => {
      const next = [...current];
      next.splice(index + 1, 0, duplicated);
      return next;
    });
  };

  const moveClip = (clipId: string, direction: -1 | 1) => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === clipId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const clearAll = () => {
    if (!window.confirm("Clear all clips from this project?")) return;
    clips.forEach((clip) => URL.revokeObjectURL(clip.sourceUrl));
    setClips([]);
    setResult(null);
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      setOutputUrl(null);
    }
  };

  const startMerge = async () => {
    if (!clips.length) return;

    setErrorMessage(null);
    setResult(null);
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      setOutputUrl(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();

    setProcessing({
      active: true,
      stage: "Preparing video engine...",
      progress: null,
      elapsedMs: 0,
      canCancel: true,
    });

    const timer = window.setInterval(() => {
      setProcessing((current) => ({ ...current, elapsedMs: Date.now() - startedAt }));
    }, 300);

    try {
      const mergeResult = await serviceRef.current.mergeClips(
        clips,
        settings,
        {
          onStage: (stage) => setProcessing((current) => ({ ...current, stage })),
          onProgress: (progress) => setProcessing((current) => ({ ...current, progress })),
        },
        controller.signal
      );

      const url = URL.createObjectURL(mergeResult.blob);
      setOutputUrl(url);
      setResult(mergeResult);
      setProcessing({ active: false, stage: "", progress: null, elapsedMs: 0, canCancel: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video merge failed.";
      setErrorMessage(message);
      setProcessing({ active: false, stage: "", progress: null, elapsedMs: 0, canCancel: false });
    } finally {
      window.clearInterval(timer);
      abortRef.current = null;
    }
  };

  const cancelMerge = () => {
    abortRef.current?.abort();
    setProcessing({
      active: false,
      stage: "Processing cancelled",
      progress: null,
      elapsedMs: 0,
      canCancel: false,
    });
  };

  const saveProjectSettings = () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(168,85,247,0.16),transparent_48%),#020617] text-slate-100">
      <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-10">
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-white md:text-6xl">Movie Merge</h1>
          <p className="mt-3 text-base text-slate-300 md:text-lg">Turn multiple clips into one seamless movie.</p>
        </header>

        {errorMessage && (
          <div className="mb-5 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
            {errorMessage}
          </div>
        )}

        {clips.length === 0 ? (
          <div className="animate-[fadeIn_220ms_ease-out] space-y-6">
              <VideoUploader onFilesSelected={addFiles} />
              <p className="text-center text-xs text-slate-400">
                Add as many clips as your device can reasonably handle and combine them into one seamless movie directly
                from your browser.
              </p>
          </div>
        ) : (
          <div className="animate-[fadeIn_220ms_ease-out] space-y-4">
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/35 p-4">
                <div className="text-sm text-slate-200">
                  <p>
                    {clips.length} clips | {formatDuration(totalTrimmedDuration)} total | {formatBytes(totalSourceSize)}
                  </p>
                  {isLargeProject && (
                    <p className="mt-1 text-xs text-amber-300">
                      Large project detected. Browser processing may need significant RAM and time.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.avi,.mkv,.m4v,.mpeg,.mpg"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) {
                        void addFiles(event.target.files);
                      }
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-cyan-400/40 px-4 py-2 text-sm text-cyan-200"
                  >
                    Add More Videos
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200"
                  >
                    Clear All
                  </button>
                </div>
              </section>

              <SortableTimeline
                clips={clips}
                setClips={setClips}
                onPreview={setPreviewClipId}
                onTrim={setTrimClipId}
                onToggleMute={(clipId) => updateClip(clipId, (clip) => ({ ...clip, muted: !clip.muted }))}
                onDuplicate={duplicateClip}
                onRemove={removeClip}
                onTransitionChange={(clipId, transition) =>
                  updateClip(clipId, (clip) => ({ ...clip, transitionToNext: transition }))
                }
                onMoveLeft={(clipId) => moveClip(clipId, -1)}
                onMoveRight={(clipId) => moveClip(clipId, 1)}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsSequencePreviewOpen(true)}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm"
                >
                  Preview Movie
                </button>
                <button
                  type="button"
                  onClick={saveProjectSettings}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm"
                >
                  Save Project Settings
                </button>
                <button
                  type="button"
                  onClick={() => setShowHowItWorks((current) => !current)}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm"
                >
                  {showHowItWorks ? "Hide How It Works" : "How It Works"}
                </button>
              </div>

              {showHowItWorks && (
                <section className="rounded-xl border border-white/10 bg-slate-900/30 p-4 text-sm text-slate-300">
                  <h2 className="mb-2 text-base font-semibold text-white">How It Works</h2>
                  <p>1. Add your clips.</p>
                  <p>2. Arrange their order.</p>
                  <p>3. Choose your output settings.</p>
                  <p>4. Merge and download your movie.</p>
                </section>
              )}

              <OutputSettingsPanel
                settings={settings}
                capabilities={serviceRef.current.capabilities}
                onChange={setSettings}
              />

              {processing.active ? (
                <ProcessingPanel state={processing} onCancel={cancelMerge} />
              ) : result && outputUrl ? (
                <ResultPreview
                  result={result}
                  outputUrl={outputUrl}
                  onBackToEditor={() => setResult(null)}
                  onResetProject={clearAll}
                />
              ) : (
                <section className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
                  {clips.length === 1 && (
                    <p className="mb-3 text-sm text-slate-300">
                      One clip is loaded. You can still export it, but merging works best with two or more clips.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={startMerge}
                    disabled={clips.length === 0 || isImporting}
                    className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-5 py-3 text-lg font-semibold text-white shadow-lg shadow-blue-950/50 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Merge Videos
                  </button>
                </section>
              )}
          </div>
        )}

        {isImporting && (
          <p className="mt-4 text-sm text-slate-300" aria-live="polite">
            Reading video metadata and generating thumbnails...
          </p>
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-4 border-t border-white/10 px-4 py-5 text-xs text-slate-400 sm:px-6 lg:px-10">
        <button type="button" className="hover:text-slate-200" onClick={() => setShowHowItWorks((current) => !current)}>
          How It Works
        </button>
        <span>Privacy: Files stay on your device during local processing whenever possible.</span>
        <span>Supported Formats: MP4, MOV, WebM, AVI, MKV, M4V, MPEG</span>
        <span>About: Browser-first movie assembly utility.</span>
      </footer>

      <ClipPreviewModal clip={previewClip} onClose={() => setPreviewClipId(null)} />
      <TrimEditor
        clip={trimClip}
        onClose={() => setTrimClipId(null)}
        onApply={(clipId, start, end) => updateClip(clipId, (clip) => ({ ...clip, trimStart: start, trimEnd: end }))}
      />
      <SequencePreviewModal
        clips={clips}
        isOpen={isSequencePreviewOpen}
        onClose={() => setIsSequencePreviewOpen(false)}
      />
    </div>
  );
}
