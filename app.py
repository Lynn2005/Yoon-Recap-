import asyncio
import re
import subprocess
import tempfile
from pathlib import Path
import requests
import streamlit as st
import edge_tts

st.set_page_config(page_title="Yoon Recap Studio", page_icon="🎬", layout="wide")
st.markdown("""<style>.block-container{max-width:1200px;padding-top:1rem}div[data-testid="stButton"] button,div[data-testid="stDownloadButton"] button{width:100%;min-height:2.7rem;border-radius:10px}</style>""", unsafe_allow_html=True)
st.title("🎬 Yoon Recap Studio")
st.caption("Video Upload → SRT → မြန်မာဘာသာပြန် → AI Voice → Final MP4 + Thumbnail")

DEFAULTS={"original_srt":"","burmese_srt":"","voice_bytes":None,"final_bytes":None,"thumbnail_bytes":None,"video_bytes":None,"video_name":"","project_name":"yoon_recap"}
for k,v in DEFAULTS.items():
    if k not in st.session_state: st.session_state[k]=v

with st.sidebar:
    st.header("🔑 API Keys")
    groq_key=st.text_input("Groq API Key",type="password")
    st.markdown("[Groq Key ရယူရန်](https://console.groq.com/keys)")
    gemini_key=st.text_input("Gemini API Key",type="password")
    st.markdown("[Gemini Key ရယူရန်](https://aistudio.google.com/app/apikey)")
    st.divider()
    st.session_state.project_name=st.text_input("Output ဖိုင်နာမည်",st.session_state.project_name).strip() or "yoon_recap"
    if st.button("🧹 New Project / အစမှပြန်စမယ်"):
        for k,v in DEFAULTS.items(): st.session_state[k]=v
        st.rerun()
    st.caption("Session ပြတ်လျှင် မသိမ်းရသေးသောအလုပ် ပျောက်နိုင်သည်။")

