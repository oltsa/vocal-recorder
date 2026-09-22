# Vocal Recorder

Browser-first webcam vocal recorder built with React and Vite.

The goal is to help a singer record a voice take, inspect recording problems, and refine the vocal sound through natural-language chat that maps intent into deterministic audio-chain parameters.

## Current direction

- Plain browser-only React app with no backend.
- Browser audio engine remains the source of truth for DSP.
- AI chat updates recorder vocal-chain settings through local Ollama.
- The AI now chooses explicit tools and settings, and the UI shows the resulting chain.
- The vocal chain is now an ordered list, so AI can change not only tools and settings but also chain order.
- You can also toggle tools individually and manually adjust their settings for A/B listening and fine-tuning.
- Recorded takes are now kept raw and mono-normalized so you can audition new chain settings against the same source take.
- You can save working chain templates locally and reload them later from the app.
- You can save either the raw take or a processed export rendered with the current chain.
- `Chain enabled` is now the actual playback switch between raw and processed audition.
- The app now measures the dry mic input in real time and surfaces post-take suggestions from analyzer metrics.
- Decisions and feature-by-feature work are tracked in `worklog/`.

## Project layout

- `src/App.tsx`: webcam recorder and AI chat control surface.
- `src/features/recorder/lib/audio-chain.ts`: browser vocal-chain processing.
- `src/features/recorder/lib/ollama.ts`: local Ollama model lookup and chat control.
- `worklog`: Markdown decision log and numbered implementation notes.
- `reference/old-camera-src`: reference-only legacy code kept for inspiration.

## Getting started

1. Install dependencies with `npm install`.
2. Start the dev server with `npm run dev`.
3. Open the local Vite URL shown in the terminal.
4. Make sure Ollama is running on `http://127.0.0.1:11434`.

## Near-term build order

1. Improve prompt-to-patch robustness for your preferred local model.
2. Improve analyzer-driven prompt routing and corrective suggestions.
3. Improve the raw-take reprocessing workflow and dry/processed comparison.
4. Keep refining layered vocal-space tools and export-friendly chain descriptions.