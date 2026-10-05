# Movie Merge

Movie Merge is a browser-first video assembly tool built with React, TypeScript, Vite, and FFmpeg.wasm.

## Features

- Multi-file import with drag-and-drop and file picker
- Visual timeline with drag-and-drop clip reordering
- Clip controls: preview, trim, mute/unmute, duplicate, remove
- Sequential movie preview using arranged order and trim ranges
- Output settings for format, preset, aspect handling, frame rate, and quality
- Local browser processing with FFmpeg WebAssembly (lazy loaded)
- Merge progress UI, cancellation, final preview, and download

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Build production bundle:

```bash
npm run build
```

## Notes

- FFmpeg core files are loaded from unpkg at runtime.
- Large projects require substantial CPU and memory due to in-browser transcoding.
- Files are processed locally in-browser whenever possible.
