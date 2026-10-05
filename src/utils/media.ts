import type { ClipMetadata } from "@/types";

const loadVideoElement = (url: string): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve(video);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Unable to read this video file."));
    };
  });

const captureThumbnail = async (video: HTMLVideoElement): Promise<string | null> => {
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth, 480);
  canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const seekTime = Math.min(Math.max(video.duration * 0.2, 0.15), Math.max(video.duration - 0.1, 0));

  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = seekTime;
  });

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
};

export const extractVideoMetadata = async (sourceUrl: string): Promise<ClipMetadata> => {
  const video = await loadVideoElement(sourceUrl);
  const thumbnailUrl = await captureThumbnail(video).catch(() => null);

  return {
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
    thumbnailUrl,
  };
};
