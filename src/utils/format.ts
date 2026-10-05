export const formatBytes = (value: number): string => {
  if (value === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), sizes.length - 1);
  const num = value / 1024 ** index;
  return `${num >= 100 ? num.toFixed(0) : num.toFixed(1)} ${sizes[index]}`;
};

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const sanitizeOutputFileName = (value: string, extension: string): string => {
  const base = value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "")
    .replace(/\.(mp4|webm)$/i, "");
  const safeBase = base.length > 0 ? base : "Merged_Movie";
  return `${safeBase}.${extension}`;
};
