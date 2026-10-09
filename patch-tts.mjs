import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");
const start = source.indexOf('app.post("/api/tts",async(req,res)=>{');
const end = source.indexOf('app.post("/api/recap",async(req,res)=>{', start);
if (start < 0 || end < 0) throw new Error("TTS endpoint markers not found");

const replacement = String.raw`app.post("/api/tts",async(req,res)=>{
 const inputSrt=String(req.body?.srt||"").trim();
 const rawText=String(req.body?.text||"").trim();
 const voice=String(req.body?.voice||"my-MM-NilarNeural");
 const requestedRate=Math.max(0.5,Math.min(1.5,Number(req.body?.rate||1)));
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
   }).filter(x=>x&&x.text&&x.end>x.start);
 }
 function graphemes(s){return Array.from(new Intl.Segmenter("my",{granularity:"grapheme"}).segment(String(s||"")),x=>x.segment);}
 function splitText(s,max=60){
   const g=graphemes(String(s||"").replace(/\s+/g," ").trim()),out=[];let rest=g;
   while(rest.length>max){
     let cut=max;
     for(let i=max;i>=Math.max(1,max-12);i--)if(/[\s၊၊။!?]/.test(rest[i-1])){cut=i;break;}
     const part=rest.slice(0,cut).join("").trim();if(part)out.push(part);
     rest=graphemes(rest.slice(cut).join("").trim());
   }
   if(rest.length)out.push(rest.join("").trim());
   return out.filter(Boolean);
 }
 async function makeVoiceFile(text,index){
   const mp3=path.join(dir,"raw-"+String(index).padStart(4,"0")+".mp3");
   const tts=new MsEdgeTTS();
   await tts.setMetadata(voiceName,OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
   const result=await tts.toStream(text,{rate:requestedRate});
   const stream=result?.audioStream||result;
   if(!stream)throw new Error("AI Voice audio stream မရပါ။");
   const chunks=[];
   for await(const chunk of stream){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));}
   const audio=Buffer.concat(chunks);
   if(audio.length<100)throw new Error("AI Voice audio data မရပါ။ Microsoft Edge TTS က audio data မပြန်ပေးနိုင်ပါ။");
   fs.writeFileSync(mp3,audio);
   const probe=await execFileAsync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",mp3],{maxBuffer:1024*1024});
   const duration=Number(probe.stdout);
   if(!Number.isFinite(duration)||duration<=0)throw new Error("AI Voice audio duration မဖတ်နိုင်ပါ။");
   return {path:mp3,duration};
 }
 function tempoFilter(factor){
   let f=Number(factor);if(!Number.isFinite(f)||f<=0)f=1;
   const filters=[];
   while(f>2){filters.push("atempo=2");f/=2;}
   while(f<0.5){filters.push("atempo=0.5");f/=0.5;}
   filters.push("atempo="+Math.max(0.5,Math.min(2,f)).toFixed(6));
   return filters.join(",");
 }
 async function fitToDuration(input,target,index){
   const fitted=path.join(dir,"fit-"+String(index).padStart(4,"0")+".wav");
   const probe=await execFileAsync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",input],{maxBuffer:1024*1024});
   const sourceDuration=Number(probe.stdout);
   if(!Number.isFinite(sourceDuration)||sourceDuration<=0)throw new Error("AI Voice duration မရပါ။");
   const safeTarget=Math.max(0.08,target);
   const factor=sourceDuration/safeTarget;
   await execFileAsync("ffmpeg",["-y","-i",input,"-af",tempoFilter(factor),"-t",String(safeTarget),"-ac","1","-ar","22050","-c:a","pcm_s16le",fitted],{maxBuffer:10*1024*1024});
   return fitted;
 }
 async function makeBlockAudio(text,target,index){
   const parts=splitText(text,60);
   if(!parts.length)throw new Error("AI Voice အတွက် စာသားမရှိပါ။");
   const raw=[];
   for(let i=0;i<parts.length;i++)raw.push((await makeVoiceFile(parts[i],index+"-"+i)).path);
   const natural=path.join(dir,"natural-"+String(index).padStart(4,"0")+".wav");
   if(raw.length===1){
     await execFileAsync("ffmpeg",["-y","-i",raw[0],"-ac","1","-ar","22050","-c:a","pcm_s16le",natural],{maxBuffer:10*1024*1024});
   }else{
     const list=path.join(dir,"raw-"+String(index).padStart(4,"0")+".txt");
     fs.writeFileSync(list,raw.map(p=>"file '"+path.resolve(p).replace(/'/g,"'\\''")+"'").join("\n"),"utf8");
     await execFileAsync("ffmpeg",["-y","-f","concat","-safe","0","-i",list,"-ac","1","-ar","22050","-c:a","pcm_s16le",natural],{maxBuffer:10*1024*1024});
   }
   return fitToDuration(natural,target,index);
 }
 async function makeSilence(seconds,index){
   const p=path.join(dir,"silence-"+String(index).padStart(4,"0")+".wav");
   await execFileAsync("ffmpeg",["-y","-f","lavfi","-i","anullsrc=r=22050:cl=mono","-t",String(Math.max(0.001,seconds)),"-c:a","pcm_s16le",p],{maxBuffer:5*1024*1024});
   return p;
 }
 try{
   fs.mkdirSync(dir,{recursive:true});
   const sourceBlocks=parseSrt(inputSrt);
   const blocks=sourceBlocks.length?sourceBlocks:[{start:0,end:0,text:rawText}];
   const finalParts=[];
   let cursor=0;
   for(let bi=0;bi<blocks.length;bi++){
     const b=blocks[bi];
     const target=Math.max(0.08,b.end>b.start?b.end-b.start:0);
     if(b.start>cursor+0.005)finalParts.push(await makeSilence(b.start-cursor,bi+"-gap"));
     const fitted=await makeBlockAudio(b.text,target,bi);
     finalParts.push(fitted);
     cursor=Math.max(cursor,b.end> b.start?b.end:b.start+target);
   }
   if(finalParts.length===1){
     await execFileAsync("ffmpeg",["-y","-i",finalParts[0],"-ac","1","-ar","22050","-c:a","pcm_s16le",out],{maxBuffer:10*1024*1024});
   }else{
     const listFile=path.join(dir,"timeline.txt");
     fs.writeFileSync(listFile,finalParts.map(p=>"file '"+path.resolve(p).replace(/'/g,"'\\''")+"'").join("\n"),"utf8");
     await execFileAsync("ffmpeg",["-y","-f","concat","-safe","0","-i",listFile,"-ac","1","-ar","22050","-c:a","pcm_s16le",out],{maxBuffer:15*1024*1024});
   }
   if(!fs.existsSync(out)||fs.statSync(out).size<100)throw new Error("AI Voice final audio file မဖန်တီးနိုင်ပါ။");
   const voiceSrt=sourceBlocks.length?sourceBlocks.map((x,i)=>(i+1)+"\n"+srtTime(x.start)+" --> "+srtTime(x.end)+"\n"+x.text).join("\n\n")+"\n":rawText?"1\n00:00:00,000 --> 00:00:00,000\n"+rawText+"\n":"";
   res.json({id,url:"/media/"+path.basename(out),srt:voiceSrt,voiceSrt,chunks:blocks.length,voice:voiceName,rate:requestedRate,autoFitTimeline:true,provider:"Microsoft Edge AI TTS — Free"});
 }catch(e){
   res.status(500).json({error:e instanceof Error?e.message:String(e)});
 }finally{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}
});
`;
source = source.slice(0,start) + replacement + source.slice(end);
fs.writeFileSync(file,source,"utf8");
console.log("Patched AI Voice to auto-fit every SRT block to its original timeline:",file);
