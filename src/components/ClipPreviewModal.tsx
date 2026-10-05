import { Modal } from "@/components/Modal";
import type { Clip } from "@/types";

interface ClipPreviewModalProps {
  clip: Clip | null;
  onClose: () => void;
}

export const ClipPreviewModal = ({ clip, onClose }: ClipPreviewModalProps) => {
  return (
    <Modal isOpen={Boolean(clip)} onClose={onClose} title={clip ? `Preview: ${clip.name}` : "Preview"}>
      {clip && (
        <video
          src={clip.sourceUrl}
          controls
          autoPlay
          className="h-auto max-h-[68vh] w-full rounded-lg border border-white/10 bg-black"
        />
      )}
    </Modal>
  );
};
