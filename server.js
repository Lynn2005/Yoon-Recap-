import "dotenv/config";
import express from "express";
import multer from "multer";
import OpenAI from "openai";
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
app.get("/api/health",(req,res)=>res.json({ok:true,app:"Yoon Recap",maxUploadMB:MAX_UPLOAD_MB}));
function getClient(){if(!process.env.OPENAI_API_KEY)return null;return new OpenAI({apiKey:process.env.OPENAI_API_KEY});}
async function transcribeLargeVideo(filePath){
 const client=getClient(); if(!client)throw new Error("Render > Environment မှာ OPENAI_API_KEY ထည့်ပါ။");
 const job=path.join("work",path.basename(filePath)); fs.mkdirSync(job,{recursive:true});
 const audio=path.join(job,"audio.mp3");
 try{
  await execFileAsync("ffmpeg",["-y","-i",filePath,"-vn","-ac","1","-ar","16000","-b:a","64k",audio],{maxBuffer:1024*1024});
  await execFileAsync("ffmpeg",["-y","-i",audio,"-f","segment","-segment_time","1800","-c","copy",path.join(job,"part-%03d.mp3")],{maxBuffer:1024*1024});
  const parts=fs.readdirSync(job).filter(x=>/^part-\d+\.mp3$/.test(x)).sort();
  let full="";
  for(const p of parts){
   const size=fs.statSync(path.join(job,p)).size;
   if(size>MAX_AUDIO_MB*1024*1024)throw new Error("Audio chunk is too large. Please retry with a shorter video.");
   const r=await client.audio.transcriptions.create({file:fs.createReadStream(path.join(job,p)),model:"gpt-4o-transcribe",response_format:"text"});
   full+=(full?"\n":"")+(r.text||"");
  }
  return full;
 }finally{
  fs.rmSync(job,{recursive:true,force:true});
 }
}
app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Video ရွေးပါ။"});
 try{
  const text=await transcribeLargeVideo(req.file.path);
  res.json({text,segments:0});
 }catch(e){res.status(500).json({error:e.message||"Transcription failed"});}
 finally{fs.unlink(req.file?.path,()=>{});}
});
app.use((err,req,res,next)=>{if(err instanceof multer.MulterError&&err.code==="LIMIT_FILE_SIZE")return res.status(413).json({error:"File size 900MB ထက်မကျော်ရပါ။"});next(err);});
app.post("/api/translate",async(req,res)=>{
 const text=String(req.body?.text||"").trim();if(!text)return res.status(400).json({error:"စာသားထည့်ပါ။"});
 const client=getClient();if(!client)return res.status(500).json({error:"Render > Environment မှာ OPENAI_API_KEY ထည့်ပါ။"});
 try{const r=await client.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:"You are a Myanmar movie recap editor. Translate the transcript into natural, concise Burmese suitable for spoken movie/story recap narration. Preserve names and important details. Do not add explanations."},{role:"user",content:text}]});res.json({text:r.choices[0]?.message?.content||""});}
 catch(e){res.status(500).json({error:e.message||"Translation failed"});}
});
app.post("/api/tts",async(req,res)=>{
 const client=getClient();if(!client)return res.status(500).json({error:"Render > Environment မှာ OPENAI_API_KEY ထည့်ပါ။"});
 const text=String(req.body?.text||"").trim(),voice=req.body?.voice||"alloy";if(!text)return res.status(400).json({error:"စာသားထည့်ပါ။"});
 try{const speech=await client.audio.speech.create({model:"gpt-4o-mini-tts",voice,input:text,response_format:"mp3"});res.setHeader("Content-Type","audio/mpeg");res.send(Buffer.from(await speech.arrayBuffer()));}
 catch(e){res.status(500).json({error:e.message||"TTS failed"});}
});
app.listen(PORT,()=>console.log("Yoon Recap running on port "+PORT));