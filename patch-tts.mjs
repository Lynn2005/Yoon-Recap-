import fs from "fs";
import path from "path";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");
const start = source.indexOf(" async function makeVoiceFile(text,index){");
const end = source.indexOf("\n try{\n   fs.mkdirSync(dir", start);
if (start < 0 || end < 0) throw new Error("TTS function markers not found");
const replacement = ` async function makeVoiceFile(text,index){
   const mp3=path.join(dir,String(index).padStart(4,"0")+".mp3");
   const tts=new MsEdgeTTS();
   await tts.setMetadata(voiceName,OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
   const result=await tts.toStream(text,{rate});
   const audioStream=result?.audioStream||result;
   if(!audioStream)throw new Error("AI Voice audio stream မရပါ။");
   const chunks=[];
   for await(const chunk of audioStream){
     if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
   }
   const audio=Buffer.concat(chunks);
   if(audio.length<100)throw new Error("AI Voice audio data မရပါ။ Microsoft Edge TTS က audio data မပြန်ပေးနိုင်ပါ။");
   fs.writeFileSync(mp3,audio);
   const probe=await execFileAsync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",mp3],{maxBuffer:1024*1024});
   return {path:mp3,duration:Math.max(0.05,Number(probe.stdout)||0)};
 }
`;
source = source.slice(0,start) + replacement + source.slice(end);
fs.writeFileSync(file,source,"utf8");
console.log("Patched TTS makeVoiceFile to use stream output:",file);
