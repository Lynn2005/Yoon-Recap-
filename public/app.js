let step=1;
let videoFile=null, finalFile=null, thumbFile=null, videoURL="", finalURL="", thumbURL="";
let whisperer=null, busy=false;
const $=id=>document.getElementById(id);

function setStep(n){
  step=n;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page"+n));
  document.querySelectorAll(".step").forEach(b=>b.classList.toggle("active",Number(b.dataset.step)===n));
  window.scrollTo(0,0);
  saveText();
}
function saveText(){
  try{
    localStorage.setItem("yoon-recap-text",JSON.stringify({
      transcript:$("transcript").value,
      translation:$("translation").value,
      voiceText:$("voiceText").value
    }));
  }catch(e){}
}
function loadText(){
  try{
    const x=JSON.parse(localStorage.getItem("yoon-recap-text")||"{}");
    $("transcript").value=x.transcript||"";
    $("translation").value=x.translation||"";
    $("voiceText").value=x.voiceText||"";
  }catch(e){}
}
function showStatus(id,msg){$(id).textContent=msg}

function chooseVideo(){
  $("videoFile").click();
}
async function onVideo(e){
  const f=e.target.files&&e.target.files[0];
  if(!f)return;
  videoFile=f;
  if(videoURL)URL.revokeObjectURL(videoURL);
  videoURL=URL.createObjectURL(f);
  $("video").src=videoURL;
  $("videoBox").hidden=false;
  $("uploadTitle").textContent=f.name;
  $("fileInfo").textContent=(f.size/1024/1024).toFixed(1)+" MB • Video ready";
  showStatus("status2","Video ready");
}
function nextFromUpload(){
  if(!videoFile){alert("အရင်ဆုံး Video ရွေးပါ။");return}
  setStep(2);
  showStatus("status2","✓ Video ရပါပြီ။ Auto Transcript သို့မဟုတ် ကိုယ်တိုင်ရေးနိုင်ပါတယ်။");
}
function copyTranscript(){
  const t=$("transcript").value.trim();
  if(!t){showStatus("status2","Transcript အရင်ထည့်ပါ။");return}
  $("translation").value=t;
  saveText();
  showStatus("status2","✓ Transcript ကို Recap box ထဲကူးပြီးပါပြီ။");
}

