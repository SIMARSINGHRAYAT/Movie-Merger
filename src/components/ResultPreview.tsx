import type { MergeResult } from "@/types";
import { formatBytes, formatDuration } from "@/utils/format";

interface ResultPreviewProps {
  result: MergeResult;
  outputUrl: string;
  onBackToEditor: () => void;
  onResetProject: () => void;
}

export const ResultPreview = ({ result, outputUrl, onBackToEditor, onResetProject }: ResultPreviewProps) => {
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const handleShare = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: "Movie Merge Output",
        text: "Merged movie created with Movie Merge",
        url: outputUrl,
      });
    } catch {
      // Sharing may be canceled by user.
    }
  };

  return (
    <section className="rounded-xl border border-emerald-400/30 bg-slate-900/50 p-5 backdrop-blur-md">
      <h2 className="text-2xl font-semibold text-white">Movie Ready</h2>
      <p className="mt-1 text-sm text-slate-300">Your final movie has been rendered successfully.</p>

      <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
        <p>Filename: {result.fileName}</p>
        <p>Duration: {formatDuration(result.duration)}</p>
        <p>
          Resolution: {result.width} x {result.height}
        </p>
        <p>Size: {formatBytes(result.size)}</p>
      </div>

      <video src={outputUrl} controls className="mt-4 h-auto w-full rounded-lg border border-white/15 bg-black" />

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={outputUrl}
          download={result.fileName}
          className="rounded-lg bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-5 py-2.5 font-semibold text-white"
        >
          Download Movie
        </a>
        <button type="button" className="rounded-lg border border-white/20 px-4 py-2" onClick={onBackToEditor}>
          Back to Editor
        </button>
        <button type="button" className="rounded-lg border border-white/20 px-4 py-2" onClick={onResetProject}>
          Create Another Movie
        </button>
        {canShare && (
          <button type="button" className="rounded-lg border border-white/20 px-4 py-2" onClick={handleShare}>
            Share
          </button>
        )}
      </div>
    </section>
  );
};
