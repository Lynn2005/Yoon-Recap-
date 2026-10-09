import os
import re
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import requests
import streamlit as st
import edge_tts

st.set_page_config(page_title="Yoon Recap Studio", page_icon="🎬", layout="centered")
st.title("🎬 Yoon Recap Studio")
st.caption("Video → Original SRT → Burmese translation → AI Voice → Final MP4")

st.markdown("""
<style>
.block-container{max-width:900px;padding-top:1.5rem}
.stButton>button{width:100%;min-height:2.8rem}
div[data-testid="stFileUploader"]{border-radius:12px}
</style>
""", unsafe_allow_html=True)

if "original_srt" not in st.session_state: st.session_state.original_srt = ""
if "burmese_srt" not in st.session_state: st.session_state.burmese_srt = ""
if "voice_bytes" not in st.session_state: st.session_state.voice_bytes = None
if "final_bytes" not in st.session_state: st.session_state.final_bytes = None

with st.sidebar:
    st.header("🔑 API Keys")
    groq_key = st.text_input("Groq API Key", type="password", help="Whisper transcription အတွက်")
    st.markdown("[Get Groq API Key](https://console.groq.com/keys)")
    gemini_key = st.text_input("Gemini API Key", type="password", help="မြန်မာဘာသာပြန်အတွက်")
    st.markdown("[Get Gemini API Key](https://aistudio.google.com/app/apikey)")
    st.caption("Key များကို Streamlit app ထဲတွင် session အတွက်သာ သုံးပါသည်။")

def run_cmd(args):
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or "Command failed")[-2500:])
    return p.stdout.strip()

def srt_time(seconds):
    ms = max(0, int(round(float(seconds) * 1000)))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def make_srt(segments, fallback_text=""):
    if not segments:
        return f"1\n00:00:00,000 --> 00:00:10,000\n{fallback_text.strip()}\n"
    blocks = []
    for i, seg in enumerate(segments, 1):
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        blocks.append(f"{i}\n{srt_time(seg.get('start', 0))} --> {srt_time(seg.get('end', 1))}\n{text}")
    return "\n\n".join(blocks) + "\n"

def groq_transcribe(video_path, api_key, workdir):
    audio_path = str(Path(workdir) / "audio.mp3")
    # Split into 10-minute audio files to stay below API upload limits.
    run_cmd(["ffmpeg", "-y", "-i", video_path, "-vn", "-ac", "1", "-ar", "16000",
             "-b:a", "48k", "-f", "segment", "-segment_time", "600", "-reset_timestamps", "1",
             str(Path(workdir) / "part_%03d.mp3")])
    parts = sorted(Path(workdir).glob("part_*.mp3"))
    if not parts:
        raise RuntimeError("Video ထဲမှ audio မထုတ်နိုင်ပါ။ အသံပါတဲ့ video ကိုရွေးပါ။")
    all_segments, all_text, offset = [], [], 0.0
    for part in parts:
        with open(part, "rb") as f:
            response = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                data={"model": "whisper-large-v3-turbo", "response_format": "verbose_json", "temperature": "0"},
                files={"file": (part.name, f, "audio/mpeg")}, timeout=300)
        if not response.ok:
            raise RuntimeError(f"Groq API: {response.status_code} {response.text[:800]}")
        data = response.json()
        all_text.append(str(data.get("text", "")).strip())
        for seg in data.get("segments", []):
            all_segments.append({"start": float(seg.get("start", 0)) + offset,
                                 "end": float(seg.get("end", 0)) + offset,
                                 "text": seg.get("text", "")})
        # Determine this chunk's duration for timestamp offsets.
        try:
            duration = float(run_cmd(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                      "-of", "default=noprint_wrappers=1:nokey=1", str(part)]))
        except Exception:
            duration = 600.0
        offset += duration
    return make_srt(all_segments, " ".join(all_text))

def translate_srt(srt, api_key):
    models = ["gemini-2.5-flash", "gemini-2.0-flash"]
    last_error = "Gemini translation failed"
    prompt = ("Translate only subtitle dialogue into natural spoken Burmese. Keep every subtitle number, "
              "timestamp, block order and block count unchanged. Return ONLY valid SRT.\n\n" + srt[:180000])
    for model in models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            r = requests.post(url, params={"key": api_key}, json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2}
            }, timeout=180)
            if not r.ok:
                last_error = f"{r.status_code}: {r.text[:500]}"
                continue
            data = r.json()
            text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip()
            text = re.sub(r"^\x60{3}(?:srt|text)?\s*|\s*\x60{3}$", "", text, flags=re.I).strip()
            if not re.search(r"\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->", text):
                last_error = "Gemini က valid SRT မပြန်ပါ။ ထပ်စမ်းပါ။"
                continue
            return text + "\n"
        except Exception as e:
            last_error = str(e)
    raise RuntimeError(last_error)

async def create_voice(text, voice, rate):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    if not chunks:
        raise RuntimeError("AI Voice audio မထုတ်နိုင်ပါ။")
    return b"".join(chunks)

def srt_to_ass(srt_path, ass_path):
    # FFmpeg can burn SRT directly; convert Myanmar UTF-8 subtitle with force_style.
    return

uploaded = st.file_uploader("🎬 Video Upload (MP4, MOV, MKV, WEBM)", type=["mp4","mov","mkv","webm","avi"])
if uploaded:
    st.video(uploaded)
    st.caption(f"ဖိုင်အရွယ်အစား: {uploaded.size / (1024*1024):.1f} MB")

