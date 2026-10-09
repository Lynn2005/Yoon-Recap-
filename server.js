import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {execFile} from "child_process";
import {promisify} from "util";
import {MsEdgeTTS,OUTPUT_FORMAT} from "msedge-tts";
const execFileAsync=promisify(execFile);

const app=express();
const PORT=process.env.PORT||3000;
fs.mkdirSync("uploads",{recursive:true});
fs.mkdirSync("work",{recursive:true});
const DEFAULT_MYANMAR_FONTS=[
  "/usr/share/fonts/noto/NotoSansMyanmar-Regular.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansMyanmarUI-Regular.ttf",
  "/usr/share/fonts/google-noto/NotoSansMyanmar-Regular.ttf",
  "/usr/share/fonts/TTF/NotoSansMyanmar-Regular.ttf"
];
const MYANMAR_FONT_FILE=process.env.MYANMAR_FONT_FILE||DEFAULT_MYANMAR_FONTS.find(fs.existsSync)||DEFAULT_MYANMAR_FONTS[0];
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
function geminiKeysOf(req){
 const keys=[
   req.body?.geminiKey,
   req.headers["x-gemini-api-key"],
   process.env.GEMINI_API_KEY,
 ].map(v=>String(v||"").trim()).filter(Boolean);
 return [...new Set(keys)];
}
function geminiKeyOf(req){return geminiKeysOf(req)[0]||"";}
const GEMINI_MODELS=["gemini-2.5-flash","gemini-2.0-flash","gemini-2.5-flash-lite"];
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
app.get("/api/health",(req,res)=>res.json({ok:true,name:"Yoon Recap",version:"4.6.1",provider:"groq+gemini+MyanmarTTS",models:["whisper-large-v3-turbo",...GEMINI_MODELS],tts:"MyanmarTTS-free",ttsSpace:"freococo/MyanmarTTS",geminiFallback:true,retryDelaysMs:RETRY_DELAYS}));

app.post("/api/transcribe",upload.single("video"),async(req,res)=>{
 const file=req.file,key=keyOf(req);if(!file)return res.status(400).json({error:"Video ရွေးပါ။"});if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});
 const audioPath=path.join("work",file.filename+"-audio.ogg");
 try{await extractAudio(file.path,audioPath);const form=new FormData();form.append("file",new Blob([fs.readFileSync(audioPath)],{type:"audio/ogg"}),"audio.ogg");form.append("model","whisper-large-v3-turbo");form.append("response_format","verbose_json");form.append("temperature","0");const data=await groq("/audio/transcriptions",key,{method:"POST",body:form});const text=String(data.text||"").trim();if(!text)throw new Error("အသံထဲက စကားပြောစာသား မရပါ။");res.json({text,language:data.language||null,segments:data.segments||[],srt:makeSrt(data.segments,text)});}
 catch(e){res.status(500).json({error:e.message||"Transcription failed"});}finally{fs.unlink(file.path,()=>{});fs.unlink(audioPath,()=>{});}
});

