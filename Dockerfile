FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-core fonts-noto-extra fonts-sil-padauk fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/fonts/TTF \
    && PAD="$(fc-match -f '%{file}' 'Padauk' | head -n 1)" \
    && test -f "$PAD" \
    && ln -sf "$PAD" /usr/share/fonts/TTF/Padauk-Regular.ttf \
    && fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 10000
CMD ["sh", "-c", "streamlit run app.py --server.address 0.0.0.0 --server.port $PORT --server.headless true"]