st.divider()
st.subheader("1️⃣ Original Transcript / SRT")
if st.button("🎧 Audio ထုတ်ပြီး Original SRT ထုတ်မယ်", disabled=not uploaded or not groq_key):
    with st.spinner("FFmpeg နဲ့ audio ထုတ်ပြီး Whisper transcription လုပ်နေပါတယ်..."):
        try:
            with tempfile.TemporaryDirectory() as td:
                video_path = str(Path(td) / uploaded.name.replace("/", "_"))
                Path(video_path).write_bytes(uploaded.getbuffer())
                st.session_state.original_srt = groq_transcribe(video_path, groq_key, td)
            st.session_state.burmese_srt = ""
            st.success("Original SRT ပြီးပါပြီ။")
        except Exception as e:
            st.error(str(e))
st.text_area("Original SRT", key="original_srt", height=230)
if st.session_state.original_srt:
    st.download_button("⬇️ Original SRT Download", st.session_state.original_srt, "original.srt", "application/x-subrip")

st.divider()
st.subheader("2️⃣ Burmese Translation")
if st.button("🇲🇲 Gemini နဲ့ မြန်မာလို ဘာသာပြန်မယ်", disabled=not st.session_state.original_srt.strip() or not gemini_key):
    with st.spinner("Gemini နဲ့ ဘာသာပြန်နေပါတယ်..."):
        try:
            st.session_state.burmese_srt = translate_srt(st.session_state.original_srt, gemini_key)
            st.success("မြန်မာဘာသာပြန်ပြီးပါပြီ။ စာသားကို အောက်မှာ ပြင်နိုင်ပါတယ်။")
        except Exception as e:
            st.error(str(e))
st.text_area("Burmese SRT (ပြင်ဆင်နိုင်သည်)", key="burmese_srt", height=230)
if st.session_state.burmese_srt:
    st.download_button("⬇️ Burmese SRT Download", st.session_state.burmese_srt, "burmese.srt", "application/x-subrip")

st.divider()
st.subheader("3️⃣ AI Voice")
voice_choice = st.selectbox("အသံရွေးပါ", ["မြန်မာ အမျိုးသမီး — Nilar", "မြန်မာ အမျိုးသား — Thiha"])
speed = st.slider("Voice Speed", 0.5, 1.5, 1.0, 0.1)
if st.button("🎙️ Burmese AI Voice ထုတ်မယ်", disabled=not st.session_state.burmese_srt.strip()):
    voice_name = "my-MM-NilarNeural" if voice_choice.startswith("မြန်မာ အမျိုးသမီး") else "my-MM-ThihaNeural"
    rate_pct = int(round((speed - 1.0) * 100))
    rate = f"{rate_pct:+d}%"
    dialogue = re.sub(r"(?m)^\s*\d+\s*$", "", st.session_state.burmese_srt)
    dialogue = re.sub(r"(?m)^\d{2}:\d{2}:\d{2},\d{3}\s*-->.*$", "", dialogue)
    dialogue = " ".join(x.strip() for x in dialogue.splitlines() if x.strip())
    with st.spinner("AI Voice ဖန်တီးနေပါတယ်..."):
        try:
            import asyncio
            st.session_state.voice_bytes = asyncio.run(create_voice(dialogue, voice_name, rate))
            st.success("AI Voice ပြီးပါပြီ။")
        except Exception as e:
            st.error(f"AI Voice error: {e}")
if st.session_state.voice_bytes:
    st.audio(st.session_state.voice_bytes, format="audio/mp3")
    st.download_button("⬇️ AI Voice Download", st.session_state.voice_bytes, "yoon_voice.mp3", "audio/mpeg")

st.divider()
st.subheader("4️⃣ Final Video")
burn_subtitles = st.checkbox("မြန်မာစာတန်းထိုးပါ", value=True)
original_audio = st.checkbox("မူရင်းအသံကို နောက်ခံအသံအဖြစ် ထားမယ်", value=False)
if st.button("🎬 Final MP4 Render", disabled=not uploaded or not st.session_state.voice_bytes):
    with st.spinner("FFmpeg နဲ့ Final MP4 ထုတ်နေပါတယ်..."):
        try:
            with tempfile.TemporaryDirectory() as td:
                video_path = str(Path(td) / "input_video")
                Path(video_path).write_bytes(uploaded.getbuffer())
                voice_path = str(Path(td) / "voice.mp3")
                Path(voice_path).write_bytes(st.session_state.voice_bytes)
                output_path = str(Path(td) / "yoon_recap.mp4")
                args = ["ffmpeg", "-y", "-i", video_path, "-i", voice_path]
                if burn_subtitles and st.session_state.burmese_srt.strip():
                    srt_path = str(Path(td) / "burmese.srt")
                    Path(srt_path).write_text(st.session_state.burmese_srt, encoding="utf-8-sig")
                    # Escape drive colon and apostrophe for FFmpeg filter syntax.
                    escaped = srt_path.replace("\\", "/").replace(":", "\\:")
                    args += ["-vf", f"subtitles='{escaped}':charenc=UTF-8:force_style='FontName=Noto Sans Myanmar,FontSize=22,Outline=2,Shadow=1,Alignment=2,MarginV=36'"]
                if original_audio:
                    args += ["-filter_complex", "[0:a]volume=0.15[bg];[bg][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                             "-map", "0:v:0", "-map", "[aout]"]
                else:
                    args += ["-map", "0:v:0", "-map", "1:a:0"]
                args += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
                          "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", output_path]
                run_cmd(args)
                st.session_state.final_bytes = Path(output_path).read_bytes()
            st.success("Final Video ပြီးပါပြီ။")
        except Exception as e:
            st.error(f"Render error: {e}")
if st.session_state.final_bytes:
    st.video(st.session_state.final_bytes)
    st.download_button("⬇️ Final MP4 Download", st.session_state.final_bytes, "yoon_recap.mp4", "video/mp4")