async function getWhisper(){
  if(whisperer)return whisperer;
  showStatus("status2","⏳ Free Whisper model ကို download လုပ်နေပါတယ်...");
  const mod=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
  whisperer=await mod.pipeline("automatic-speech-recognition","Xenova/whisper-tiny",{dtype:"q8"});
  return whisperer;
}
function extractAudio(file){
  return new Promise(async(resolve,reject)=>{
    let url="";
    try{
      url=URL.createObjectURL(file);
      const v=document.createElement("video");
      v.src=url; v.preload="auto"; v.playsInline=true; v.muted=false;
      await new Promise((res,rej)=>{
        v.onloadedmetadata=res;
        v.onerror=()=>rej(new Error("Video audio မဖတ်နိုင်ပါ"));
      });
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)throw new Error("ဒီ browser မှာ audio processing မရပါ");
      const ctx=new AC();
      const src=ctx.createMediaElementSource(v);
      const dest=ctx.createMediaStreamDestination();
      src.connect(dest);
      const chunks=[];
      const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
      const rec=new MediaRecorder(dest.stream,{mimeType:mime});
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      rec.onerror=()=>reject(new Error("Audio recording failed"));
      rec.onstop=async()=>{
        try{src.disconnect();await ctx.close();}catch(e){}
        URL.revokeObjectURL(url);
        resolve(new Blob(chunks,{type:rec.mimeType||"audio/webm"}));
      };
      rec.start(1000);
      v.onended=()=>{if(rec.state!=="inactive")rec.stop()};
      await v.play();
    }catch(e){
      if(url)URL.revokeObjectURL(url);
      reject(e);
    }
  });
}
function resample(audio,target){
  const data=audio.getChannelData(0), ratio=audio.sampleRate/target;
  const out=new Float32Array(Math.round(data.length/ratio));
  for(let i=0;i<out.length;i++)out[i]=data[Math.min(Math.floor(i*ratio),data.length-1)];
  return out;
}
async function autoTranscript(){
  if(busy)return;
  if(!videoFile){showStatus("status2","⚠️ Page 1 မှာ Video အရင်ရွေးပါ။");return}
  busy=true; $("autoBtn").disabled=true;
  try{
    showStatus("status2","🎧 Video အသံကို ဖတ်နေပါတယ်...");
    const blob=await extractAudio(videoFile);
    showStatus("status2","⏳ Whisper model download...");
    const pipe=await getWhisper();
    showStatus("status2","🧠 Transcript လုပ်နေပါတယ်...");
    const buf=await blob.arrayBuffer();
    const AC=window.AudioContext||window.webkitAudioContext;
    const ctx=new AC();
    const decoded=await ctx.decodeAudioData(buf);
    await ctx.close();
    const input=decoded.sampleRate===16000?decoded.getChannelData(0):resample(decoded,16000);
    const result=await pipe(input,{chunk_length_s:30,stride_length_s:5,return_timestamps:false});
    const text=(result.text||"").trim();
    $("transcript").value=text;
    if(!$("translation").value.trim())$("translation").value=text;
    if(!$("voiceText").value.trim())$("voiceText").value=$("translation").value;
    saveText();
    showStatus("status2",text?"✓ Auto Transcript ပြီးပါပြီ။":"⚠️ စကားသံ မတွေ့ပါ။");
  }catch(e){
    console.error(e);
    showStatus("status2","❌ "+(e.message||"Auto Transcript မအောင်မြင်ပါ"));
  }finally{
    busy=false;$("autoBtn").disabled=false;
  }
}
function populateVoices(){
  if(!("speechSynthesis" in window))return;
  const s=$("voice"), old=s.value;
  s.innerHTML='<option value="">Default Voice</option>';
  speechSynthesis.getVoices().forEach((v,i)=>{
    const o=document.createElement("option");
    o.value=String(i); o.textContent=v.name+" • "+v.lang; s.appendChild(o);
  });
  if(old)s.value=old;
}
function playVoice(){
  const text=$("voiceText").value.trim()||$("translation").value.trim();
  if(!text){showStatus("status3","စာသားထည့်ပါ။");return}
  $("voiceText").value=text;saveText();
  if(!("speechSynthesis" in window)){showStatus("status3","ဒီ browser မှာ Speech Voice မရပါ။");return}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  const i=parseInt($("voice").value);
  const voices=speechSynthesis.getVoices();
  const v=Number.isNaN(i)?null:voices[i];
  if(v){u.voice=v;u.lang=v.lang}else u.lang="my-MM";
  u.rate=.95;
  u.onstart=()=>showStatus("status3","▶ Voice playing...");
  u.onend=()=>showStatus("status3","✓ Voice ပြီးပါပြီ");
  speechSynthesis.speak(u);
}
function onFinal(e){
  finalFile=e.target.files&&e.target.files[0];
  if(!finalFile)return;
  if(finalURL)URL.revokeObjectURL(finalURL);
  finalURL=URL.createObjectURL(finalFile);
  $("finalPreview").src=finalURL;$("finalPreview").hidden=false;
}
function onThumb(e){
  thumbFile=e.target.files&&e.target.files[0];
  if(!thumbFile)return;
  if(thumbURL)URL.revokeObjectURL(thumbURL);
  thumbURL=URL.createObjectURL(thumbFile);
  $("thumbPreview").src=thumbURL;$("thumbPreview").hidden=false;
}
function downloadFile(file,name){
  if(!file){alert("ဖိုင်အရင်ထည့်ပါ။");return}
  const a=document.createElement("a");
  a.href=URL.createObjectURL(file);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function newProject(){
  if(!confirm("Project အသစ်စမလား?"))return;
  try{localStorage.removeItem("yoon-recap-text")}catch(e){}
  location.reload();
}
document.addEventListener("DOMContentLoaded",()=>{
  loadText();
  $("chooseVideo").addEventListener("click",chooseVideo);
  $("videoFile").addEventListener("change",onVideo);
  $("next1").addEventListener("click",nextFromUpload);
  $("autoBtn").addEventListener("click",autoTranscript);
  $("copyBtn").addEventListener("click",copyTranscript);
  $("next2").addEventListener("click",()=>{saveText();$("voiceText").value=$("voiceText").value||$("translation").value;saveText();setStep(3)});
  $("next3").addEventListener("click",()=>setStep(4));
  $("back2").addEventListener("click",()=>setStep(1));
  $("back3").addEventListener("click",()=>setStep(2));
  $("back4").addEventListener("click",()=>setStep(3));
  $("playBtn").addEventListener("click",playVoice);
  $("finalFile").addEventListener("change",onFinal);
  $("thumbFile").addEventListener("change",onThumb);
  $("downloadFinal").addEventListener("click",()=>downloadFile(finalFile,"Yoon-Recap-Final.mp4"));
  $("downloadThumb").addEventListener("click",()=>downloadFile(thumbFile,"Yoon-Recap-Thumbnail.png"));
  $("newBtn").addEventListener("click",newProject);
  $("newBtn2").addEventListener("click",newProject);
  document.querySelectorAll(".step").forEach(b=>b.addEventListener("click",()=>{
    const n=Number(b.dataset.step);
    if(n===1||videoFile||n===2)setStep(n);
  }));
  ["transcript","translation","voiceText"].forEach(id=>$(id).addEventListener("input",saveText));
  if("speechSynthesis" in window){
    speechSynthesis.onvoiceschanged=populateVoices;
    populateVoices();
  }
});
