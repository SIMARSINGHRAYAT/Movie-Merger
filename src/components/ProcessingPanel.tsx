import type { ProcessingState } from "@/types";

interface ProcessingPanelProps {
  state: ProcessingState;
  onCancel: () => void;
}

export const ProcessingPanel = ({ state, onCancel }: ProcessingPanelProps) => {
  const progressValue = state.progress ?? 0;

  return (
    <section className="rounded-xl border border-cyan-400/30 bg-slate-900/50 p-5 backdrop-blur-md" aria-live="polite">
      <h2 className="text-lg font-semibold text-white">Processing Movie</h2>
      <p className="mt-1 text-sm text-slate-300">{state.stage}</p>

      <div className="mt-4 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-3 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-300 ${
            state.progress === null ? "animate-pulse" : ""
          }`}
          style={{ width: `${Math.max(8, progressValue * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{state.progress === null ? "Calculating progress..." : `${Math.round(state.progress * 100)}% complete`}</span>
        <span>{Math.floor(state.elapsedMs / 1000)}s elapsed</span>
      </div>

      <button
        type="button"
        onClick={onCancel}
        disabled={!state.canCancel}
        className="mt-4 rounded-md border border-red-400/50 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/10 disabled:opacity-40"
      >
        Cancel Processing
      </button>
    </section>
  );
};
