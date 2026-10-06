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
app.use(express.json({limit:"5mb"}));
app.use(express.static("public"));

function keyOf(req){return String(req.body?.groqKey||req.headers["x-groq-api-key"]||process.env.GROQ_API_KEY||"").trim();}
async function groq(pathname,key,options={}){const r=await fetch("https://api.groq.com/openai/v1"+pathname,{...options,headers:{"Authorization":"Bearer "+key,...(options.headers||{})}});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data?.error?.message||text||("Groq API error "+r.status));return data;}
async function extractAudio(videoPath,audioPath){await execFileAsync("ffmpeg",["-y","-i",videoPath,"-vn","-ac","1","-ar","16000","-c:a","mp3","-b:a","64k",audioPath],{maxBuffer:10*1024*1024});}
function cleanJson(s){
  const x=String(s||"").trim().replace(/^\`\`\`json/i,"").replace(/^\`\`\`/,"").replace(/\`\`\`$/,"").trim();
  const m=x.match(/\{[\s\S]*\}/); return JSON.parse(m?m[0]:x);
}
app.get("/api/health",(req,res)=>res.json({ok:true,name:"Yoon Recap",version:"3.0.0",provider:"groq",models:["whisper-large-v3-turbo","llama-3.3-70b-versatile"]}));

app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
 const file=req.file,key=keyOf(req);if(!file)return res.status(400).json({error:"Video ရွေးပါ။"});if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});
 const audioPath=path.join("work",file.filename+"-audio.mp3");
 try{await extractAudio(file.path,audioPath);const form=new FormData();form.append("file",new Blob([fs.readFileSync(audioPath)],{type:"audio/mpeg"}),"audio.mp3");form.append("model","whisper-large-v3-turbo");form.append("response_format","verbose_json");form.append("temperature","0");const data=await groq("/audio/transcriptions",key,{method:"POST",body:form});const text=String(data.text||"").trim();if(!text)throw new Error("အသံထဲက စကားပြောစာသား မရပါ။");res.json({text,language:data.language||null});}
 catch(e){res.status(500).json({error:e.message||"Transcription failed"});}finally{fs.unlink(file.path,()=>{});fs.unlink(audioPath,()=>{});}
});

app.post("/api/recap",async(req,res)=>{
 const key=keyOf(req),transcript=String(req.body?.transcript||"").trim(),style=String(req.body?.style||"cinematic");
 if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});if(!transcript)return res.status(400).json({error:"Transcript မရှိပါ။"});
 try{const prompt=`You are a professional Myanmar movie-recap writer. Return ONLY valid JSON with: "title": short Burmese title, "hook": one punchy Burmese opening sentence, "summary": 3-5 natural Burmese sentences, "recap": a natural spoken Burmese movie recap script, about 350-650 Burmese characters. Style: ${style}. Rules: use ONLY events stated in the transcript, never invent scenes, names, motives or endings. Casual spoken Burmese, easy to narrate, strong ending, no greetings, no hashtags. Transcript:\n${transcript.slice(0,120000)}`;
 const data=await groq("/chat/completions",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:"You write natural spoken Burmese movie recaps. Follow the requested JSON schema exactly."},{role:"user",content:prompt}],temperature:0.7,response_format:{type:"json_object"},max_tokens:1800})});
 res.json(cleanJson(data.choices?.[0]?.message?.content||""));
 }catch(e){res.status(500).json({error:e.message||"Recap generation failed"});}
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(413).json({error:"Video size 500MB ထက် မကျော်ရပါ။"});
  res.status(500).json({error:err.message||"Server error"});
});
app.listen(PORT,()=>console.log("Yoon Recap 2.0 running on "+PORT));
