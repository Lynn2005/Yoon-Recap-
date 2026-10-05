import "dotenv/config";
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";

const app=express(), PORT=process.env.PORT||3000;
const MAX_UPLOAD_MB=900;
const upload=multer({dest:"uploads/",limits:{fileSize:MAX_UPLOAD_MB*1024*1024}});
app.use(express.json({limit:"5mb"})); app.use(express.static("public"));
app.get("/api/health",(req,res)=>res.json({ok:true,app:"Yoon Recap",maxUploadMB:MAX_UPLOAD_MB}));
function getClient(){if(!process.env.OPENAI_API_KEY)return null;return new OpenAI({apiKey:process.env.OPENAI_API_KEY});}
app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Video ရွေးပါ။"});
 const client=getClient();
 if(!client){fs.unlink(req.file.path,()=>{});return res.status(500).json({error:"Render > Environment မှာ OPENAI_API_KEY ထည့်ပါ။"});}
 try{const result=await client.audio.transcriptions.create({file:fs.createReadStream(req.file.path),model:"gpt-4o-transcribe",response_format:"verbose_json",timestamp_granularities:["segment"]});fs.unlink(req.file.path,()=>{});res.json({text:result.text||"",segments:(result.segments||[]).length});}
 catch(e){fs.unlink(req.file.path,()=>{});res.status(500).json({error:e.message||"Transcription failed"});}
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