app.post("/api/translate-srt",async(req,res)=>{
 const keys=geminiKeysOf(req),srt=String(req.body?.srt||"").trim();
 if(!keys.length)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});if(!srt)return res.status(400).json({error:"Original SRT မရှိပါ။"});
 const parseBlocks=input=>String(input||"").replace(/\r/g,"").trim().split(/\n\s*\n/).map(block=>{
  const lines=block.split("\n"),ti=lines.findIndex(line=>/^\s*\d+\s*$/.test(line));
  if(ti<0||!/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(lines[ti+1]||""))return null;
  const tm=lines[ti+1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
  const sec=t=>{const [h,m,r]=t.split(":");const [ss,ms]=r.split(",");return Number(h)*3600+Number(m)*60+Number(ss)+Number(ms)/1000};
  return {number:lines[ti].trim(),start:sec(tm[1]),end:sec(tm[2]),text:lines.slice(ti+2).join("\n").trim()};
 }).filter(x=>x&&x.text);
 const graphemeCount=t=>Array.from(String(t||"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()).length;
 try{
  const source=parseBlocks(srt);
  if(!source.length)return res.status(400).json({error:"Valid SRT မဟုတ်ပါ။"});
  const prompt="Translate every subtitle into natural, fluent spoken Burmese suitable for a Myanmar movie-recap AI voice. Preserve the complete meaning, story order, character relationships, names, numbers, money amounts, and all details. Use concise natural spoken Burmese; split overly long dialogue only by keeping the SAME number of subtitle blocks (do not split or merge blocks). Do not add explanations or invent events. Keep subtitle numbering and timestamps exactly as supplied for now. Return ONLY valid SRT. SOURCE SRT:\n"+srt.slice(0,180000);
  let lastErr=null,translated=null;
  for(const key of keys){
   try{
    const data=await geminiGenerate(key,"gemini-3.8-flash",prompt);
    const candidate=cleanSrtText(geminiText(data)),parsed=parseBlocks(candidate);
    if(!validSrt(candidate)||parsed.length!==source.length)throw new Error("ဘာသာပြန် SRT အပိုင်းအရေအတွက် မကိုက်ညီပါ။");
    if(parsed.some((b,i)=>b.number!==source[i].number||!b.text))throw new Error("SRT နံပါတ် သို့မဟုတ် စာသား မကိုက်ညီပါ။");
    translated=parsed;break;
   }catch(e){lastErr=e;}
  }
  if(!translated)throw lastErr||new Error("Gemini translation failed");
  // Repair broken source timing: retain the clip's overall time range, then allocate
  // each subtitle a natural duration proportional to its spoken-text length.
  const timelineStart=Math.min(...source.map(b=>b.start));
  const timelineEnd=Math.max(...source.map(b=>b.end));
  const span=timelineEnd-timelineStart;
  if(!Number.isFinite(span)||span<=0)throw new Error("SRT timeline မမှန်ပါ။");
  const weights=translated.map(b=>Math.max(1,graphemeCount(b.text)));
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  let cursor=timelineStart;
  const result=translated.map((b,i)=>{
   const start=cursor;
   const end=i===translated.length-1?timelineEnd:timelineStart+span*weights.slice(0,i+1).reduce((a,v)=>a+v,0)/totalWeight;
   cursor=end;
   return b.number+"\n"+srtTime(start)+" --> "+srtTime(Math.max(start+0.1,end))+"\n"+b.text;
  }).join("\n\n")+"\n";
  res.json({srt:result,text:translated.map(b=>b.text).join("\n"),timelineAdjusted:true,blocks:translated.length});
 }catch(e){res.status(422).json({error:e.message||"Gemini translation failed"});}
});

app.post("/api/prepare-voice-srt",async(req,res)=>{
 const keys=geminiKeysOf(req),srt=String(req.body?.srt||"").trim();
 if(!keys.length)return res.status(400).json({error:"Gemini API Key ထည့်ပါ။"});
 if(!srt)return res.status(400).json({error:"Burmese SRT မရှိပါ။"});
 const parseBlocks=input=>String(input||"").replace(/\r/g,"").trim().split(/\n\s*\n/).map(block=>{
  const lines=block.split("\n");
  const ti=lines.findIndex(line=>/^\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(line));
  if(ti<0)return null;
  return {number:lines.slice(0,ti).join("").trim(),time:lines[ti].trim(),text:lines.slice(ti+1).join("\n").trim()};
 }).filter(Boolean);
 const contentOnly=value=>String(value||"").replace(/<[^>]*>/g,"").replace(/[\s\p{P}\p{S}]/gu,"");
 try{
  const original=parseBlocks(srt);
  if(!original.length||original.some(block=>!block.text))return res.status(400).json({error:"Valid SRT မဟုတ်ပါ။"});
  const prompt="Make this Burmese subtitle SRT easier for Burmese AI voice to read naturally. Preserve the exact dialogue words, meaning, details, word order, subtitle order, subtitle numbers, timestamps, and number of blocks. Do not summarize, omit, add, translate, paraphrase, or replace any dialogue words. Only adjust punctuation and harmless spacing/line breaks for natural pauses. Return ONLY valid SRT, without markdown or explanations.\nSOURCE SRT:\n"+srt.slice(0,180000);
  let lastErr=null,out="";
  for(const key of keys){
   try{
    const data=await geminiGenerate(key,"gemini-3.8-flash",prompt);
    const candidate=cleanSrtText(geminiText(data)),prepared=parseBlocks(candidate);
    if(!validSrt(candidate)||prepared.length!==original.length)throw new Error("SRT block အရေအတွက် မကိုက်ညီပါ။");
    let safe=true;
    for(let i=0;i<original.length;i++){
     if(prepared[i].number!==original[i].number||prepared[i].time!==original[i].time||contentOnly(prepared[i].text)!==contentOnly(original[i].text)){safe=false;break;}
    }
    if(!safe)throw new Error("Content၊ စာသားအစီအစဉ် သို့မဟုတ် Timestamp ပြောင်းသွားသောကြောင့် မူရင်းစာသားကို ကာကွယ်ပြီး ပယ်ချလိုက်ပါတယ်။");
    out=candidate;break;
   }catch(e){lastErr=e;}
  }
  if(!out)throw lastErr||new Error("AI Voice SRT ပြင်ဆင်မှု မအောင်မြင်ပါ။");
  res.json({srt:out,contentPreserved:true,blocks:original.length});
 }catch(e){res.status(422).json({error:e.message||"AI Voice SRT preparation failed"});}
});

app.post("/api/tts",async(req,res)=>{
 const inputSrt=String(req.body?.srt||"").trim();
 const rawText=String(req.body?.text||"").trim();
 const voice=String(req.body?.voice||"my-MM-NilarNeural");
 const rate=Math.max(0.5,Math.min(1.5,Number(req.body?.rate||1)));
 const voiceName=voice==="myanmar-male"||voice==="my-MM-ThihaNeural"?"my-MM-ThihaNeural":"my-MM-NilarNeural";
 if(!inputSrt&&!rawText)return res.status(400).json({error:"AI Voice အတွက် စာသားမရှိပါ။"});
 const id="voice-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),dir=path.join("work",id+"-parts"),out=path.join("work",id+".wav");
 function parseSrt(s){
   return String(s||"").replace(/\r/g,"").split(/\n\s*\n/).map(block=>{
     const lines=block.split("\n"),m=lines.findIndex(x=>/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(x));
     if(m<0)return null;
     const tm=lines[m].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
     const sec=t=>{const [h,mi,rest]=t.split(":");const [se,ms]=rest.split(",");return +h*3600+ +mi*60+ +se+ +ms/1000};
     return {start:sec(tm[1]),end:sec(tm[2]),text:lines.slice(m+1).join(" ").replace(/<[^>]+>/g,"").trim()};
   }).filter(x=>x&&x.text);
 }
 function graphemes(s){return Array.from(new Intl.Segmenter("my",{granularity:"grapheme"}).segment(String(s||"")),x=>x.segment);}
 function split20(s,max=25){
   const g=graphemes(String(s||"").replace(/\s+/g," ").trim()),out=[];let rest=g;
   while(rest.length>max){
     let cut=max;
     for(let i=max;i>=Math.max(1,max-8);i--)if(/[\s၊၊။!?]/.test(rest[i-1])){cut=i;break;}
     const part=rest.slice(0,cut).join("").trim();if(part)out.push(part);
     rest=rest.slice(cut).join("").trim()?graphemes(rest.slice(cut).join("").trim()):[];
   }
   if(rest.length)out.push(rest.join("").trim());
   return out.filter(Boolean);
 }
 async function makeVoiceFile(text,index){
   const mp3=path.join(dir,String(index).padStart(4,"0")+".mp3");
   const tts=new MsEdgeTTS();
   await tts.setMetadata(voiceName,OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
   const edgeResult=await tts.toFile(dir,text,{rate});
   const edgePath=edgeResult?.audioFilePath||edgeResult?.audioFile||edgeResult;
   if(!edgePath||!fs.existsSync(edgePath))throw new Error("AI Voice audio file မဖန်တီးနိုင်ပါ။");
   if(String(edgePath)!==mp3)fs.renameSync(edgePath,mp3);
   const probe=await execFileAsync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",mp3],{maxBuffer:1024*1024});
   return {path:mp3,duration:Math.max(0.05,Number(probe.stdout)||0)};
 }
 try{
   fs.mkdirSync(dir,{recursive:true});
   const sourceBlocks=parseSrt(inputSrt);
   const blocks=sourceBlocks.length?sourceBlocks:[{start:0,end:0,text:rawText}];
   // Prepare all subtitle chunks first, then generate up to 3 voice files at once.
   // This avoids waiting for every single subtitle request sequentially.
   const jobs=[];
   for(let bi=0;bi<blocks.length;bi++){
     const maxChars=Math.max(15,Math.min(60,Number(req.body?.maxChars)||35));
     const parts=split20(blocks[bi].text,maxChars);
     for(const part of parts)jobs.push({text:part,index:jobs.length});
   }
   if(!jobs.length)throw new Error("AI Voice အတွက် စာသားမရှိပါ။");
   const made=new Array(jobs.length);
   let nextJob=0;
   const worker=async()=>{
     while(true){
       const j=nextJob++;
       if(j>=jobs.length)return;
       made[j]=await makeVoiceFile(jobs[j].text,jobs[j].index);
     }
   };
   await Promise.all(Array.from({length:Math.min(3,jobs.length)},()=>worker()));
   const audioParts=made.map(x=>x.path),voiceBlocks=[];
   let cursor=0;
   for(let i=0;i<jobs.length;i++){
     const dur=made[i].duration;
     voiceBlocks.push({start:cursor,text:jobs[i].text,duration:Math.max(0.05,dur)});
     cursor+=dur;
   }
   if(audioParts.length===1){
     await execFileAsync("ffmpeg",["-y","-i",audioParts[0],"-ac","1","-ar","22050","-c:a","pcm_s16le",out],{maxBuffer:5*1024*1024});
   }else{
     const listFile=path.join(dir,"concat.txt");
     fs.writeFileSync(listFile,audioParts.map(p=>"file '"+path.resolve(p).replace(/'/g,"'\\''")+"'").join("\n"),"utf8");
     await execFileAsync("ffmpeg",["-y","-f","concat","-safe","0","-i",listFile,"-ac","1","-ar","22050","-c:a","pcm_s16le",out],{maxBuffer:10*1024*1024});
   }
   let t=0;
   const voiceSrt=voiceBlocks.map((x,i)=>{const st=t;t+=x.duration;return (i+1)+"\n"+srtTime(st)+" --> "+srtTime(t)+"\n"+x.text}).join("\n\n")+"\n";
   res.json({id,url:"/media/"+path.basename(out),srt:voiceSrt,voiceSrt,chunks:voiceBlocks.length,voice:voiceName,rate,maxCharsPerLine:maxChars,provider:"Microsoft Edge AI TTS — Free"});
 }catch(e){
   res.status(500).json({error:e instanceof Error?e.message:String(e)});
 }finally{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}
});

app.post("/api/voice-to-srt",async(req,res)=>{
 const key=keyOf(req),voiceId=String(req.body?.voiceId||"").replace(/[^a-zA-Z0-9_-]/g,"");
 if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});
 if(!voiceId||!voiceId.startsWith("voice-"))return res.status(400).json({error:"AI Voice မတွေ့ပါ။ Burmese Recap Script ကနေ AI Voice အရင်ထုတ်ပါ။"});
 const audioPath=path.join("work",voiceId+".wav");
 if(!fs.existsSync(audioPath))return res.status(404).json({error:"AI Voice ဖိုင်မတွေ့ပါ။ AI Voice ကို ပြန်ထုတ်ပါ။"});
 try{
  const form=new FormData();form.append("file",new Blob([fs.readFileSync(audioPath)],{type:"audio/wav"}), "ai-voice.wav");form.append("model","whisper-large-v3-turbo");form.append("response_format","verbose_json");form.append("temperature","0");
  const data=await groq("/audio/transcriptions",key,{method:"POST",body:form});
  const spoken=String(data.text||"").trim();if(!spoken)throw new Error("AI Voice အသံထဲက စာသား မသိရှိနိုင်ပါ။");
  const srt=makeSrt(data.segments,spoken);if(!validSrt(srt))throw new Error("AI Voice SRT မမှန်ကန်ပါ။");
  fs.writeFileSync(path.join("work",voiceId+".srt"),srt,"utf8");
  res.json({srt,text:spoken,segments:Array.isArray(data.segments)?data.segments.length:0,language:data.language||null});
 }catch(e){res.status(500).json({error:e instanceof Error?e.message:String(e)});}
});
app.post("/api/recap",async(req,res)=>{
 const key=keyOf(req),transcript=String(req.body?.transcript||"").trim(),style=String(req.body?.style||"natural storytelling"),length=String(req.body?.length||"auto");
 if(!key)return res.status(400).json({error:"Groq API Key ထည့်ပါ။"});if(!transcript)return res.status(400).json({error:"Transcript မရှိပါ။"});
 try{const lengthGuide={"auto":"Choose a sensible length based on the transcript and story complexity, normally 700-1200 Burmese characters","1-2 minutes":"about 500-1000 Burmese characters","3-5 minutes":"about 1200-2500 Burmese characters","5-10 minutes":"about 2500-5000 Burmese characters","10-15 minutes":"about 5000-7500 Burmese characters"}[length]||"700-1200 Burmese characters";
 const prompt=`You are a professional Myanmar movie-recap writer. Return ONLY valid JSON with: "title": short Burmese title, "hook": one punchy Burmese opening sentence, "summary": 3-5 natural Burmese sentences, "recap": a natural spoken Burmese movie recap script, ${lengthGuide}. Style: ${style}. Rules: use ONLY events stated in the transcript, never invent scenes, names, motives or endings. Preserve story order and explain the ending when present. Casual spoken Burmese, easy to narrate, strong ending, no greetings, no hashtags. Transcript:\n${transcript.slice(0,120000)}`;
 const data=await groq("/chat/completions",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"openai/gpt-oss-120b",messages:[{role:"system",content:"You write natural spoken Burmese movie recaps. Follow the requested JSON schema exactly."},{role:"user",content:prompt}],temperature:0.5,response_format:{type:"json_object"},max_tokens:6000})});
 res.json(cleanJson(data.choices?.[0]?.message?.content||""));
 }catch(e){res.status(500).json({error:e.message||"Recap generation failed"});}
});

