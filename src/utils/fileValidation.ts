const SUPPORTED_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "avi",
  "mkv",
  "m4v",
  "mpeg",
  "mpg",
]);

export interface FileValidationResult {
  valid: boolean;
  message?: string;
}

export const validateVideoFile = (file: File): FileValidationResult => {
  if (file.size <= 0) {
    return { valid: false, message: `${file.name} is empty and cannot be processed.` };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasLikelyVideoExtension = SUPPORTED_EXTENSIONS.has(extension);
  const hasVideoMime = file.type.startsWith("video/");

  if (!hasLikelyVideoExtension && !hasVideoMime) {
    return {
      valid: false,
      message: `${file.name} does not look like a supported video file. Try MP4, MOV, or WebM.`,
    };
  }

  return { valid: true };
};
