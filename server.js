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
app.use(express.static("public"));\napp.use("/media",express.static("work"));

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
async function geminiGenerate(key,model,prompt){
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.2}})});
 const text=await r.text();let data={};try{data=JSON.parse(text)}catch{}if(!r.ok)throw new Error(data?.error?.message||text||("Gemini API error "+r.status));return data;
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
app.get("/api/health",(req,res)=>res.json({ok:true,name:"Yoon Recap",version:"3.0.0",provider:"groq",models:["whisper-large-v3-turbo","llama-3.3-70b-versatile"]}));

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
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({model:"gemini-3.8-flash-tts",input:[{type:"user_input",content:[{type:"text",text,annotations:[{type:"speech_metadata",style:"natural, clear, warm Myanmar movie recap narration"}]}]}],response_format:{type:"audio",mime_type:"audio/wav"},generation_config:{speech_config:[{voice}]}})});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}if(!r.ok)throw new Error(data?.error?.message||raw||("Gemini TTS error "+r.status));
  let audio=data.output_audio?.data||null;for(const step of(data.steps||[]))for(const part of(step.content||[]))if(part?.type==="audio"&&part.data)audio=part.data;
  if(!audio)throw new Error("Gemini TTS audio data မရပါ။");fs.writeFileSync(out,Buffer.from(audio,"base64"));res.json({id,url:"/media/"+path.basename(out)});
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

app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"API endpoint မတွေ့ပါ။ Server ကို ပြန် Deploy လုပ်ပါ။"});
  next();
});
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(413).json({error:"Video size 500MB ထက် မကျော်ရပါ။"});
  res.status(500).json({error:err.message||"Server error"});
});
app.listen(PORT,()=>console.log("Yoon Recap 2.0 running on "+PORT));
