FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-core fonts-noto-extra fonts-sil-padauk fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Make Myanmar fonts deterministic for FFmpeg drawtext.
RUN mkdir -p /usr/share/fonts/TTF \
    && MYFONT="$(fc-match -f '%{file}' 'Noto Sans Myanmar' | head -n 1)" \
    && MYBOLD="$(fc-match -f '%{file}' 'Noto Sans Myanmar:style=Bold' | head -n 1)" \
    && PAD="$(fc-match -f '%{file}' 'Padauk' | head -n 1)" \
    && test -f "$MYFONT" \
    && test -f "$PAD" \
    && ln -sf "$MYFONT" /usr/share/fonts/TTF/NotoSansMyanmar-Regular.ttf \
    && if [ -f "$MYBOLD" ]; then ln -sf "$MYBOLD" /usr/share/fonts/TTF/NotoSansMyanmar-Bold.ttf; else ln -sf "$MYFONT" /usr/share/fonts/TTF/NotoSansMyanmar-Bold.ttf; fi \
    && ln -sf "$PAD" /usr/share/fonts/TTF/Padauk-Regular.ttf \
    && fc-cache -f

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

# Apply the TTS timeline and final-video rendering fixes at build time.
RUN node patch-tts.mjs && rm -f patch-tts.mjs

# Runtime compatibility patches.
RUN sed -i 's/const GEMINI_MODELS=\["gemini-2\.5-flash","gemini-2\.0-flash","gemini-2\.5-flash-lite"\];/const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"];/' server.js \
    && sed -i 's/generationConfig:{temperature:\.2}/generationConfig:{}/' server.js

# Robust button handlers + touch edit + live preview playback.
RUN sed -i 's#</body>#<script src="/button-fix.js?v=2"></script><script src="/touch-edit.js?v=1"></script><script src="/live-preview-fix.js?v=2"></script></body>#' public/index.html

RUN mkdir -p uploads work
EXPOSE 10000
CMD ["node", "server.js"]
