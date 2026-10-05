import type { EngineCapabilities, OutputSettings } from "@/types";

interface OutputSettingsPanelProps {
  settings: OutputSettings;
  capabilities: EngineCapabilities;
  onChange: (next: OutputSettings) => void;
}

const inputClass = "w-full rounded-md border border-white/20 bg-slate-950/80 px-3 py-2 text-sm text-white";

export const OutputSettingsPanel = ({ settings, capabilities, onChange }: OutputSettingsPanelProps) => {
  const videoCodec = capabilities.videoCodecs[settings.format]?.[0] ?? "auto";
  const audioCodec = capabilities.audioCodecs[settings.format]?.[0] ?? "auto";

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-md">
      <h2 className="mb-3 text-lg font-semibold text-white">Output Settings</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-300">
          Output filename
          <input
            value={settings.filename}
            onChange={(event) => onChange({ ...settings, filename: event.target.value })}
            className={inputClass}
            aria-label="Output filename"
          />
        </label>

        <label className="space-y-1 text-xs text-slate-300">
          Container format
          <select
            value={settings.format}
            onChange={(event) => onChange({ ...settings, format: event.target.value as OutputSettings["format"] })}
            className={inputClass}
            aria-label="Output format"
          >
            {capabilities.formats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-300">
          Resolution preset
          <select
            value={settings.preset}
            onChange={(event) => onChange({ ...settings, preset: event.target.value as OutputSettings["preset"] })}
            className={inputClass}
            aria-label="Resolution preset"
          >
            <option value="original">Original / Best Quality</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-300">
          Aspect ratio handling
          <select
            value={settings.aspectMode}
            onChange={(event) =>
              onChange({
                ...settings,
                aspectMode: event.target.value as OutputSettings["aspectMode"],
              })
            }
            className={inputClass}
            aria-label="Aspect ratio handling"
          >
            <option value="fit">Fit (letterbox/pillarbox)</option>
            <option value="fill">Fill (crop to frame)</option>
            <option value="original">Original canvas fit</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-300">
          Frame rate
          <select
            value={settings.fps}
            onChange={(event) => onChange({ ...settings, fps: event.target.value as OutputSettings["fps"] })}
            className={inputClass}
            aria-label="Frame rate"
          >
            <option value="source">Source</option>
            <option value="24">24 fps</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-300">
          Quality profile
          <select
            value={settings.quality}
            onChange={(event) => onChange({ ...settings, quality: event.target.value as OutputSettings["quality"] })}
            className={inputClass}
            aria-label="Quality profile"
          >
            <option value="best">Best quality</option>
            <option value="balanced">Balanced</option>
            <option value="small">Smaller file size</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <input
          id="normalize-audio"
          type="checkbox"
          checked={settings.normalizeAudio}
          onChange={(event) => onChange({ ...settings, normalizeAudio: event.target.checked })}
          className="h-4 w-4 accent-cyan-500"
        />
        <label htmlFor="normalize-audio">Normalize clip audio loudness</label>
      </div>

      <div className="mt-3 grid gap-1 text-xs text-slate-400 md:grid-cols-2">
        <p>Video codec: {videoCodec}</p>
        <p>Audio codec: {audioCodec}</p>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Your videos are processed locally in your browser whenever possible.
      </p>
    </section>
  );
};
