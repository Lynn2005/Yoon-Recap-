import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {execFile} from "child_process";
import {promisify} from "util";

const execFileAsync=promisify(execFile);
const app=express(), PORT=process.env.PORT||3000;
const MAX_UPLOAD_MB=900;
const MAX_AUDIO_MB=20;
const upload=multer({dest:"uploads/",limits:{fileSize:MAX_UPLOAD_MB*1024*1024}});
app.use(express.json({limit:"5mb"})); app.use(express.static("public"));
app.get("/api/health",(req,res)=>res.json({ok:true,app:"Yoon Recap",transcription:"Gemini 3.5 Transcribe",maxUploadMB:MAX_UPLOAD_MB}));

function getGeminiKey(req){
  return String(req.body?.geminiKey||req.headers["x-gemini-api-key"]||process.env.GEMINI_API_KEY||"").trim();
}
async function geminiFetch(url,options={}){
  const key=options.geminiKey;
  const headers={...(options.headers||{}),"x-goog-api-key":key};
  const r=await fetch(url,{...options,headers});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{}
  if(!r.ok) throw new Error(data?.error?.message||text||("Gemini API "+r.status));
  return data;
}
async function uploadGeminiFile(filePath,mime,key){
  const size=fs.statSync(filePath).size;
  const start=await geminiFetch("https://generativelanguage.googleapis.com/upload/v1beta/files",{
    method:"POST",geminiKey:key,
    headers:{
      "X-Goog-Upload-Protocol":"resumable",
      "X-Goog-Upload-Command":"start",
      "X-Goog-Upload-Header-Content-Length":String(size),
      "X-Goog-Upload-Header-Content-Type":mime,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({file:{display_name:path.basename(filePath)}})
  });
  const uploadUrl=start?.upload_url||start?.headers?.["x-goog-upload-url"];
  if(!uploadUrl) throw new Error("Gemini upload URL မရပါ။");
  const stream=fs.createReadStream(filePath);
  const r=await fetch(uploadUrl,{
    method:"POST",
    headers:{
      "Content-Length":String(size),
      "X-Goog-Upload-Offset":"0",
      "X-Goog-Upload-Command":"upload, finalize",
      "Content-Type":mime
    },
    body:stream,
    duplex:"half"
  });
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{}
  if(!r.ok) throw new Error(data?.error?.message||text||("Gemini file upload "+r.status));
  return data.file||data;
}
async function waitGeminiFile(name,key){
  for(let i=0;i<120;i++){
    const f=await geminiFetch("https://generativelanguage.googleapis.com/v1beta/"+name,{geminiKey:key});
    if(f.state==="ACTIVE")return f;
    if(f.state==="FAILED")throw new Error("Gemini file processing failed.");
    await new Promise(r=>setTimeout(r,2500));
  }
  throw new Error("Gemini file processing timeout.");
}
function sec(v){
  if(typeof v==="number")return v;
  const s=String(v||"").trim();
  if(!s)return 0;
  const m=s.match(/(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if(m&&(m[1]||m[2]||m[3]))return (+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0);
  return parseFloat(s)||0;
}
function srtTime(x){
  x=Math.max(0,x); const h=Math.floor(x/3600),m=Math.floor(x%3600/60),s=Math.floor(x%60),ms=Math.floor((x-Math.floor(x))*1000);
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")+","+String(ms).padStart(3,"0");
}
function wordsToSrt(words,offset){
  const out=[]; let group=[],start=null,lastEnd=0;
  for(const w of words){
    const text=String(w.text||"").trim(); if(!text)continue;
    const a=offset+sec(w.start_offset), b=offset+sec(w.end_offset);
    if(start===null)start=a;
    group.push(text); lastEnd=b;
    const joined=group.join(" ");
    if(group.length>=11 || /[.!?၊။]$/.test(text) || (b-a>1.2 && group.length>=5)){
      out.push((out.length+1)+"\n"+srtTime(start)+" --> "+srtTime(lastEnd)+"\n"+joined+"\n");
      group=[]; start=null;
    }
  }
  if(group.length)out.push((out.length+1)+"\n"+srtTime(start)+" --> "+srtTime(lastEnd)+"\n"+group.join(" ")+"\n");
  return out.join("\n");
}
async function transcribeGeminiVideo(filePath,key){
  const job=path.join("work",path.basename(filePath)); fs.mkdirSync(job,{recursive:true});
  const audio=path.join(job,"audio.mp3");
  try{
    let probe;
    try{
      probe=await execFileAsync("ffprobe",["-v","error","-select_streams","a:0","-show_entries","stream=codec_name","-of","default=nw=1:nk=1",filePath],{maxBuffer:1024*1024});
    }catch{
      throw new Error("ဒီ Video မှာ အသံ(Audio) မပါပါ။ အသံပါတဲ့ MP4/MOV video ကို ပြန်တင်ပါ။");
    }
    if(!String(probe.stdout||"").trim()){
      throw new Error("ဒီ Video မှာ အသံ(Audio) မပါပါ။ အသံပါတဲ့ MP4/MOV video ကို ပြန်တင်ပါ။");
    }
    await execFileAsync("ffmpeg",["-y","-i",filePath,"-map","0:a:0","-vn","-ac","1","-ar","16000","-b:a","64k",audio],{maxBuffer:1024*1024});
    await execFileAsync("ffmpeg",["-y","-i",audio,"-f","segment","-segment_time","1500","-c","copy",path.join(job,"part-%03d.mp3")],{maxBuffer:1024*1024});
    const parts=fs.readdirSync(job).filter(x=>/^part-\d+\.mp3$/.test(x)).sort();
    let full="",allSrt=[],offset=0;
    for(const p of parts){
      const fp=path.join(job,p), size=fs.statSync(fp).size;
      if(size>MAX_AUDIO_MB*1024*1024)throw new Error("Audio chunk is too large. Please use a shorter video.");
      const file=await uploadGeminiFile(fp,"audio/mpeg",key);
      const active=await waitGeminiFile(file.name,key);
      const interaction=await geminiFetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
        method:"POST",geminiKey:key,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"gemini-3.5-transcribe",
          input:[{type:"audio",uri:active.uri,mime_type:active.mimeType||"audio/mpeg"}],
          generation_config:{transcription_config:{mode:{type:"verbatim",timestamp_granularities:["word"]}}}
        })
      });
      const text=interaction.output_text||"";
      full+=(full?"\n":"")+text;
      const words=[];
      for(const st of interaction.steps||[])for(const content of st.content||[])for(const ann of content.annotations||[]){
        if(ann.type==="word_info")words.push(ann);
      }
      if(words.length)allSrt.push(wordsToSrt(words,offset));
      const last=words.at(-1);
      if(last)offset+=sec(last.end_offset);
      else{
        const n=Number((p.match(/part-(\d+)/)||[])[1]||0);
        offset=(n+1)*1500;
      }
      try{await geminiFetch("https://generativelanguage.googleapis.com/v1beta/"+file.name,{method:"DELETE",geminiKey:key});}catch{}
    }
    return {text:full.trim(),srt:allSrt.filter(Boolean).map((x,i)=>x.replace(/^\d+/m,()=>String(i+1))).join("\n")};
  }finally{fs.rmSync(job,{recursive:true,force:true});}
}
app.post("/api/recap",async(req,res)=>{
  const key=getGeminiKey(req);
  if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});
  const transcript=String(req.body?.transcript||"").trim();
  const style=String(req.body?.style||"cinematic").trim();
  if(!transcript)return res.status(400).json({error:"Transcript မရှိပါ။"});
  const prompt=`You are a professional movie recap writer for Myanmar TikTok/Facebook short videos.
Return ONLY valid JSON with these keys:
summary: concise Myanmar summary in 3-5 sentences,
recap: natural spoken Burmese recap script, engaging and cinematic, 350-650 Burmese characters, no greetings, no hashtags, no invented events,
hook: one short Burmese hook sentence,
title: short Burmese recap title.
Rules: preserve the events and meaning in the transcript, do not invent facts, use casual natural Myanmar wording, make the ending engaging. Style: ${style}.
Transcript:
${transcript.slice(0,120000)}`;
  try{
    const data=await geminiFetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",geminiKey:key,headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gemini-3.5-flash",
        input:[{type:"user_input",content:[{type:"text",text:prompt}]}],
        generation_config:{response_mime_type:"application/json"}
      })
    });
    let raw=data.output_text||"";
    let parsed; try{parsed=JSON.parse(raw);}catch{
      const m=raw.match(/\{[\s\S]*\}/); if(m)parsed=JSON.parse(m[0]); else throw new Error("AI JSON response မရပါ။");
    }
    res.json(parsed);
  }catch(e){res.status(500).json({error:e.message||"Recap generation failed"});}
});
app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Video ရွေးပါ။"});
  const key=getGeminiKey(req);
  if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});
  try{const r=await transcribeGeminiVideo(req.file.path,key);res.json(r);}
  catch(e){res.status(500).json({error:e.message||"Gemini transcription failed"});}
  finally{fs.unlink(req.file?.path,()=>{});}
});
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError&&err.code==="LIMIT_FILE_SIZE")return res.status(413).json({error:"File size 900MB ထက်မကျော်ရပါ။"});next(err);});
app.listen(PORT,()=>console.log("Yoon Recap running on port "+PORT));
