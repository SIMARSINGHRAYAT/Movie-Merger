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

## Deploy to Vercel

1. Import this GitHub repository in Vercel.
2. Keep the framework preset set to **Vite**.
3. Use `npm run build` as the build command and `dist` as the output directory.
4. Deploy. No environment variables are required.

The repository includes `vercel.json` with the production build settings and baseline security headers. Video export runs in the browser and downloads the FFmpeg WebAssembly core from a CDN at runtime, so users need access to unpkg or jsDelivr to export.

## Notes

- Videos that the browser cannot inspect are still added to the timeline; their metadata is read by FFmpeg when export starts.
- FFmpeg core files are loaded from unpkg with jsDelivr as a fallback, so exporting requires a connection to at least one CDN.
- Large projects require substantial CPU and memory due to in-browser transcoding.
- Files are processed locally in-browser whenever possible.
