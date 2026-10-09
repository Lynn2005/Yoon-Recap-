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
RUN sed -i 's/const GEMINI_MODELS=\["gemini-2\.5-flash","gemini-2\.0-flash","gemini-2\.5-flash-lite"\];/const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"];/' server.js \
    && sed -i 's/generationConfig:{temperature:\.2}/generationConfig:{}/' server.js \
    && grep -q 'const GEMINI_MODELS=\["gemini-3.8-flash"' server.js

# Robust button handlers: AI Voice + Final Video.
RUN sed -i 's#</body>#<script src="/button-fix.js?v=2"></script></body>#' public/index.html

RUN mkdir -p uploads work
EXPOSE 10000
CMD ["node", "server.js"]
