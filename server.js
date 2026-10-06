import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {execFile} from "child_process";
import {promisify} from "util";
const execFileAsync=promisify(execFile);

const app=express();
const PORT=process.env.PORT||3000;
const upload=multer({dest:"uploads/",limits:{fileSize:500*1024*1024}});
app.use(express.json({limit:"2mb"}));
app.use(express.static("public"));
app.use("/media",express.static("work"));

function keyOf(req){return String(req.body?.groqKey||req.headers["x-groq-api-key"]||process.env.GROQ_API_KEY||"").trim();}
async function groq(pathname,key,options={}){const r=await fetch("https://api.groq.com/openai/v1"+pathname,{...options,headers:{"Authorization":"Bearer "+key,...(options.headers||{})}});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data?.error?.message||text||("Groq API error "+r.status));return data;}
async function extractAudio(videoPath,audioPath){
  // Check first so videos without an audio stream get a clean user error.
  try{
    const probe=await execFileAsync("ffprobe",["-v","error","-select_streams","a:0","-show_entries","stream=index","-of","csv=p=0",videoPath],{maxBuffer:2*1024*1024});
    if(!String(probe.stdout||"").trim()) throw new Error("NO_AUDIO");
  }catch(err){
    if(err.message==="NO_AUDIO" || /Stream map.*matches no streams|Invalid argument/i.test(String(err.stderr||""))){
      throw new Error("ဒီ Video ထဲမှာ Audio track မပါပါ။ အသံပါတဲ့ video ကိုရွေးပါ။");
    }
    throw err;
  }
  try{
    await execFileAsync("ffmpeg",["-y","-i",videoPath,"-map","0:a:0","-vn","-ac","1","-ar","16000","-c:a","libopus","-b:a","48k",audioPath],{maxBuffer:10*1024*1024});
  }catch(err){
    throw new Error("Video Audio ကို extract မလုပ်နိုင်ပါ။ အသံပါတဲ့ video ကို ပြန်ရွေးပါ။");
  }
  if(!fs.existsSync(audioPath) || fs.statSync(audioPath).size<100) throw new Error("ဒီ Video ထဲမှာ Audio track မပါပါ။ အသံပါတဲ့ video ကိုရွေးပါ။");
}
function geminiKeyOf(req){return String(req.body?.geminiKey||req.headers["x-gemini-api-key"]||process.env.GEMINI_API_KEY||"").trim();}
const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.5-flash-lite"];
const RETRY_DELAYS=[1500,3000];

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function isRetryableGemini(status,message){
 const s=String(message||"").toLowerCase();
 return status===429 || status===500 || status===502 || status===503 || status===504 ||
   /high demand|service unavailable|temporarily unavailable|overloaded|rate limit|resource exhausted|timeout|deadline/i.test(s);
}

