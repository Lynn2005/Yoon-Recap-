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

# Gemini model compatibility patch.
# Replace the model list in server.js regardless of its previous model version.
RUN python3 - <<'PY'
from pathlib import Path
p=Path('server.js')
s=p.read_text()
start=s.find('const GEMINI_MODELS=')
if start < 0:
    raise SystemExit('GEMINI_MODELS declaration not found')
end=s.find(';', start)
if end < 0:
    raise SystemExit('GEMINI_MODELS declaration end not found')
s=s[:start]+'const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"]'+s[end:]
s=s.replace('generationConfig:{temperature:.2}','generationConfig:{}')
p.write_text(s)
PY

RUN mkdir -p uploads work
EXPOSE 10000
CMD ["node", "server.js"]
