import { useEffect, useMemo, useRef, useState } from "react";
import { VideoUploader } from "@/components/VideoUploader";
import type { Clip, ClipMetadata, MergeResult, OutputSettings, ProcessingState } from "@/types";
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

const primaryButtonClass =
  "rounded-full border border-white/20 bg-black/35 px-7 py-3.5 font-semibold text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-500 shadow-[0_0_32px_rgba(255,255,255,0.1)] transition hover:border-white/45 hover:shadow-[0_0_42px_rgba(96,165,250,0.2)] focus:outline-none focus:ring-2 focus:ring-cyan-300/70";

export default function App() {
  const serviceRef = useRef(new VideoProcessingService());
  const abortRef = useRef<AbortController | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const outputUrlRef = useRef<string | null>(null);

  const [clips, setClips] = useState<Clip[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
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
  const [settingsStatus, setSettingsStatus] = useState<"saved" | "restored" | "idle">("idle");
  const [isHydratingSettings, setIsHydratingSettings] = useState(true);
  const [page, setPage] = useState<"welcome" | "editor" | "render">("welcome");
  const [slotCount, setSlotCount] = useState(2);

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
    if (!saved) {
      setIsHydratingSettings(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<OutputSettings>;
      setSettings((current) => ({ ...current, ...parsed, format: "mp4" }));
      setSettingsStatus("restored");
    } catch {
      setSettingsStatus("idle");
    } finally {
      setIsHydratingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (isHydratingSettings) return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    setSettingsStatus("saved");
  }, [settings, isHydratingSettings]);

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

  const addFiles = async (incoming: FileList | File[], insertAt?: number) => {
    const files = Array.from(incoming);
    if (!files.length) return;

    setIsImporting(true);
    setErrorMessage(null);
    setImportNotice(null);

    const existingKeys = new Set(
      clipsRef.current.map((clip) => `${clip.name}:${clip.size}:${clip.file.lastModified}`)
    );
    const accepted: Clip[] = [];
    const errors: string[] = [];
    const notices: string[] = [];

    for (const file of files) {
      const validation = validateVideoFile(file);
      if (!validation.valid) {
        errors.push(validation.message || `${file.name} is not a valid video file.`);
        continue;
      }

      const fileKey = `${file.name}:${file.size}:${Math.max(file.lastModified, 0)}`;
      if (existingKeys.has(fileKey)) {
        errors.push(`${file.name} is already in your project.`);
        continue;
      }

      const sourceUrl = URL.createObjectURL(file);

      try {
        let metadata: ClipMetadata;
        let metadataAvailable = true;
        try {
          metadata = await extractVideoMetadata(sourceUrl);
        } catch {
          metadata = { duration: 0, width: 0, height: 0, thumbnailUrl: null };
          metadataAvailable = false;
          notices.push(`${file.name} was added. Its details will be checked when you export.`);
        }

        const clip: Clip = {
          id: createClipId(),
          file,
          sourceUrl,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          metadata,
          metadataAvailable,
          sourceSlot: insertAt,
          trimStart: 0,
          trimEnd: metadata.duration || 0,
          muted: false,
          transitionToNext: "none",
        };
        accepted.push(clip);
        existingKeys.add(fileKey);
      } catch (error) {
        URL.revokeObjectURL(sourceUrl);
        const detail = error instanceof Error ? ` ${error.message}` : "";
        errors.push(
          `${file.name} could not be read.${detail} Check that the file is a valid video and try an H.264/AAC MP4 if the issue continues.`
        );
      }
    }

    if (accepted.length) {
      setClips((current) => {
        const next = [...current];
        const insertionIndex = insertAt === undefined ? next.length : Math.min(insertAt, next.length);
        next.splice(insertionIndex, 0, ...accepted);
        return next;
      });
    }

    if (errors.length) {
      setErrorMessage(errors.join(" "));
    }
    if (notices.length) {
      setImportNotice(notices.join(" "));
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
      sourceSlot: undefined,
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
    setSlotCount(2);
    setPage("editor");
  };

  const startMerge = async () => {
    if (clips.length < 2) return;

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
    setPage("render");

    const timer = window.setInterval(() => {
      setProcessing((current) => ({ ...current, elapsedMs: Date.now() - startedAt }));
    }, 300);

    try {
      const mergeResult = await serviceRef.current.mergeClips(
        clips,
        { ...settings, format: "mp4" },
        {
          onStage: (stage) => setProcessing((current) => ({ ...current, stage })),
          onProgress: (progress) => setProcessing((current) => ({ ...current, progress })),
          onClipMetadata: (clipId, metadata) =>
            setClips((current) =>
              current.map((clip) =>
                clip.id === clipId
                  ? {
                      ...clip,
                      metadata,
                      metadataAvailable: true,
                      trimEnd: clip.trimEnd > 0 ? clip.trimEnd : metadata.duration,
                    }
                  : clip
              )
            ),
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
    setSettingsStatus("saved");
  };

  const renderHeader = (
    <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <button type="button" onClick={() => setPage("welcome")} className="brand-mark text-sm font-semibold tracking-[0.22em] text-white">
        MM <span className="ml-2 text-xs font-normal tracking-[0.08em] text-white/50">MOVIE MERGE</span>
      </button>
      <span className="hidden text-xs tracking-[0.2em] text-white/45 sm:block">PRIVATE · IN-BROWSER · LOCAL</span>
    </header>
  );

  return (
    <div className="app-canvas min-h-screen overflow-hidden text-slate-100">
      {page === "welcome" ? (
        <main className="welcome-scene relative flex min-h-screen items-center justify-center px-5 py-24 text-center">
          {renderHeader}
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <section className="relative z-[1] mx-auto max-w-5xl animate-[fadeIn_700ms_ease-out]">
            <h1 className="chrome-title text-7xl font-semibold leading-[0.9] tracking-[-0.075em] sm:text-8xl md:text-[9.5rem] lg:text-[11rem]">
              Movie
              <br />
              Merge
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-lg italic leading-relaxed text-slate-300/75 sm:text-xl">
              Bring your video clips together, arrange every moment, and create one seamless movie.
            </p>
            <button type="button" onClick={() => setPage("editor")} className={`${primaryButtonClass} mt-10 text-base`}>
              Get started <span className="ml-2 text-white/70">↗</span>
            </button>
            <p className="mt-7 text-[10px] uppercase tracking-[0.28em] text-white/35">
              No uploads to a server · Your media stays yours
            </p>
          </section>
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2" aria-hidden="true">
            {["#40e0d0", "#648cff", "#c084fc", "#f472b6", "#fb7185", "#fb923c", "#a3e635"].map((color) => (
              <span key={color} className="h-1 w-7 rounded-full opacity-80" style={{ backgroundColor: color, boxShadow: `0 0 14px ${color}` }} />
            ))}
          </div>
        </main>
      ) : (
        <main className="relative mx-auto min-h-screen w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 lg:px-10">
          {renderHeader}
          {page === "editor" ? (
            <div className="animate-[fadeIn_350ms_ease-out] space-y-9">
              <section className="max-w-3xl">
                <p className="mb-3 text-xs uppercase tracking-[0.3em] text-cyan-200/65">The editing room</p>
                <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">Build your sequence.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
                  Add clips one by one, arrange the order, and preview each moment before you bring them together.
                </p>
              </section>

              {errorMessage && (
                <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
                  {errorMessage}
                </div>
              )}
              {importNotice && (
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-4 text-sm text-cyan-100" role="status">
                  {importNotice}
                </div>
              )}

              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium text-white">Add your videos</h2>
                    <p className="mt-1 text-xs text-slate-500">Choose a first clip, then a second. Add more whenever you need.</p>
                  </div>
                  <span className="text-xs text-slate-500">{clips.length} {clips.length === 1 ? "clip" : "clips"} selected</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from(
                    { length: Math.max(slotCount, ...clips.map((clip) => (clip.sourceSlot ?? -1) + 1)) },
                    (_, index) => {
                    const clip = clips.find((item) => item.sourceSlot === index);
                    return (
                      <section
                        key={`slot-${index}`}
                        className="glass-panel group relative min-h-[248px] overflow-hidden rounded-2xl p-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/25"
                      >
                        <div className="mb-5 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.2em] text-white/50">
                            {index < 2 ? `Video 0${index + 1}` : `Additional ${String(index - 1).padStart(2, "0")}`}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${clip ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" : "bg-white/20"}`} />
                        </div>
                        {clip ? (
                          <div className="flex h-[175px] flex-col">
                            <div className="relative mb-3 h-24 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                              {clip.metadata.thumbnailUrl ? (
                                <img src={clip.metadata.thumbnailUrl} alt={`Preview of ${clip.name}`} className="h-full w-full object-cover opacity-75 transition group-hover:opacity-100" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-2xl text-white/20">▶</div>
                              )}
                              <button
                                type="button"
                                onClick={() => setPreviewClipId(clip.id)}
                                disabled={!clip.metadataAvailable}
                                className="absolute inset-0 flex items-center justify-center text-2xl text-white opacity-0 transition hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                                aria-label={`Preview ${clip.name}`}
                              >
                                <span className="rounded-full border border-white/30 bg-black/55 px-4 py-2 backdrop-blur">▶</span>
                              </button>
                            </div>
                            <p className="truncate text-sm font-medium text-white" title={clip.name}>{clip.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {clip.metadataAvailable ? formatDuration(clip.metadata.duration) : "Metadata on export"} · {formatBytes(clip.size)}
                            </p>
                            <button type="button" onClick={() => removeClip(clip.id)} className="mt-auto self-start text-xs text-white/45 transition hover:text-rose-300">
                              Remove clip
                            </button>
                          </div>
                        ) : (
                          <VideoUploader
                            compact
                            multiple={false}
                            isImporting={isImporting}
                            onFilesSelected={(files) => void addFiles(files, index)}
                            title={index < 2 ? `Drop video ${index + 1} here` : "Drop another video"}
                            description="or click to browse"
                            actionLabel="Choose video"
                          />
                        )}
                      </section>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setSlotCount((current) => current + 1)}
                    className="glass-panel flex min-h-[248px] flex-col items-center justify-center rounded-2xl border-dashed text-white/40 transition hover:border-cyan-200/35 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Add another video slot"
                  >
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-3xl font-light">+</span>
                    <span className="text-sm">Add another clip</span>
                  </button>
                </div>
              </section>

              {clips.length > 0 && (
                <>
                  <section className="flex flex-wrap items-center justify-between gap-4 border-y border-white/[0.08] py-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                      <span>{clips.length} separate clips</span>
                      <span>{clips.some((clip) => !clip.metadataAvailable) ? "Total duration pending" : `${formatDuration(totalTrimmedDuration)} total`}</span>
                      <span>{formatBytes(totalSourceSize)} source media</span>
                      {isLargeProject && <span className="text-amber-300">Large project · export may take a while</span>}
                    </div>
                    <button type="button" onClick={clearAll} className="text-xs text-white/45 transition hover:text-rose-300">Clear sequence</button>
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

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSequencePreviewOpen(true)}
                        disabled={clips.some((clip) => !clip.metadataAvailable)}
                        className="rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-slate-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                      >
                        Preview sequence
                      </button>
                      <button
                        type="button"
                        onClick={saveProjectSettings}
                        className="rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-slate-300 transition hover:border-white/30 hover:text-white"
                      >
                        Save export settings
                      </button>
                      {settingsStatus !== "idle" && <span className="self-center text-[10px] uppercase tracking-widest text-emerald-200/60">{settingsStatus}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={startMerge}
                      disabled={clips.length < 2 || isImporting}
                      className={`${primaryButtonClass} text-sm disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      Merge clips <span className="ml-2">→</span>
                    </button>
                  </div>
                  {clips.length < 2 && <p className="text-right text-xs text-slate-500">Add at least two clips to start your merge.</p>}

                  <details className="glass-panel rounded-2xl p-5">
                    <summary className="cursor-pointer text-sm text-slate-300">Export settings · MP4</summary>
                    <div className="mt-5">
                      <OutputSettingsPanel
                        settings={{ ...settings, format: "mp4" }}
                        capabilities={{ ...serviceRef.current.capabilities, formats: ["mp4"] }}
                        onChange={(next) => setSettings({ ...next, format: "mp4" })}
                      />
                    </div>
                  </details>
                </>
              )}
              {isImporting && <p className="text-center text-sm text-slate-400" aria-live="polite">Reading video details…</p>}
              <footer className="pt-4 text-center text-xs text-slate-600">Your videos stay on your device. MP4 and WebM inputs are supported.</footer>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl animate-[fadeIn_350ms_ease-out] space-y-7 pt-8">
              <div className="text-center">
                <p className="mb-3 text-xs uppercase tracking-[0.3em] text-cyan-100/60">Render studio</p>
                <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
                  {processing.active ? "Bringing it together." : result ? "Your film is ready." : "Render paused."}
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                  {processing.active ? "Your clips are being processed locally in this browser." : "Preview your finished MP4 before downloading."}
                </p>
              </div>
              {errorMessage && (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100" role="alert">
                  {errorMessage}
                </div>
              )}
              {processing.active && <ProcessingPanel state={processing} onCancel={cancelMerge} />}
              {!processing.active && result && outputUrl && (
                <ResultPreview
                  result={result}
                  outputUrl={outputUrl}
                  onBackToEditor={() => setPage("editor")}
                  onResetProject={clearAll}
                />
              )}
              {!processing.active && !result && (
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => setPage("editor")} className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-slate-200">Back to sequence</button>
                  {errorMessage && <button type="button" onClick={() => void startMerge()} className={primaryButtonClass}>Try again</button>}
                </div>
              )}
            </div>
          )}
        </main>
      )}

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