def cmd(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if p.returncode: raise RuntimeError((p.stderr or p.stdout or "FFmpeg error")[-2500:])
    return p.stdout.strip()

def stamp(sec):
    ms=max(0,int(round(float(sec)*1000))); h,rem=divmod(ms,3600000); m,rem=divmod(rem,60000); s,ms=divmod(rem,1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def transcribe(video,key,folder):
    cmd(["ffmpeg","-y","-i",video,"-vn","-ac","1","-ar","16000","-b:a","48k","-f","segment","-segment_time","600","-reset_timestamps","1",str(Path(folder)/"part_%03d.mp3")])
    parts=sorted(Path(folder).glob("part_*.mp3"))
    if not parts: raise RuntimeError("အသံမတွေ့ပါ။ Audio ပါသော video ကိုရွေးပါ။")
    segments=[]; offset=0.0
    for part in parts:
        with open(part,"rb") as f:
            r=requests.post("https://api.groq.com/openai/v1/audio/transcriptions",headers={"Authorization":"Bearer "+key},data={"model":"whisper-large-v3-turbo","response_format":"verbose_json","temperature":"0"},files={"file":(part.name,f,"audio/mpeg")},timeout=300)
        if not r.ok: raise RuntimeError(f"Groq API {r.status_code}: {r.text[:700]}")
        data=r.json()
        for x in data.get("segments",[]): segments.append((float(x.get("start",0))+offset,float(x.get("end",0))+offset,str(x.get("text","")).strip()))
        offset+=float(cmd(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(part)]))
    return "\n\n".join(f"{i}\n{stamp(a)} --> {stamp(b)}\n{t}" for i,(a,b,t) in enumerate((x for x in segments if x[2]),1))+"\n"

def translate(srt,key):
    prompt="Translate subtitle dialogue into natural spoken Burmese. Keep every number and timestamp unchanged. Return only SRT.\n\n"+srt[:180000]
    error="Gemini ဘာသာပြန်မအောင်မြင်ပါ။"
    for model in ["gemini-2.5-flash","gemini-2.0-flash"]:
        try:
            r=requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",params={"key":key},json={"contents":[{"parts":[{"text":prompt}]}],"generationConfig":{"temperature":0.2}},timeout=180)
            if not r.ok: error=f"{r.status_code}: {r.text[:500]}"; continue
            answer="".join(p.get("text","") for p in r.json()["candidates"][0]["content"]["parts"]).strip()
            answer=answer.strip(chr(96)).strip()
            if re.search(r"\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->",answer): return answer+"\n"
            error="Gemini က SRT ပုံစံမှန်မပြန်ပါ။"
        except Exception as e: error=str(e)
    raise RuntimeError(error)

async def voice_bytes(text,voice,rate):
    out=[]
    async for c in edge_tts.Communicate(text,voice,rate=rate).stream():
        if c["type"]=="audio": out.append(c["data"])
    if not out: raise RuntimeError("AI Voice မထွက်လာပါ။")
    return b"".join(out)

def dialogue(srt):
    lines=[]
    for line in srt.splitlines():
        x=line.strip()
        if x and not x.isdigit() and "-->" not in x: lines.append(x)
    return " ".join(lines)

def esc(path): return str(path).replace("\\","/").replace(":","\\:").replace("'","\\'")

def font():
    for p in ["/usr/share/fonts/truetype/noto/NotoSansMyanmar-Regular.ttf","/usr/share/fonts/truetype/noto/NotoSansMyanmar-VF.ttf","/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"]:
        if Path(p).exists(): return p
    return ""

tabs=st.tabs(["① Video Upload","② Transcript + Translate","③ AI Voice","④ Final Video + Thumbnail"])
with tabs[0]:
    st.subheader("Video Upload")
    up=st.file_uploader("Video ရွေးပါ (MP4/MOV/MKV/WEBM/AVI)",type=["mp4","mov","mkv","webm","avi"],key="video_up")
    if up:
        st.session_state.video_bytes=up.getvalue(); st.session_state.video_name=up.name
    if st.session_state.video_bytes:
        st.video(st.session_state.video_bytes)
        st.caption(f"{st.session_state.video_name} · {len(st.session_state.video_bytes)/1048576:.1f} MB")
    st.info("Streamlit Cloud မှာ ဖိုင်ကြီးတွေက memory/resource ကန့်သတ်ချက်ကြောင့် မအောင်မြင်နိုင်ပါ။ 900MB ဖိုင်များအတွက် ပိုအားကောင်းသော server လိုနိုင်သည်။")

with tabs[1]:
    st.subheader("Original Transcript / SRT")
    if st.button("🎧 Original SRT ထုတ်မယ်",disabled=not st.session_state.video_bytes or not groq_key):
        with st.spinner("Whisper transcription လုပ်နေပါတယ်..."):
            try:
                with tempfile.TemporaryDirectory() as td:
                    ext=Path(st.session_state.video_name or "video.mp4").suffix or ".mp4"
                    vp=Path(td)/("input"+ext); vp.write_bytes(st.session_state.video_bytes)
                    st.session_state.original_srt=transcribe(str(vp),groq_key,td)
                st.session_state.burmese_srt=""; st.session_state.voice_bytes=None
                st.success("Original SRT ပြီးပါပြီ။")
            except Exception as e: st.error(str(e))
    st.text_area("Original SRT (ပြင်နိုင်သည်)",key="original_srt",height=240)
    if st.session_state.original_srt: st.download_button("⬇️ Original SRT Download",st.session_state.original_srt,"original.srt","application/x-subrip")
    st.divider(); st.subheader("မြန်မာဘာသာပြန်")
    if st.button("🇲🇲 Gemini နဲ့ ဘာသာပြန်မယ်",disabled=not st.session_state.original_srt.strip() or not gemini_key):
        with st.spinner("ဘာသာပြန်နေပါတယ်..."):
            try: st.session_state.burmese_srt=translate(st.session_state.original_srt,gemini_key); st.success("ဘာသာပြန်ပြီးပါပြီ။")
            except Exception as e: st.error(str(e))
    st.text_area("Burmese SRT (ပြင်ဆင်နိုင်သည်)",key="burmese_srt",height=260)
    if st.session_state.burmese_srt: st.download_button("⬇️ Burmese SRT Download",st.session_state.burmese_srt,"burmese.srt","application/x-subrip")

with tabs[2]:
    st.subheader("AI Voice")
    vc=st.selectbox("အသံရွေးပါ",["မြန်မာ အမျိုးသမီး — Nilar","မြန်မာ အမျိုးသား — Thiha"])
    speed=st.slider("Voice Speed",0.7,1.3,1.0,0.1)
    if st.button("🎙️ AI Voice ထုတ်မယ်",disabled=not st.session_state.burmese_srt.strip()):
        name="my-MM-NilarNeural" if vc.startswith("မြန်မာ အမျိုးသမီး") else "my-MM-ThihaNeural"
        rate=f"{int(round((speed-1)*100)):+d}%"
        with st.spinner("AI Voice ဖန်တီးနေပါတယ်..."):
            try: st.session_state.voice_bytes=asyncio.run(voice_bytes(dialogue(st.session_state.burmese_srt),name,rate)); st.success("Voice ပြီးပါပြီ။")
            except Exception as e: st.error(str(e))
    if st.session_state.voice_bytes:
        st.audio(st.session_state.voice_bytes)
        st.download_button("⬇️ AI Voice Download",st.session_state.voice_bytes,f"{st.session_state.project_name}_voice.mp3","audio/mpeg")

with tabs[3]:
    st.subheader("Final Video Editor")
    c1,c2=st.columns(2)
    with c1:
        burn=st.checkbox("မြန်မာစာတန်းထိုး",True)
        pos=st.selectbox("Subtitle Position",["အောက်","အပေါ်"])
        fontsize=st.slider("စာတန်းအရွယ်အစား",14,42,24)
        mirror=st.checkbox("Mirror / ဘယ်ညာပြောင်း",False)
        blur=st.slider("Blur Amount (0=မရှိ)",0,20,0)
    with c2:
        mix=st.checkbox("မူရင်းအသံကို နောက်ခံအဖြစ်ထားမယ်",False)
        vol=st.slider("မူရင်းအသံ Volume (%)",0,100,15)
        text=st.text_input("Video ပေါ်စာသား",placeholder="Yoon Recap")
        tx=st.slider("စာသား X Position (%)",0,100,5)
        ty=st.slider("စာသား Y Position (%)",0,100,8)
    logo=st.file_uploader("Logo ပုံ (PNG/JPG, optional)",type=["png","jpg","jpeg"],key="logo")
    logo_x=st.slider("Logo X Position (%)",0,100,4)
    logo_y=st.slider("Logo Y Position (%)",0,100,5)
    if logo: st.image(logo,width=140)
    if st.button("🎬 Final MP4 Render",disabled=not st.session_state.video_bytes or not st.session_state.voice_bytes):
        with st.spinner("FFmpeg နဲ့ Render လုပ်နေပါတယ်..."):
            try:
                with tempfile.TemporaryDirectory() as td:
                    root=Path(td); ext=Path(st.session_state.video_name or "video.mp4").suffix or ".mp4"
                    vp=root/("input"+ext); ap=root/"voice.mp3"; op=root/"final.mp4"
                    vp.write_bytes(st.session_state.video_bytes); ap.write_bytes(st.session_state.voice_bytes)
                    filters=[]
                    if mirror: filters.append("hflip")
                    if blur: filters.append(f"boxblur={blur}:1")
                    if burn and st.session_state.burmese_srt.strip():
                        sp=root/"burmese.srt"; sp.write_text(st.session_state.burmese_srt,encoding="utf-8-sig")
                        align=2 if pos=="အောက်" else 8
                        filters.append(f"subtitles='{esc(sp)}':charenc=UTF-8:force_style='FontName=Noto Sans Myanmar,FontSize={fontsize},Outline=2,Shadow=1,Alignment={align},MarginV=28'")
                    fp=font()
                    if text.strip() and fp:
                        safe=text.replace("\\","\\\\").replace(":","\\:").replace("'","\\'").replace("%","\\%")
                        filters.append(f"drawtext=fontfile='{esc(fp)}':text='{safe}':fontcolor=white:fontsize=36:borderw=3:bordercolor=black:x=(w-text_w)*{tx/100:.3f}:y=(h-text_h)*{ty/100:.3f}")
                    args=["ffmpeg","-y","-i",str(vp),"-i",str(ap)]
                    graph=[]; vf=",".join(filters) if filters else "null"
                    if logo:
                        lp=root/("logo"+(Path(logo.name).suffix or ".png")); lp.write_bytes(logo.getvalue())
                        args += ["-i",str(lp)]
                        graph.append(f"[0:v]{vf}[base];[2:v]scale=iw*0.18:-1[lg];[base][lg]overlay=(W-w)*{logo_x/100:.3f}:(H-h)*{logo_y/100:.3f}[vout]")
                    else: graph.append(f"[0:v]{vf}[vout]")
                    if mix: graph.append(f"[0:a]volume={vol/100:.2f}[bg];[bg][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]")
                    args += ["-filter_complex",";".join(graph),"-map","[vout]"]
                    args += ["-map","[aout]"] if mix else ["-map","1:a:0"]
                    args += ["-c:v","libx264","-preset","ultrafast","-crf","23","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",str(op)]
                    cmd(args); st.session_state.final_bytes=op.read_bytes()
                    tp=root/"thumbnail.jpg"
                    ta=["ffmpeg","-y","-ss","1","-i",str(op),"-frames:v","1","-vf","scale=1280:-2"]
                    if text.strip() and fp:
                        safe=text.replace("\\","\\\\").replace(":","\\:").replace("'","\\'").replace("%","\\%")
                        ta[-1]+=f",drawtext=fontfile='{esc(fp)}':text='{safe}':fontcolor=white:fontsize=52:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-text_h-50"
                    ta.append(str(tp))
                    try: cmd(ta); st.session_state.thumbnail_bytes=tp.read_bytes()
                    except Exception: st.session_state.thumbnail_bytes=None
                st.success("Final Video ပြီးပါပြီ။")
            except Exception as e: st.error(f"Render error: {e}")
    if st.session_state.final_bytes:
        st.video(st.session_state.final_bytes)
        st.download_button("⬇️ Final MP4 Download",st.session_state.final_bytes,f"{st.session_state.project_name}.mp4","video/mp4")
    if st.session_state.thumbnail_bytes:
        st.subheader("Thumbnail"); st.image(st.session_state.thumbnail_bytes)
        st.download_button("⬇️ Thumbnail Download",st.session_state.thumbnail_bytes,f"{st.session_state.project_name}_thumbnail.jpg","image/jpeg")
    st.caption("Logo ကို အပေါ်ဘယ်ဘက်မှာ ထည့်ပေးသည်။ Blur သည် ဗီဒီယိုတစ်ခုလုံးကို သက်ရောက်သည်။")

st.divider()
st.caption("အရေးကြီး SRT၊ Voice၊ Final MP4 ကို အလုပ်ပြီးတိုင်း Download လုပ်ထားပါ။ Session ပြတ်လျှင် မသိမ်းရသေးသော data ပျောက်နိုင်သည်။")
