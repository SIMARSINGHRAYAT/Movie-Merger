import type { Clip } from "@/types";
import { formatBytes, formatDuration } from "@/utils/format";

interface ClipCardProps {
  clip: Clip;
  index: number;
  isDragging?: boolean;
  onPreview: (clipId: string) => void;
  onTrim: (clipId: string) => void;
  onToggleMute: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
  onRemove: (clipId: string) => void;
  onTransitionChange: (clipId: string, transition: Clip["transitionToNext"]) => void;
  onMoveLeft: (clipId: string) => void;
  onMoveRight: (clipId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

const iconButtonClass =
  "rounded-md border border-white/20 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:text-white";

export const ClipCard = ({
  clip,
  index,
  isDragging = false,
  onPreview,
  onTrim,
  onToggleMute,
  onDuplicate,
  onRemove,
  onTransitionChange,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
}: ClipCardProps) => {
  const trimmedDuration = Math.max(0, clip.trimEnd - clip.trimStart);

  return (
    <article
      className={`w-72 shrink-0 rounded-xl border border-white/15 bg-slate-950/70 p-3 backdrop-blur-lg transition ${
        isDragging ? "scale-[1.02] border-cyan-400 shadow-xl shadow-cyan-950/40" : ""
      }`}
      aria-label={`Clip ${index + 1}: ${clip.name}`}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
        <span className="font-semibold text-cyan-300">Clip {String(index + 1).padStart(2, "0")}</span>
        <span className="cursor-grab rounded border border-white/15 px-2 py-0.5 text-slate-300">Drag</span>
      </div>

      <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-slate-900/80">
        {clip.metadata.thumbnailUrl ? (
          <img
            src={clip.metadata.thumbnailUrl}
            alt={`Thumbnail for ${clip.name}`}
            className="h-32 w-full object-cover"
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-slate-500">No preview frame</div>
        )}
      </div>

      <h3 className="truncate text-sm font-medium text-white" title={clip.name}>
        {clip.name}
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        {formatDuration(clip.metadata.duration)} | {formatBytes(clip.size)} | {clip.metadata.width || "?"} x{" "}
        {clip.metadata.height || "?"}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Trimmed: {formatDuration(trimmedDuration)} ({clip.trimStart.toFixed(1)}s to {clip.trimEnd.toFixed(1)}s)
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" title="Preview clip" className={iconButtonClass} onClick={() => onPreview(clip.id)}>
          Preview
        </button>
        <button type="button" title="Trim clip" className={iconButtonClass} onClick={() => onTrim(clip.id)}>
          Trim
        </button>
        <button
          type="button"
          title={clip.muted ? "Unmute clip" : "Mute clip"}
          className={iconButtonClass}
          onClick={() => onToggleMute(clip.id)}
        >
          {clip.muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" title="Duplicate clip" className={iconButtonClass} onClick={() => onDuplicate(clip.id)}>
          Duplicate
        </button>
        <button type="button" title="Remove clip" className={iconButtonClass} onClick={() => onRemove(clip.id)}>
          Remove
        </button>
        <select
          title="Transition to next clip"
          value={clip.transitionToNext}
          onChange={(event) => onTransitionChange(clip.id, event.target.value as Clip["transitionToNext"])}
          className="rounded-md border border-white/20 bg-slate-900/80 px-2 py-1 text-xs text-slate-200"
          aria-label="Transition to next clip"
        >
          <option value="none">None</option>
          <option value="fade">Fade</option>
          <option value="crossfade">Crossfade</option>
        </select>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={`${iconButtonClass} flex-1 ${isFirst ? "opacity-40" : ""}`}
          onClick={() => onMoveLeft(clip.id)}
          disabled={isFirst}
          aria-label={`Move ${clip.name} left`}
        >
          Move Left
        </button>
        <button
          type="button"
          className={`${iconButtonClass} flex-1 ${isLast ? "opacity-40" : ""}`}
          onClick={() => onMoveRight(clip.id)}
          disabled={isLast}
          aria-label={`Move ${clip.name} right`}
        >
          Move Right
        </button>
      </div>
    </article>
  );
};
