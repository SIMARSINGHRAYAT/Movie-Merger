import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { Clip } from "@/types";
import { formatDuration } from "@/utils/format";

interface TrimEditorProps {
  clip: Clip | null;
  onClose: () => void;
  onApply: (clipId: string, start: number, end: number) => void;
}

export const TrimEditor = ({ clip, onClose, onApply }: TrimEditorProps) => {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const duration = clip?.metadata.duration ?? 0;

  useEffect(() => {
    if (!clip) return;
    setStart(clip.trimStart);
    setEnd(clip.trimEnd);
  }, [clip]);

  const selectedDuration = Math.max(0, end - start);
  const selectionStyle = useMemo(() => {
    if (!duration) return { left: "0%", width: "0%" };
    const left = (start / duration) * 100;
    const width = ((end - start) / duration) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }, [start, end, duration]);

  return (
    <Modal isOpen={Boolean(clip)} onClose={onClose} title={clip ? `Trim: ${clip.name}` : "Trim Clip"}>
      {clip && (
        <div className="space-y-4">
          <video src={clip.sourceUrl} controls className="h-auto w-full rounded-lg border border-white/10 bg-black" />

          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
              <span>
                Start: <strong>{start.toFixed(2)}s</strong>
              </span>
              <span>
                End: <strong>{end.toFixed(2)}s</strong>
              </span>
              <span>
                Selected: <strong>{formatDuration(selectedDuration)}</strong>
              </span>
            </div>

            <div className="relative mb-3 h-3 rounded-full bg-slate-800">
              <div className="absolute top-0 h-3 rounded-full bg-cyan-500/80" style={selectionStyle} />
            </div>

            <label className="mb-2 block text-xs text-slate-300">Start time</label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.min(start, Math.max(end - 0.05, 0))}
              onChange={(event) => {
                const value = Number(event.target.value);
                setStart(Math.min(value, Math.max(end - 0.05, 0)));
              }}
              className="w-full"
            />

            <label className="mb-2 mt-3 block text-xs text-slate-300">End time</label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.max(end, start + 0.05)}
              onChange={(event) => {
                const value = Number(event.target.value);
                setEnd(Math.max(value, start + 0.05));
              }}
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-slate-200"
              onClick={() => {
                setStart(0);
                setEnd(duration);
              }}
            >
              Reset Trim
            </button>
            <button
              type="button"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-slate-200"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-black"
              onClick={() => {
                onApply(clip.id, start, end);
                onClose();
              }}
            >
              Apply Trim
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
