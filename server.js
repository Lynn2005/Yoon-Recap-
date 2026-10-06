import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const app=express();
const PORT=process.env.PORT||3000;
const upload=multer({dest:"uploads/",limits:{fileSize:500*1024*1024}});
app.use(express.json({limit:"5mb"}));
app.use(express.static("public"));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function keyOf(req){return String(req.body?.groqKey||req.headers["x-groq-api-key"]||process.env.GROQ_API_KEY||"").trim();}
async function gemini(url,key,options={}){
  const r=await fetch(url,{...options,headers:{"Content-Type":"application/json","x-goog-api-key":key,...(options.headers||{})}});
  const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
  if(!r.ok) throw new Error(data?.error?.message||text||("Gemini API error "+r.status));
  return data;
}
async function uploadFile(filePath,mime,key){
  const size=fs.statSync(filePath).size;
  const start=await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files",{
    method:"POST",
    headers:{
      "x-goog-api-key":key,
      "X-Goog-Upload-Protocol":"resumable",
      "X-Goog-Upload-Command":"start",
      "X-Goog-Upload-Header-Content-Length":String(size),
      "X-Goog-Upload-Header-Content-Type":mime,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({file:{display_name:path.basename(filePath)}})
  });
  const st=await start.text(); let sd={}; try{sd=JSON.parse(st)}catch{}
  if(!start.ok)throw new Error(sd?.error?.message||st||"Gemini upload start failed");
  const url=start.headers.get("x-goog-upload-url");
  if(!url)throw new Error("Gemini upload URL မရပါ။");
  const body=fs.readFileSync(filePath);
  const done=await fetch(url,{method:"POST",headers:{
    "Content-Length":String(size),
    "X-Goog-Upload-Offset":"0",
    "X-Goog-Upload-Command":"upload, finalize",
    "Content-Type":mime
  },body});
  const dt=await done.text(); let dd={}; try{dd=JSON.parse(dt)}catch{}
  if(!done.ok)throw new Error(dd?.error?.message||dt||"Gemini upload failed");
  return dd.file||dd;
}
async function waitFile(name,key){
  for(let i=0;i<60;i++){
    const f=await gemini("https://generativelanguage.googleapis.com/v1beta/"+name,key,{method:"GET",headers:{}});
    if(f.state==="ACTIVE"||!f.state)return f;
    if(f.state==="FAILED")throw new Error("Gemini က video/audio processing မအောင်မြင်ပါ။");
    await sleep(2000);
  }
  throw new Error("Gemini file processing အချိန်ကျော်သွားပါတယ်။");
}
function cleanJson(s){
  const x=String(s||"").trim().replace(/^\`\`\`json/i,"").replace(/^\`\`\`/,"").replace(/\`\`\`$/,"").trim();
  const m=x.match(/\{[\s\S]*\}/); return JSON.parse(m?m[0]:x);
}
app.get("/api/health",(req,res)=>res.json({ok:true,name:"Yoon Recap",version:"2.0.0"}));

app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
  const file=req.file,key=keyOf(req);
  if(!file)return res.status(400).json({error:"Video ရွေးပါ။"});
  if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});
  try{
    const mime=file.mimetype||"video/mp4";
    const uploaded=await uploadFile(file.path,mime,key);
    const active=await waitFile(uploaded.name,key);
    const prompt=`Transcribe the spoken audio in this video accurately.
Return ONLY the transcript text in natural Burmese/Myanmar language when Burmese is spoken.
If another language is spoken, preserve that language.
Do not summarize. Do not invent dialogue. Keep the original order.
`;
    const data=await gemini("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",key,{
      method:"POST",
      body:JSON.stringify({contents:[{role:"user",parts:[
        {text:prompt},
        {file_data:{mime_type:active.mimeType||mime,file_uri:active.uri}}
      ]}],generationConfig:{temperature:0.1}})
    });
    const text=data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim()||"";
    if(!text)throw new Error("အသံထဲက စကားပြောစာသား မရပါ။");
    res.json({text});
  }catch(e){res.status(500).json({error:e.message||"Transcription failed"});}
  finally{fs.unlink(file.path,()=>{});}
});

app.post("/api/recap",async(req,res)=>{
  const key=keyOf(req), transcript=String(req.body?.transcript||"").trim();
  const style=String(req.body?.style||"cinematic");
  if(!key)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});
  if(!transcript)return res.status(400).json({error:"Transcript မရှိပါ။"});
  try{
    const prompt=`You are a professional Myanmar movie-recap writer.
Return ONLY valid JSON with:
"title": short Burmese title,
"hook": one punchy Burmese opening sentence,
"summary": 3-5 natural Burmese sentences,
"recap": a natural spoken Burmese movie recap script, about 350-650 Burmese characters.
Style: ${style}.
Rules: use ONLY events stated in the transcript, never invent scenes, names, motives or endings. Casual spoken Burmese, easy to narrate, strong ending, no greetings, no hashtags.
Transcript:
${transcript.slice(0,120000)}`;
    const data=await gemini("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",key,{
      method:"POST",
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.7,responseMimeType:"application/json"}})
    });
    res.json(cleanJson(data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")));
  }catch(e){res.status(500).json({error:e.message||"Recap generation failed"});}
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(413).json({error:"Video size 500MB ထက် မကျော်ရပါ။"});
  res.status(500).json({error:err.message||"Server error"});
});
app.listen(PORT,()=>console.log("Yoon Recap 2.0 running on "+PORT));