const renderJobs=new Map();
let renderRunning=false;

async function runRenderJob(job){
 const {video,logo,font,voice,srt,voiceId,body}=job;
 const base=path.basename(video.path),srtPath=path.join("work",base+"-my.srt"),out=path.join("work",base+"-final.mp4"),textPath=path.join("work",base+"-text.txt");
 try{
  if(srt)fs.writeFileSync(srtPath,srt,"utf8");fs.writeFileSync(textPath,String(body?.text||"Myanmar Recap"),"utf8");
  const showText=body?.showText==="1",showBlur=body?.showBlur==="1",showLogo=body?.showLogo==="1";
  // Match CSS-pixel editor controls to the actual FFmpeg output pixel dimensions.
  const inputProbe=JSON.parse((await execFileAsync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","json",video.path],{maxBuffer:1024*1024})).stdout);
  const sourceWidth=Number(inputProbe.streams?.[0]?.width||720),sourceHeight=Number(inputProbe.streams?.[0]?.height||1280);
  const outputScale=Math.min(1280/sourceWidth,1280/sourceHeight);
  const outputWidth=Math.max(2,Math.round(sourceWidth*outputScale/2)*2);
  const previewWidth=Math.max(1,Number(body?.previewWidth||360));
  const renderScale=outputWidth/previewWidth;
  const px=n=>Math.max(0,Math.round(Number(n||0)*renderScale));
  const fsx=Math.max(10,Math.min(300,px(body?.fontSize||28))),tx=Math.max(5,Math.min(95,Number(body?.textX||50))),ty=Math.max(5,Math.min(95,Number(body?.textY||88)));
  const bx=Math.max(5,Math.min(95,Number(body?.blurX||50))),by=Math.max(5,Math.min(95,Number(body?.blurY||82))),bw=Math.max(10,Math.min(100,Number(body?.blurW||90))),bh=Math.max(5,Math.min(80,Number(body?.blurH||22))),ba=Math.max(0,Math.min(80,px(body?.blurAmount??8)));
  const ls=Math.max(30,Math.min(600,px(body?.logoSize||72))),lx=Math.max(5,Math.min(95,Number(body?.logoX||90))),ly=Math.max(5,Math.min(95,Number(body?.logoY||10)));
  const fontStyle=String(body?.fontStyle||"noto");
  const textWeight=Math.max(100,Math.min(900,Number(body?.textWeight||800)));
  const sansFont=["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf","/usr/share/fonts/dejavu/DejaVuSans.ttf","/usr/share/fonts/TTF/DejaVuSans.ttf"].find(fs.existsSync);
  const boldFont=["/usr/share/fonts/truetype/noto/NotoSansMyanmar-Bold.ttf","/usr/share/fonts/noto/NotoSansMyanmar-Bold.ttf","/usr/share/fonts/google-noto/NotoSansMyanmar-Bold.ttf"].find(fs.existsSync);
  const fontFile=font?.path||(fontStyle==="sans"?(textWeight>=600&&sansFont?sansFont.replace(/DejaVuSans\.ttf$/,"DejaVuSans-Bold.ttf"):sansFont)||MYANMAR_FONT_FILE:(textWeight>=600&&boldFont?boldFont:MYANMAR_FONT_FILE));
  const safeFilterValue=v=>String(v||"").trim().replace(/\\/g,"/").replace(/'/g,"\\'");
  const fontColor=/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(String(body?.fontColor||""))?String(body.fontColor):"#ffffff";
  const borderColor=/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(String(body?.borderColor||""))?String(body.borderColor):"#000000";
  const borderWidth=Math.max(0,Math.min(30,px(body?.borderWidth??3)));
  const subtitleFontSize=Math.max(10,Math.min(300,px(body?.subtitleFontSize??28)));
  const subtitleBorderWidth=Math.max(0,Math.min(30,px(body?.subtitleBorderWidth??3)));
  const subtitleColor=/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(String(body?.subtitleColor||""))?String(body.subtitleColor):fontColor;
  const subtitleBorderColor=/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(String(body?.subtitleBorderColor||""))?String(body.subtitleBorderColor):borderColor;
  const f=[];let cur="[0:v]";
  // Cap the working video dimension to 1920px to prevent FFmpeg from exhausting Render Free memory on 2K/4K uploads.
  f.push(cur+"scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2[v0]");cur="[v0]";
  if(showBlur){
   f.push(cur+"split=2[blur_base][blur_crop_src]");
   // Crop and blur a region from the scaled video, then place the same region back.
   const cropX="min(max(0\\,iw*"+bx+"/100-ow/2)\\,iw-ow)";
   const cropY="min(max(0\\,ih*"+by+"/100-oh/2)\\,ih-oh)";
   f.push("[blur_crop_src]crop=w=trunc(iw*"+bw+"/100/2)*2:h=trunc(ih*"+bh+"/100/2)*2:x="+cropX+":y="+cropY+",boxblur=luma_radius="+ba+":luma_power=1[blur_patch]");
   f.push("[blur_base][blur_patch]overlay=x=trunc(main_w*"+bx+"/100-overlay_w/2):y=trunc(main_h*"+by+"/100-overlay_h/2)[vb]");
   cur="[vb]";
  }
  // Render the AI Voice 25-character SRT with the same font/color/border settings selected in the editor.
  // FFmpeg drawtext supports fontfile, fontcolor, bordercolor and borderw directly.
  const parseRenderSrt=s=>String(s||"").replace(/\r/g,"").split(/\n\s*\n/).map(block=>{
    const lines=block.split("\n"),m=lines.findIndex(x=>/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(x));
    if(m<0)return null;
    const tm=lines[m].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    const sec=t=>{const [h,mi,rest]=t.split(":");const [se,ms]=rest.split(",");return +h*3600+ +mi*60+ +se+ +ms/1000};
    return {start:sec(tm[1]),end:sec(tm[2]),text:lines.slice(m+1).join(" ").replace(/<[^>]+>/g,"").trim()};
  }).filter(x=>x&&x.text);
  const subtitleTextDir=path.join("work",base+"-subtitle-parts");
  fs.mkdirSync(subtitleTextDir,{recursive:true});
  const subtitleBlocks=srt?parseRenderSrt(srt):[];
  for(let si=0;si<subtitleBlocks.length;si++){
    const sb=subtitleBlocks[si],stp=path.join(subtitleTextDir,String(si).padStart(4,"0")+".txt");
    fs.writeFileSync(stp,sb.text,"utf8");
    const st=safeFilterValue(stp);
    const enable="between(t,"+sb.start+","+sb.end+")";
    f.push(cur+"drawtext=fontfile='"+safeFilterValue(fontFile)+"':textfile='"+st+"':fontsize="+subtitleFontSize+":fontcolor="+subtitleColor+":borderw="+subtitleBorderWidth+":bordercolor="+subtitleBorderColor+":x=w*"+tx+"/100-text_w/2:y=h*"+ty+"/100-text_h/2:fix_bounds=1:enable='"+enable+"'[sub"+si+"]");
    cur="[sub"+si+"]";
  }
  if(showText){
    const tp=safeFilterValue(textPath);
    const ff=safeFilterValue(fontFile);
    f.push(cur+"drawtext=fontfile='"+ff+"':textfile='"+tp+"':fontsize="+fsx+":fontcolor="+fontColor+":borderw="+borderWidth+":bordercolor="+borderColor+":x=w*"+tx+"/100-text_w/2:y=h*"+ty+"/100-text_h/2:fix_bounds=1[vt]");
    cur="[vt]";
  }
  const args=["-y","-hide_banner","-loglevel","error","-threads","1","-filter_threads","1","-filter_complex_threads","1","-i",video.path];
  if(voice)args.push("-i",voice.path);
  if(showLogo&&logo){const logoInputIndex=voice?2:1;f.push("["+logoInputIndex+":v]scale="+ls+":"+ls+"[lg]");f.push(cur+"[lg]overlay=x=main_w*"+lx+"/100-overlay_w/2:y=main_h*"+ly+"/100-overlay_h/2[vout]");cur="[vout]";args.push("-i",logo.path);}
  args.push("-filter_complex",f.join(";"),"-map",cur); if(voice)args.push("-map","1:a:0"); else args.push("-map","0:a:0?"); args.push("-c:v","libx264","-preset","ultrafast","-crf","24","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart","-shortest",out);
  job.progress=15;
  const result=await execFileAsync("ffmpeg",args,{maxBuffer:8*1024*1024});
  job.progress=100;job.state="done";job.url="/media/"+path.basename(out);job.filename=path.basename(out);
 }catch(e){
  const msg=e?.stderr||e?.message||"Final render failed";
  job.state="error";job.error=String(msg).slice(-6000);
 }finally{
  renderRunning=false;
  fs.unlink(video.path,()=>{});if(logo)fs.unlink(logo.path,()=>{});if(font)fs.unlink(font.path,()=>{});if(job.cleanupVoice&&voice?.path)fs.unlink(voice.path,()=>{});fs.unlink(srtPath,()=>{});fs.unlink(textPath,()=>{});try{fs.rmSync(path.join("work",base+"-subtitle-parts"),{recursive:true,force:true});}catch{}
  setTimeout(()=>renderJobs.delete(job.id),30*60*1000);
 }
}

app.post("/api/render",upload.fields([{name:"video",maxCount:1},{name:"logo",maxCount:1},{name:"voice",maxCount:1},{name:"font",maxCount:1}]),async(req,res)=>{
 const video=req.files?.video?.[0],logo=req.files?.logo?.[0],voice=req.files?.voice?.[0],font=req.files?.font?.[0],srt=String(req.body?.srt||"").trim(),voiceId=String(req.body?.voiceId||"").replace(/[^a-zA-Z0-9_-]/g,"");
 if(!video)return res.status(400).json({error:"Video ရွေးပါ။"});
 const savedVoicePath=voiceId?path.join("work",voiceId+".wav"):"";
 const renderVoice=voice||((voiceId&&fs.existsSync(savedVoicePath))?{path:savedVoicePath}:null);
 const id="render-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
 if(renderRunning){
   fs.unlink(video.path,()=>{});if(logo)fs.unlink(logo.path,()=>{});if(font)fs.unlink(font.path,()=>{});if(voice)fs.unlink(voice.path,()=>{});
   return res.status(429).json({error:"Final Video render တစ်ခု လုပ်နေပြီးသားပါ။ ပြီးသွားမှ ပြန်စမ်းပါ။"});
 }
 const job={id,video,logo,font,voice:renderVoice,cleanupVoice:!!voice,srt,voiceId,body:req.body,progress:5,state:"processing"};
 renderJobs.set(id,job);renderRunning=true;
 res.status(202).json({jobId:id,status:"processing",progress:5});
 setImmediate(()=>runRenderJob(job));
});

app.get("/api/render/status/:id",(req,res)=>{
 const job=renderJobs.get(String(req.params.id));
 if(!job)return res.status(404).json({error:"Render job မတွေ့ပါ။"});
 res.json({jobId:job.id,status:job.state,progress:job.progress||0,url:job.url||null,filename:job.filename||null,error:job.error||null});
});

app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"API endpoint မတွေ့ပါ။ Server ကို ပြန် Deploy လုပ်ပါ။"});
  next();
});
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(413).json({error:"Video size 500MB ထက် မကျော်ရပါ။"});
  res.status(500).json({error:err.message||"Server error"});
});
const httpServer=app.listen(PORT,"0.0.0.0",()=>console.log("Yoon Recap 2.0 running on "+PORT));
httpServer.keepAliveTimeout=120000;
httpServer.headersTimeout=125000;
httpServer.requestTimeout=0;
httpServer.timeout=0;
