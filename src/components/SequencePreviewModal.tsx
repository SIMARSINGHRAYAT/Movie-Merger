import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { Clip } from "@/types";

interface SequencePreviewModalProps {
  clips: Clip[];
  isOpen: boolean;
  onClose: () => void;
}

export const SequencePreviewModal = ({ clips, isOpen, onClose }: SequencePreviewModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !clips.length) return;
    const video = videoRef.current;
    const clip = clips[currentIndex];
    if (!video || !clip) return;

    video.src = clip.sourceUrl;
    video.muted = clip.muted;
    video.load();

    const onLoaded = () => {
      video.currentTime = Math.min(clip.trimStart, Math.max(clip.metadata.duration - 0.1, 0));
      void video.play().catch(() => {
        // User gesture restrictions may require manual play.
      });
    };

    const onTimeUpdate = () => {
      if (video.currentTime >= clip.trimEnd) {
        if (currentIndex < clips.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          video.pause();
        }
      }
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [clips, currentIndex, isOpen]);

  const clip = clips[currentIndex] ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preview Movie">
      <div className="space-y-3">
        <div className="text-sm text-slate-300">
          Clip {Math.min(currentIndex + 1, clips.length)} of {clips.length}
          {clip ? ` - ${clip.name}` : ""}
        </div>

        <video ref={videoRef} controls className="h-auto max-h-[68vh] w-full rounded-lg border border-white/10 bg-black" />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="rounded-md border border-white/20 px-3 py-2 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.min(clips.length - 1, prev + 1))}
            disabled={currentIndex >= clips.length - 1}
            className="rounded-md border border-white/20 px-3 py-2 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </Modal>
  );
};
