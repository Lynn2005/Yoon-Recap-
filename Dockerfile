FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-core fonts-noto-extra fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

# Gemini model compatibility patch. node:bookworm-slim does not include python3, so use sed.
# TTS path fallback: msedge-tts can return a valid audio file under a generated name;
# scan the working directory if audioFilePath/audioFile is not directly usable.
RUN sed -i 's/const GEMINI_MODELS=\["gemini-2\.5-flash","gemini-2\.0-flash","gemini-2\.5-flash-lite"\];/const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"];/' server.js \
    && sed -i 's/generationConfig:{temperature:\.2}/generationConfig:{}/' server.js \
    && sed -i 's#const edgePath=edgeResult?.audioFilePath||edgeResult?.audioFile||edgeResult;#const edgePath=(edgeResult?.audioFilePath||edgeResult?.audioFile||edgeResult); const actualEdgePath=(edgePath\&\&fs.existsSync(edgePath))?edgePath:fs.readdirSync(dir).map(n=>path.join(dir,n)).find(p=>{try{return fs.statSync(p).isFile()\&\&/\\.(mp3|webm|wav|ogg)$/i.test(p)}catch{return false}});#' server.js \
    && sed -i 's#if(!edgePath||!fs.existsSync(edgePath))throw new Error("AI Voice audio file မဖန်တီးနိုင်ပါ။");#if(!actualEdgePath||!fs.existsSync(actualEdgePath))throw new Error("AI Voice audio file မဖန်တီးနိုင်ပါ။ Microsoft Edge TTS က audio file မပြန်ပေးနိုင်သေးပါ။");#' server.js \
    && sed -i 's#fs.renameSync(edgePath,mp3);#fs.renameSync(actualEdgePath,mp3);#' server.js \
    && grep -q 'const actualEdgePath=' server.js

# Robust button handlers + touch edit + live preview playback.
RUN sed -i 's#</body>#<script src="/button-fix.js?v=2"></script><script src="/touch-edit.js?v=1"></script><script src="/live-preview-fix.js?v=2"></script></body>#' public/index.html

RUN mkdir -p uploads work
EXPOSE 10000
CMD ["node", "server.js"]