async function geminiGenerate(key,requestedModel,prompt){
 const preferred=GEMINI_MODELS.includes(requestedModel)?requestedModel:GEMINI_MODELS[0];
 const models=[preferred,...GEMINI_MODELS.filter(m=>m!==preferred)];
 let lastError=null;
 for(const model of models){
   for(let attempt=0;attempt<=RETRY_DELAYS.length;attempt++){
     try{
       const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{
         method:"POST",
         headers:{"Content-Type":"application/json"},
         body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.2}})
       });
       const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}
       if(r.ok)return data;
       const msg=data?.error?.message||text||("Gemini API error "+r.status);
       lastError=new Error(msg);lastError.status=r.status;
       if(!isRetryableGemini(r.status,msg))throw lastError;
       if(attempt<RETRY_DELAYS.length)await sleep(RETRY_DELAYS[attempt]);
       else break;
     }catch(e){
       lastError=e;
       if(!isRetryableGemini(e?.status,String(e?.message||e)))throw e;
       if(attempt<RETRY_DELAYS.length)await sleep(RETRY_DELAYS[attempt]);
     }
   }
 }
 throw new Error("Gemini models are temporarily unavailable. 3.8 → 3.7 → 3.5-lite fallback လုပ်ပြီး retry ပြုလုပ်ခဲ့ပေမယ့် မအောင်မြင်ပါ။ နောက်မှ ပြန်စမ်းပါ။");
}
function srtTime(sec){const ms=Math.max(0,Math.round(Number(sec||0)*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),z=ms%1000;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")+","+String(z).padStart(3,"0")}
function makeSrt(segments,text){const a=Array.isArray(segments)&&segments.length?segments:[{start:0,end:Math.max(1,text.length/12),text}];return a.map((x,i)=>(i+1)+"\n"+srtTime(x.start)+" --> "+srtTime(x.end)+"\n"+String(x.text||"").trim()).join("\n\n").trim()+"\n"}
function geminiText(data){return String(data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"").trim()}
function cleanSrtText(s){let x=String(s||"").trim();const ticks=String.fromCharCode(96).repeat(3);if(x.startsWith(ticks))x=x.replace(new RegExp("^"+ticks+"(?:srt|text)?","i"),"").replace(new RegExp(ticks+"$"),"").trim();return x.replace(/\r/g,"").trim()+"\n"}
function validSrt(s){return /\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(s)}
function cleanJson(s){
  const x=String(s||"").trim().replace(/^\`\`\`json/i,"").replace(/^\`\`\`/,"").replace(/\`\`\`$/,"").trim();
  const m=x.match(/\{[\s\S]*\}/); return JSON.parse(m?m[0]:x);
}
app.get("/api/health",(req,res)=>res.json({ok:true,name:"Yoon Recap",version:"4.1.0",provider:"groq+gemini",models:["whisper-large-v3-turbo",...GEMINI_MODELS,"gemini-3.8-flash-tts"],geminiFallback:true,retryDelaysMs:RETRY_DELAYS}));

app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
 const file=req.file,key=keyOf(req);if(!file)return res.status(400).json({error:"Video ရွေးပါ။"});if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});
 const audioPath=path.join("work",file.filename+"-audio.ogg");
 try{await extractAudio(file.path,audioPath);const form=new FormData();form.append("file",new Blob([fs.readFileSync(audioPath)],{type:"audio/ogg"}),"audio.ogg");form.append("model","whisper-large-v3-turbo");form.append("response_format","verbose_json");form.append("temperature","0");const data=await groq("/audio/transcriptions",key,{method:"POST",body:form});const text=String(data.text||"").trim();if(!text)throw new Error("အသံထဲက စကားပြောစာသား မရပါ။");res.json({text,language:data.language||null,segments:data.segments||[],srt:makeSrt(data.segments,text)});}
 catch(e){res.status(500).json({error:e.message||"Transcription failed"});}finally{fs.unlink(file.path,()=>{});fs.unlink(audioPath,()=>{});}
});

app.post("/api/translate-srt",async(req,res)=>{
 const key=geminiKeyOf(req),srt=String(req.body?.srt||"").trim();
 if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});if(!srt)return res.status(400).json({error:"Original SRT မရှိပါ။"});
 try{
  const prompt="Translate subtitle dialogue into natural spoken Burmese. Keep every subtitle number and timestamp EXACTLY unchanged, keep the same number of blocks, translate ONLY dialogue text, and return ONLY valid SRT. SOURCE SRT:\n"+srt.slice(0,180000);
  const data=await geminiGenerate(key,"gemini-3.8-flash",prompt),out=cleanSrtText(geminiText(data));
  if(!validSrt(out))throw new Error("Gemini က valid SRT မပြန်ပါ။");
  res.json({srt:out,text:out.replace(/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/g,"").replace(/\n{2,}/g,"\n").trim()});
 }catch(e){res.status(500).json({error:e.message||"Gemini translation failed"});}
});

app.post("/api/tts",async(req,res)=>{
 const key=geminiKeyOf(req),text=String(req.body?.text||"").trim(),voice=String(req.body?.voice||"Kore");
 if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});if(!text)return res.status(400).json({error:"AI Voice အတွက် စာသားမရှိပါ။"});
 const id="voice-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),out=path.join("work",id+".wav");
 try{
  // TTS ကို မြန်အောင် model ၂ ခုအတွင်းသာ fallback လုပ်ပြီး တစ်ခုစီကို တစ်ကြိမ်ပဲခေါ်ပါ။
  // အကြာကြီး hang မနေစေရန် request timeout ထည့်ထားသည်။
  const ttsModels=["gemini-3.8-flash-tts","gemini-3.7-flash-tts"];
  let data={},lastError=null;
  for(const model of ttsModels){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),60000);
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
        method:"POST",
        headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          input:[{type:"user_input",content:[{type:"text",text,annotations:[{type:"speech_metadata",style:"natural, clear, warm Myanmar movie recap narration"}]}]}],
          response_format:{type:"audio",mime_type:"audio/wav"},
          generation_config:{speech_config:[{voice}]}
        }),
        signal:controller.signal
      });
      const raw=await r.text();data={};try{data=JSON.parse(raw)}catch{}
      if(r.ok){
        lastError=null;
        break;
      }
      lastError=new Error(data?.error?.message||raw||("Gemini TTS error "+r.status));
      lastError.status=r.status;
      if(!isRetryableGemini(r.status,lastError.message))throw lastError;
    }catch(e){
      lastError=e.name==="AbortError"
        ? new Error("Gemini AI Voice server response 60 စက္ကန့်ကျော်နေပါတယ်။ Gemini TTS service ကို ပြန်စမ်းပါ။")
        : e;
      if(!isRetryableGemini(lastError?.status,String(lastError?.message||lastError)) && e.name!=="AbortError")throw lastError;
    }finally{
      clearTimeout(timer);
    }
    if(lastError?.message?.includes("အရမ်းကြာနေပါတယ်")) break;
  }
  if(lastError)throw lastError;
  let audio=data.output_audio?.data||null;
  for(const step of(data.steps||[]))for(const part of(step.content||[]))if(part?.type==="audio"&&part.data)audio=part.data;
  if(!audio)throw new Error("Gemini TTS audio data မရပါ။");
  fs.writeFileSync(out,Buffer.from(audio,"base64"));
  res.json({id,url:"/media/"+path.basename(out)});
 }catch(e){res.status(500).json({error:e.message||"Gemini TTS failed"});}
});
app.post("/api/recap",async(req,res)=>{
 const key=keyOf(req),transcript=String(req.body?.transcript||"").trim(),style=String(req.body?.style||"cinematic");
 if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});if(!transcript)return res.status(400).json({error:"Transcript မရှိပါ။"});
 try{const prompt=`You are a professional Myanmar movie-recap writer. Return ONLY valid JSON with: "title": short Burmese title, "hook": one punchy Burmese opening sentence, "summary": 3-5 natural Burmese sentences, "recap": a natural spoken Burmese movie recap script, about 350-650 Burmese characters. Style: ${style}. Rules: use ONLY events stated in the transcript, never invent scenes, names, motives or endings. Casual spoken Burmese, easy to narrate, strong ending, no greetings, no hashtags. Transcript:\n${transcript.slice(0,120000)}`;
 const data=await groq("/chat/completions",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"You write natural spoken Burmese movie recaps. Follow the requested JSON schema exactly."},{role:"user",content:prompt}],temperature:0.7,response_format:{type:"json_object"},max_tokens:1800})});
 res.json(cleanJson(data.choices?.[0]?.message?.content||""));
 }catch(e){res.status(500).json({error:e.message||"Recap generation failed"});}
});

app.post("/api/render",upload.fields([{name:"video",maxCount:1},{name:"logo",maxCount:1}]),async(req,res)=>{
 const video=req.files?.video?.[0],logo=req.files?.logo?.[0],srt=String(req.body?.srt||"").trim(),voiceId=String(req.body?.voiceId||"").replace(/[^a-zA-Z0-9_-]/g,"");
 if(!video)return res.status(400).json({error:"Video ရွေးပါ။"});if(!validSrt(srt))return res.status(400).json({error:"Burmese SRT မရှိပါ။"});
 const voicePath=path.join("work",voiceId+".wav");if(!voiceId||!fs.existsSync(voicePath))return res.status(400).json({error:"AI Voice file မတွေ့ပါ။"});
 const base=path.basename(video.path),srtPath=path.join("work",base+"-my.srt"),out=path.join("work",base+"-final.mp4"),textPath=path.join("work",base+"-text.txt");
 try{
  fs.writeFileSync(srtPath,srt,"utf8");fs.writeFileSync(textPath,String(req.body?.text||"Myanmar Recap"),"utf8");
  const showText=req.body?.showText==="1",showBlur=req.body?.showBlur==="1",showLogo=req.body?.showLogo==="1";
  const fsx=Math.max(14,Math.min(100,Number(req.body?.fontSize||28))),tx=Math.max(5,Math.min(95,Number(req.body?.textX||50))),ty=Math.max(5,Math.min(95,Number(req.body?.textY||88)));
  const bx=Math.max(5,Math.min(95,Number(req.body?.blurX||50))),by=Math.max(5,Math.min(95,Number(req.body?.blurY||82))),bw=Math.max(10,Math.min(100,Number(req.body?.blurW||90))),bh=Math.max(5,Math.min(80,Number(req.body?.blurH||22))),ba=Math.max(0,Math.min(24,Number(req.body?.blurAmount||8)));
  const ls=Math.max(30,Math.min(500,Number(req.body?.logoSize||72))),lx=Math.max(5,Math.min(95,Number(req.body?.logoX||90))),ly=Math.max(5,Math.min(95,Number(req.body?.logoY||10)));
  const f=[];let cur="[0:v]";
  if(showBlur){f.push(cur+"split=2[base][b0]");f.push("[b0]crop=w=trunc(iw*"+bw+"/100/2)*2:h=trunc(ih*"+bh+"/100/2)*2:x=iw*"+bx+"/100-w/2:y=ih*"+by+"/100-h/2,boxblur=luma_radius="+ba+":luma_power=1[bl]");f.push("[base][bl]overlay=x=iw*"+bx+"/100-overlay_w/2:y=ih*"+by+"/100-overlay_h/2[vb]");cur="[vb]";}
  const sp=srtPath.replace(/\\/g,"/").replace(/:/g,"\\:");f.push(cur+"subtitles='"+sp+"':fontsdir=/usr/share/fonts/noto:force_style='FontName=Noto Sans Myanmar,FontSize=20,Outline=2,Shadow=0,Alignment=2,MarginV=60'[vs]");cur="[vs]";
  if(showText){const tp=textPath.replace(/\\/g,"/");f.push(cur+"drawtext=fontfile="+fontFile+":textfile='"+tp+"':fontsize="+fsx+":fontcolor=white:borderw=3:bordercolor=black:x=w*"+tx+"/100-text_w/2:y=h*"+ty+"/100-text_h/2[vt]");cur="[vt]";}
  const args=["-y","-i",video.path,"-i",voicePath];
  if(showLogo&&logo){f.push("[2:v]scale="+ls+":"+ls+"[lg]");f.push(cur+"[lg]overlay=x=w*"+lx+"/100-overlay_w/2:y=h*"+ly+"/100-overlay_h/2[vout]");cur="[vout]";args.push("-i",logo.path);}
  args.push("-filter_complex",f.join(";"),"-map",cur,"-map","1:a:0","-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","192k","-movflags","+faststart","-shortest",out);
  await execFileAsync("ffmpeg",args,{maxBuffer:20*1024*1024});res.json({url:"/media/"+path.basename(out),filename:path.basename(out)});
 }catch(e){res.status(500).json({error:e.message||"Final render failed"});}
 finally{fs.unlink(video.path,()=>{});if(logo)fs.unlink(logo.path,()=>{});fs.unlink(srtPath,()=>{});fs.unlink(textPath,()=>{});}
});

app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"API endpoint မတွေ့ပါ။ Server ကို ပြန် Deploy လုပ်ပါ။"});
  next();
});
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(413).json({error:"Video size 500MB ထက် မကျော်ရပါ။"});
  res.status(500).json({error:err.message||"Server error"});
});
app.listen(PORT,()=>console.log("Yoon Recap 2.0 running on "+PORT));
