# Yoon Recap

Mobile-friendly Myanmar movie-recap studio. The Node/Express service in `server.js` serves `public/`, uses FFmpeg/FFprobe for media work, Groq Whisper for transcription and recap generation, Gemini for subtitle translation, and Microsoft Edge TTS for Myanmar narration.

## Run locally

Requirements: Node.js 22+, FFmpeg and FFprobe.

```sh
npm install
npm start
```

Open `http://localhost:3000`. For tests, run `npm test`.

## API keys

Add Groq and Gemini keys through the app's API-key panel. The server also supports `GROQ_API_KEY` and `GEMINI_API_KEY` environment variables. Never commit real keys. The browser UI stores keys in localStorage when the user chooses Save; this is convenient for personal use but is not equivalent to server-side secret storage.

Gemini key: https://aistudio.google.com/apikey
Groq key: https://console.groq.com/keys

## Render deployment

Render uses the repository's Dockerfile. The container installs FFmpeg and Myanmar-capable fonts, then starts `node server.js`. The health check is `/api/health`.

Set any server-side keys in Render Environment. The current app's upload endpoint is limited to 500 MB. The in-memory render queue/status and local `uploads/` / `work/` files are not durable across restarts or redeploys. Configure persistent storage and a durable job/database layer before relying on long-running jobs or persistent user projects. A Render free instance is not suitable for arbitrary large movie rendering.

## Current pipeline and known limitations

The existing one-click workflow calls the real transcription, translation, recap, TTS, and FFmpeg render endpoints. It is not a guaranteed one-click operation for every file: provider quotas, API availability, server resources, and input formats can cause a stage to fail. Retry after correcting the reported issue.

- Fast transcription: Groq Whisper `whisper-large-v3-turbo`.
- Recap generation: Groq chat completion.
- Burmese subtitle translation: Gemini model fallback.
- Narration: Microsoft Edge TTS Myanmar voices.
- Rendering: backend FFmpeg.
- Browser project state: some text/settings are stored locally; uploaded video and generated media are not reliably persisted after reload.
- Uploads above 500 MB, resumable chunk uploads, durable job recovery, object storage, and a fully persistent project database are not implemented yet.
- Thumbnail output is currently generated from a rendered video frame; it is not a separate AI image-generation call.

Use only videos you own or are authorized to process, and respect copyright and provider terms.
