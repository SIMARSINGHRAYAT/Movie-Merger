import { useRef, useState } from "react";

interface VideoUploaderProps {
  onFilesSelected: (files: FileList | File[]) => void;
  compact?: boolean;
}

const ACCEPTED_FORMATS = "video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,video/mpeg,.mp4,.mov,.webm,.avi,.mkv,.m4v,.mpeg,.mpg";

export const VideoUploader = ({ onFilesSelected, compact = false }: VideoUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section
      className={`relative rounded-2xl border border-white/15 bg-slate-900/40 p-4 backdrop-blur-xl ${
        compact ? "" : "p-6 md:p-10"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) {
            onFilesSelected(event.target.files);
          }
          event.target.value = "";
        }}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node)) {
            return;
          }
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          onFilesSelected(event.dataTransfer.files);
        }}
        className={`flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all duration-300 ${
          isDragging
            ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_60px_rgba(34,211,238,0.25)]"
            : "border-white/30 bg-slate-950/30 hover:border-cyan-300/60"
        }`}
      >
        <h2 className="text-2xl font-semibold text-white">Drop your videos here</h2>
        <p className="text-sm text-slate-300">or click to browse</p>
        <p className="max-w-2xl text-xs text-slate-400">
          Supported formats: MP4, MOV, WebM, AVI, MKV, M4V, MPEG and compatible browser codecs.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-6 py-3 font-medium text-white shadow-lg shadow-cyan-900/30 transition hover:brightness-110"
        >
          Add Videos
        </button>
      </div>
    </section>
  );
};
