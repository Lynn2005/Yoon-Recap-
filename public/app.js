
window.yoonCleanProject = function(){
  const keep = new Set(['yoon_groq_key','yoon_gemini_key','groqKey','geminiKey']);
  try {
    for (let i=localStorage.length-1;i>=0;i--) {
      const k=localStorage.key(i);
      if(k && !keep.has(k) && !/api.?key/i.test(k)) localStorage.removeItem(k);
    }
    for (let i=sessionStorage.length-1;i>=0;i--) {
      const k=sessionStorage.key(i);
      if(k && !/api.?key/i.test(k)) sessionStorage.removeItem(k);
    }
  } catch(e) {}
  document.querySelectorAll('input[type="file"]').forEach(el=>{try{el.value='';}catch(e){}});
  document.querySelectorAll('textarea').forEach(el=>{el.value='';});
  document.querySelectorAll('input:not([type="file"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="password"])').forEach(el=>{if(el.id!=='groqKey'&&el.id!=='geminiKey')el.value='';});
  document.querySelectorAll('input[type="checkbox"]').forEach(el=>el.checked=!!el.defaultChecked);
  document.querySelectorAll('input[type="range"]').forEach(el=>{if(el.defaultValue!=='')el.value=el.defaultValue;});
  document.querySelectorAll('select').forEach(el=>el.selectedIndex=0);
  document.querySelectorAll('.status').forEach(el=>el.textContent='');
  ['preview','editVideo','voicePreview'].forEach(id=>{const el=document.getElementById(id);if(el){try{el.pause();}catch(e){}el.removeAttribute('src');el.load?.();if(id!=='editVideo')el.hidden=true;}});
  ['finalLink'].forEach(id=>{const el=document.getElementById(id);if(el){el.hidden=true;el.removeAttribute('href');}});
  ['blurLayer','logoPreview','textPreview'].forEach(id=>{const el=document.getElementById(id);if(el&&id!=='blurLayer')el.hidden=true;});
  const sub=document.getElementById('subtitlePreview');if(sub)sub.textContent='မြန်မာစာတန်းထိုး နမူနာ';
  document.querySelectorAll('.option-panel').forEach(el=>{if(el.id!=='subtitleControls')el.hidden=true;});
  const ep=document.getElementById('editorPreview');if(ep)ep.scrollTop=0;
  window.location.reload();
};

const $=id=>document.getElementById(id);
const voiceAudioEl = $("voicePreview");
if (voiceAudioEl) {
  voiceAudioEl.addEventListener("error", () => {
    const mediaError = voiceAudioEl.error;
    const code = mediaError ? mediaError.code : "unknown";
    const hints = {1:"အသံဖွင့်ခြင်းကို ရပ်တန့်လိုက်ပါတယ်။",2:"အသံဖိုင်ကို server ကနေ မရပါ။ AI Voice ကို ပြန်ထုတ်ပါ။",3:"အသံဖိုင်ဖတ်မရပါ။",4:"အသံဖိုင် format ကို browser မထောက်ပံ့ပါ။"};
    const vstatus = $("vstatus");
    if (vstatus) vstatus.textContent = "❌ AI Voice အသံဖိုင်ဖွင့်မရပါ (audio error " + code + ") — " + (hints[code] || "အသံဖိုင်ကို ပြန်ထုတ်ကြည့်ပါ။");
  });
}

let file=null,videoUrl=null,fontFile=null,customFontUrl=null,voiceUploadFile=null,voiceSrt="",voiceSrtReady=false,voiceId=localStorage.getItem("yoon_voice_id")||null,voiceUrl=localStorage.getItem("yoon_voice_url")||null,logoFile=null;


const savedGroq=localStorage.getItem("yoon_groq_key"),savedGemini=localStorage.getItem("yoon_gemini_key");
if(localStorage.getItem("yoon_original_srt"))$("originalSrt").value=localStorage.getItem("yoon_original_srt");
if(localStorage.getItem("yoon_voice_srt_ready")==="1"&&localStorage.getItem("yoon_burmese_srt")){voiceSrt=localStorage.getItem("yoon_burmese_srt");voiceSrtReady=!!voiceSrt.trim();$("burmeseSrt").value=voiceSrt;}else{$("burmeseSrt").value="";}if($("voiceSrt"))$("voiceSrt").value=localStorage.getItem("yoon_voice_srt")||"";
if(savedGroq)$("groqKey").value=savedGroq;if(savedGemini)$("geminiKey").value=savedGemini;
$("saveGroq").onclick=()=>{localStorage.setItem("yoon_groq_key",$("groqKey").value.trim());$("keyStatus").textContent="✅ Groq Key သိမ်းပြီးပါပြီ။"};
$("saveGemini").onclick=()=>{localStorage.setItem("yoon_gemini_key",$("geminiKey").value.trim());$("keyStatus").textContent="✅ Gemini Key သိမ်းပြီးပါပြီ။"};
const groq=()=>$("groqKey").value.trim(),gemini=()=>$("geminiKey").value.trim();
function status(id,msg){$(id).textContent=msg}
function errorText(v){if(v==null)return "";if(typeof v==="string")return v;if(v instanceof Error)return v.message||String(v);if(typeof v==="object"){return String(v.message||v.error||v.detail||v.reason||JSON.stringify(v));}return String(v)}
async function apiJson(r){
 const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{}
 if(!r.ok){
   if(r.status===502||r.status===503||r.status===504) throw Error("Server ခဏမရသေးပါ။ Render deploy/restart ဖြစ်နေခြင်း သို့မဟုတ် request timeout ဖြစ်နိုင်ပါတယ်။ 10 စက္ကန့်အကြာ ပြန်စမ်းပါ။");
   throw Error(errorText(d?.error)||t||("Request failed "+r.status));
 }
 if(!d)throw Error("Server က JSON မပြန်ပါ။");
 return d;
}
function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function postSrtWithRetry(url,srt,onRetry){
 let last=null;
 for(let attempt=0;attempt<3;attempt++){
  try{
   return await apiJson(await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geminiKey:gemini(),srt})}));
  }catch(e){
   last=e;
   const temporary=/Server ခဏမရသေးပါ|Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||e));
   if(!temporary||attempt===2)throw e;
   if(onRetry)onRetry(attempt+1);
   await new Promise(resolve=>setTimeout(resolve,3000*(attempt+1)));
  }
 }
 throw last||new Error("SRT request မအောင်မြင်ပါ။");
}

$("video").onchange=e=>{file=e.target.files?.[0];if(videoUrl)URL.revokeObjectURL(videoUrl);if(file){videoUrl=URL.createObjectURL(file);$("preview").src=videoUrl;$("preview").hidden=false;$("editVideo").src=videoUrl}};
async function prepareVoiceSrtAutomatically(srt,auto=false){
 srt=(srt||"").trim();if(!srt)throw Error("မြန်မာ SRT မရပါ။");
 if(!gemini())throw Error("Options ထဲမှာ Gemini API Key ထည့်ပြီး Save လုပ်ပါ။");
 const b=$("prepareVoiceSrt");if(b)b.disabled=true;
 status("trstatus","⏳ AI Voice SRT အဖြစ် အလိုအလျောက် ပြင်ဆင်နေပါတယ်...");
 if(auto)status("tstatus","⏳ မြန်မာဘာသာပြန်ပြီးပါပြီ။ AI Voice SRT ပြင်ဆင်နေပါတယ်...");
 try{
  const blocks=srt.replace(/\r/g,"").split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  if(!blocks.length)throw Error("Burmese SRT မဖတ်နိုင်ပါ။");
  const batchSize=8,total=Math.ceil(blocks.length/batchSize),prepared=[];
  for(let i=0;i<total;i++){
   status("trstatus","⏳ AI Voice SRT ပြင်ဆင်နေပါတယ်... ("+(i+1)+"/"+total+")");
   if(auto)status("tstatus","⏳ AI Voice SRT ပြင်ဆင်နေပါတယ်... ("+(i+1)+"/"+total+")");
   const batch=blocks.slice(i*batchSize,(i+1)*batchSize).join("\n\n");
   const d=await postSrtWithRetry("/api/prepare-voice-srt",batch,n=>{
    status("trstatus","🔄 Server ခဏမရလို့ "+(i+1)+"/"+total+" အပိုင်းကို ပြန်စမ်းနေပါတယ်...");
    if(auto)status("tstatus","🔄 Server ခဏမရလို့ "+(i+1)+"/"+total+" အပိုင်းကို ပြန်စမ်းနေပါတယ်...");
   });
   if(!d.srt)throw Error("AI Voice SRT အပိုင်း "+(i+1)+" မရပါ။");
   prepared.push(d.srt.trim());
  }
  const finalSrt=prepared.join("\n\n")+"\n";
  $("burmeseSrt").value=finalSrt;localStorage.setItem("yoon_burmese_srt",finalSrt);voiceSrtReady=true;localStorage.setItem("yoon_voice_srt_ready","1");
  status("trstatus","✅ AI Voice SRT အဆင်သင့်ဖြစ်ပါပြီ။ “AI Voice SRT Download” ကိုနှိပ်ပြီး သိမ်းနိုင်ပါတယ်။");
  if(auto)status("tstatus","✅ Original SRT → မြန်မာဘာသာပြန် → AI Voice SRT အားလုံးပြီးပါပြီ။");
  return true;
 }catch(e){voiceSrtReady=false;localStorage.removeItem("yoon_voice_srt_ready");status("trstatus","❌ AI Voice SRT ပြင်ဆင်မရပါ — "+e.message);if(auto)status("tstatus","❌ "+e.message);return false;}
 finally{if(b)b.disabled=false;}
}
async function translateSrtAutomatically(srt,auto=false){
 srt=(srt||"").trim();if(!srt){status("trstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");return false;}
 if(!gemini()){const msg="⚠️ Options ထဲမှာ Gemini API Key ထည့်ပြီး Save လုပ်ပါ။";status("trstatus",msg);if(auto)status("tstatus",msg);return false;}
 const b=$("translate");if(b)b.disabled=true;
 try{
  const blocks=srt.replace(/\r/g,"").split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  if(!blocks.length)throw Error("Original SRT မဖတ်နိုင်ပါ။");
  const batchSize=12,total=Math.ceil(blocks.length/batchSize),translated=[];
  voiceSrtReady=false;localStorage.removeItem("yoon_voice_srt_ready");
  for(let i=0;i<total;i++){
   const batch=blocks.slice(i*batchSize,(i+1)*batchSize).join("\n\n");
   const msg="⏳ မြန်မာဘာသာပြန်နေပါတယ်... ("+(i+1)+"/"+total+")";
   status("trstatus",msg);if(auto)status("tstatus",msg);
   const d=await postSrtWithRetry("/api/translate-srt",batch,n=>{status("trstatus","🔄 Server ခဏမရလို့ "+(i+1)+"/"+total+" အပိုင်းကို ပြန်စမ်းနေပါတယ်...");if(auto)status("tstatus","🔄 Server ခဏမရလို့ "+(i+1)+"/"+total+" အပိုင်းကို ပြန်စမ်းနေပါတယ်...");});
   const part=(d.srt||"").trim();if(!part)throw Error("SRT အပိုင်း "+(i+1)+" ကို ဘာသာမပြန်နိုင်ပါ။");
   translated.push(part);
  }
  const burmese=translated.join("\n\n")+"\n";
  $("burmeseSrt").value="";
  return await prepareVoiceSrtAutomatically(burmese,auto);
 }catch(e){const msg="❌ Auto Translate မအောင်မြင်ပါ — "+e.message;status("trstatus",msg);if(auto)status("tstatus",msg);return false}
 finally{if(b)b.disabled=false}
}
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!groq())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Video အသံကို extract လုပ်ပြီး Original SRT ထုတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",groq());const d=await apiJson(await fetch("/api/transcribe",{method:"POST",body:f}));$("originalSrt").value=d.srt||"";localStorage.setItem("yoon_original_srt",$("originalSrt").value);status("tstatus","✅ Original SRT ပြီးပါပြီ။ နောက်တစ်ဆင့်မှာ Burmese Recap Script ထုတ်ပါ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};


async function generateRecapScript(){const srt=$("originalSrt")?.value.trim()||"";if(!srt)return status("rstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");if(!groq())return status("rstatus","⚠️ Groq API Key ထည့်ပြီး Save လုပ်ပါ။");const transcript=srt.replace(/\r/g,"").split(/\n/).filter(line=>!/^\s*\d+\s*$/.test(line)&&!/^\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(line)).join(" ").trim();const b=$("makeRecap");b.disabled=true;status("rstatus","⏳ မြန်မာ Recap Script ရေးနေပါတယ်...");try{const d=await apiJson(await fetch("/api/recap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groqKey:groq(),transcript,style:$("recapStyle").value,length:$("recapLength").value})}));$("recapScript").value=d.recap||"";localStorage.setItem("yoon_recap_script",$("recapScript").value);status("rstatus","✅ Recap Script ပြီးပါပြီ။ စာသားစစ်ပြီး AI Voice ထုတ်နိုင်ပါပြီ။")}catch(e){status("rstatus","❌ "+e.message)}finally{b.disabled=false}}
$("makeRecap")?.addEventListener("click",generateRecapScript);
if(localStorage.getItem("yoon_recap_script")&&$("recapScript"))$("recapScript").value=localStorage.getItem("yoon_recap_script");
$("downloadOriginalSrt")?.addEventListener("click",()=>{const s=$("originalSrt")?.value.trim();if(s)download("original-timeline.srt",s+"\n","application/x-subrip");else status("tstatus","Original SRT မရှိသေးပါ။")});
if($("translate"))$("translate").onclick=()=>translateSrtAutomatically($("originalSrt").value,false);

const voiceSrtButton = $("generateVoiceSrt");
if (voiceSrtButton) {
 voiceSrtButton.disabled = false;
 voiceSrtButton.addEventListener("click", async () => {
  const b=voiceSrtButton, script=String($("recapScript")?.value||"").trim();
  if(b.dataset.busy==="1")return;
  if(!script)return status("trstatus","⚠️ STEP 03 မှာ Burmese Recap Script အရင်ထုတ်ပါ။");
  b.dataset.busy="1";b.disabled=true;
  try{
   status("trstatus","⏳ STEP 04 — Recap Script ကို SRT အဖြစ်ပြောင်းနေပါတယ်။ ဒီအဆင့်က Voice-to-SRT မဟုတ်ပါ။");
   const mode=$("srtLength")?.value||"normal",maxChars=mode==="short"?20:mode==="long"?50:35;
   const pieces=script.replace(/\r/g,"").split(/(?<=[။.!?])\s+|\n+/u).map(x=>x.trim()).filter(Boolean);
   const lines=[];let carry="";
   for(const piece of pieces){let rest=piece;while(rest.length>maxChars){let cut=rest.lastIndexOf(" ",maxChars);if(cut<Math.floor(maxChars*.55))cut=maxChars;lines.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}if(rest)carry+=(carry?" ":"")+rest;if(carry.length>=Math.floor(maxChars*.7)||/[။.!?]$/.test(rest)){lines.push(carry);carry="";}}
   if(carry)lines.push(carry);
   if(!lines.length)throw Error("Recap Script မှ SRT မပြုလုပ်နိုင်ပါ။");
   const stamp=n=>{const ms=Math.max(0,Math.round(n*1000)),hh=Math.floor(ms/3600000),mm=Math.floor(ms%3600000/60000),ss=Math.floor(ms%60000/1000),mmm=ms%1000;return String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0")+","+String(mmm).padStart(3,"0");};
   let cursor=0;
   const draft=lines.map((line,i)=>{const begin=cursor;cursor+=Math.max(1.2,Array.from(line).length/5);return (i+1)+"\n"+stamp(begin)+" --> "+stamp(cursor)+"\n"+line;}).join("\n\n")+"\n";
   const s=String(draft||"").trim();if(!s)throw Error("AI Voice SRT မရပါ။");
   voiceSrt=s+"\n";voiceSrtReady=true;$("burmeseSrt").value=voiceSrt;
   localStorage.setItem("yoon_voice_srt",voiceSrt);localStorage.setItem("yoon_burmese_srt",voiceSrt);localStorage.setItem("yoon_voice_srt_ready","1");
   status("trstatus","✅ SRT ပြီးပါပြီ။ အခု STEP 05 မှာ AI Voice ထုတ်မယ်ကိုနှိပ်ပါ။ SRT → Voice အစီအစဉ်ဖြစ်ပါတယ်။");
   const vb=$("makeVoiceNow");if(vb)vb.disabled=false;
  }catch(e){status("trstatus","❌ SRT မထုတ်နိုင်ပါ — "+errorText(e));}
  finally{b.disabled=false;delete b.dataset.busy;}
 });
}
$("prepareVoiceSrt")?.addEventListener("click",()=>{
 if(!voiceSrtReady||!$("burmeseSrt").value.trim())return status("trstatus","⚠️ AI Voice SRT မပြီးသေးပါ။ အပေါ်က Video မှ AI Voice SRT တန်းထုတ်မယ် ခလုတ်ကို အရင်နှိပ်ပါ။");
 download("ai-voice.srt",$("burmeseSrt").value.trim()+"\n","application/x-subrip");
 status("trstatus","✅ AI Voice SRT Download လုပ်ပြီးပါပြီ။");
});$("srtUpload")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=await f.text();if(!/\\d+\\s*\\n\\d{2}:\\d{2}:\\d{2},\\d{3}\\s*-->\\s*\\d{2}:\\d{2}:\\d{2},\\d{3}/.test(s))throw new Error("Valid SRT ဖိုင်မဟုတ်ပါ။");voiceSrt=s.trim()+"\\n";localStorage.setItem("yoon_voice_srt",voiceSrt);$("voiceSrt").value=voiceSrt;status("vstatus","✅ External SRT Upload ပြီးပါပြီ။ Final Video မှာ ဒီ SRT ကိုသုံးပါမယ်။")}catch(err){status("vstatus","❌ "+err.message)}});$("downloadVoiceSrt")?.addEventListener("click",()=>download("external.srt",voiceSrt||$("voiceSrt")?.value||"","application/x-subrip"));$("voiceUpload")?.addEventListener("change",e=>{voiceUploadFile=e.target.files?.[0]||null;if(voiceUploadFile){voiceId=null;voiceUrl=null;localStorage.removeItem("yoon_voice_id");localStorage.removeItem("yoon_voice_url");$("voicePreview").src=URL.createObjectURL(voiceUploadFile);$("voicePreview").hidden=false;status("vstatus","✅ AI Voice Upload ပြီးပါပြီ။ Final Video မှာ ဒီအသံကိုသုံးပါမယ်။")}});

$("voiceSpeed").addEventListener("input",()=>$("voiceSpeedValue").textContent=Number($("voiceSpeed").value).toFixed(1)+"x");

// STEP 05 — synthesize only after the user has generated the AI Voice SRT.
const makeVoiceButton=$("makeVoiceNow");
if(makeVoiceButton){
 makeVoiceButton.onclick=async function(){
  const srt=String($("burmeseSrt")?.value||"").trim();
  if(!srt){status("vstatus","⚠️ STEP 04 မှာ SRT ထုတ်ပါ၊ ဒါမှမဟုတ် SRT ဖိုင် Upload လုပ်ပါ။");$("generateVoiceSrt")?.focus();return;}
  if(!voiceSrtReady){voiceSrt=srt+"\n";voiceSrtReady=true;localStorage.setItem("yoon_voice_srt",voiceSrt);localStorage.setItem("yoon_burmese_srt",voiceSrt);localStorage.setItem("yoon_voice_srt_ready","1");}
  if(makeVoiceButton.dataset.busy==="1")return;
  makeVoiceButton.dataset.busy="1";makeVoiceButton.disabled=true;
  try{
   const dialogue=srt.replace(/\r/g,"").split(/\n\s*\n/).map(block=>{const rows=block.split("\n"),ti=rows.findIndex(x=>/-->/.test(x));return ti>=0?rows.slice(ti+1).join(" ").trim():"";}).filter(Boolean).join("\n");
   if(!dialogue)throw Error("AI Voice SRT ထဲမှာ ဖတ်စရာစာသားမရှိပါ။");
   status("vstatus","⏳ STEP 05 — AI Voice SRT ထဲက စာသားအတိုင်း အသံထုတ်နေပါတယ်...");
   const mode=$("srtLength")?.value||"normal",maxChars=mode==="short"?20:mode==="long"?50:35;
   const data=await apiJson(await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:dialogue,voice:$("voice")?.value||"myanmar-female",rate:Math.max(.5,Math.min(1.5,Number($("voiceSpeed")?.value||1))),maxChars})}));
   if(!data.id||!data.url)throw Error("AI Voice audio link မရပါ။");
   voiceId=data.id;voiceUrl=data.url;localStorage.setItem("yoon_voice_id",voiceId);localStorage.setItem("yoon_voice_url",voiceUrl);
   // Use the SRT timed against the generated voice for the final render.
   const alignedSrt=String(data.srt||data.voiceSrt||"").trim();
   if(alignedSrt){
    voiceSrt=alignedSrt+"\n";voiceSrtReady=true;
    $("burmeseSrt").value=voiceSrt;
    localStorage.setItem("yoon_voice_srt",voiceSrt);localStorage.setItem("yoon_burmese_srt",voiceSrt);localStorage.setItem("yoon_voice_srt_ready","1");
    const srtStatus=$("trstatus");if(srtStatus)srtStatus.textContent="✅ AI Voice နဲ့ အချိန်ကိုက်ထားတဲ့ SRT ကို Final Video အတွက် ပြင်ဆင်ပြီးပါပြီ။";
   } else {
    throw Error("AI Voice အချိန်ကိုက် SRT မရပါ။ Voice ကိုပြန်ထုတ်ပါ။");
   }
   const player=$("voicePreview");
   if(!player)throw Error("AI Voice Player မတွေ့ပါ။ Page ကို refresh လုပ်ပြီး ပြန်စမ်းပါ။");
   player.pause();player.removeAttribute("src");player.load();
   const audioUrl=new URL(data.url,window.location.href);audioUrl.searchParams.set("t",String(Date.now()));
   player.src=audioUrl.href;player.hidden=false;player.preload="auto";player.load();
   // Do not report success until the browser has loaded real audio metadata.
   await new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);player.removeEventListener("loadedmetadata",onMeta);player.removeEventListener("error",onError);err?reject(err):resolve();};
    const onMeta=()=>{if(Number.isFinite(player.duration)&&player.duration>0)finish();else finish(new Error("Audio duration မရပါ။"));};
    const onError=()=>finish(new Error("အသံဖိုင်ကို Browser က ဖတ်မရပါ။ AI Voice ကိုပြန်ထုတ်ပါ။"));
    const timer=setTimeout(()=>finish(new Error("အသံဖိုင်ဖွင့်ရန် အချိန်ကုန်သွားပါတယ်။ Internet/Render server ကိုစစ်ပြီး ပြန်စမ်းပါ။")),15000);
    player.addEventListener("loadedmetadata",onMeta);player.addEventListener("error",onError);
    if(player.readyState>=1)onMeta();
   });
   status("vstatus","✅ AI Voice အသံဖိုင် အလုပ်လုပ်နေပါပြီ ("+Math.floor(player.duration)+" စက္ကန့်)။ STEP 06 မှာ Edit လုပ်ပြီး Final MP4 Render လုပ်ပါ။");
  }catch(e){status("vstatus","❌ AI Voice မထုတ်နိုင်ပါ — "+errorText(e));}
  finally{makeVoiceButton.disabled=false;delete makeVoiceButton.dataset.busy;}
 };
}
const showText=$("showText"),showBlur=$("showBlur"),showLogo=$("showLogo"),showSubtitles=$("showSubtitles");
const textControls=$("textControls"),blurControls=$("blurControls"),logoControls=$("logoControls"),subtitleControls=$("subtitleControls");
const editorPreview=$("editorPreview"),textPreview=$("textPreview"),subtitlePreview=$("subtitlePreview"),blurLayer=$("blurLayer"),logoPreview=$("logoPreview");
let activeOption=showSubtitles;
let textLabel=textPreview.querySelector(".text-preview-label");
if(!textLabel){textLabel=document.createElement("span");textLabel.className="text-preview-label";textPreview.replaceChildren(textLabel);}
const textResizeHandle=document.createElement("div");
textResizeHandle.className="text-resize-handle";textResizeHandle.title="Resize text";textResizeHandle.setAttribute("aria-label","Resize text");
textPreview.appendChild(textResizeHandle);

function update(){
 const val=id=>$(id)?.value??"";
 textLabel.textContent=val("editText");
 const fs=val("fontStyle");
 textPreview.style.fontFamily=fs==="sans"?"sans-serif":fs==="eka"?"Eka03Custom, 'Noto Sans Myanmar', sans-serif":"'Noto Sans Myanmar', sans-serif";
 textPreview.style.color=val("textColor");
 textPreview.style.webkitTextStroke=Math.max(0,Number(val("borderWidth")||0))+"px "+val("borderColor");
 textPreview.style.textShadow="none";textPreview.style.fontSize=val("fontSize")+"px";
 textPreview.style.left=val("textX")+"%";textPreview.style.top=val("textY")+"%";
 textPreview.style.fontWeight=val("textWeight");textPreview.style.width="max-content";textPreview.style.height="auto";textPreview.style.maxWidth="92%";
 $("fontValue").textContent=val("fontSize");$("borderWidthValue").textContent=val("borderWidth");$("textWeightValue").textContent=val("textWeight");$("textXValue").textContent=val("textX");$("textYValue").textContent=val("textY");
 subtitlePreview.style.fontSize=val("subtitleFontSize")+"px";subtitlePreview.style.color=val("subtitleColor");subtitlePreview.style.webkitTextStroke=Math.max(0,Number(val("subtitleBorderWidth")||0))+"px "+val("subtitleBorderColor");subtitlePreview.style.left=val("subtitleX")+"%";subtitlePreview.style.top=val("subtitleY")+"%";subtitlePreview.style.display="block";subtitlePreview.style.maxWidth="92%";
 $("subtitleFontSizeValue").textContent=val("subtitleFontSize");$("subtitleBorderWidthValue").textContent=val("subtitleBorderWidth");$("subtitleXValue").textContent=val("subtitleX");$("subtitleYValue").textContent=val("subtitleY");
 const bw=Number(val("blurW")||90),bh=Number(val("blurH")||22);
 blurLayer.style.left=(Number(val("blurX")||50)-bw/2)+"%";blurLayer.style.top=val("blurY")+"%";
 blurLayer.style.width=bw+"%";blurLayer.style.height=bh+"%";blurLayer.style.transform="translateY(-50%)";
 blurLayer.style.backdropFilter="blur("+val("blurAmount")+"px)";blurLayer.style.webkitBackdropFilter="blur("+val("blurAmount")+"px)";
 $("blurValue").textContent=val("blurAmount");$("blurXValue").textContent=val("blurX");$("blurYValue").textContent=val("blurY");$("blurWValue").textContent=val("blurW");$("blurHValue").textContent=val("blurH");
 logoPreview.style.width=val("logoSize")+"px";logoPreview.style.height=val("logoSize")+"px";logoPreview.style.left=val("logoX")+"%";logoPreview.style.top=val("logoY")+"%";logoPreview.style.right="auto";logoPreview.style.transform="translate(-50%,-50%)";
 $("logoValue").textContent=val("logoSize");$("logoXValue").textContent=val("logoX");$("logoYValue").textContent=val("logoY");
 textPreview.hidden=!showText.checked;textPreview.style.display=showText.checked?"block":"none";subtitlePreview.style.display=showSubtitles.checked?"block":"none";blurLayer.style.display=showBlur.checked?"block":"none";
 const hasLogo=!!logoPreview.getAttribute("src");logoPreview.hidden=!(showLogo.checked&&hasLogo);logoPreview.style.display=showLogo.checked&&hasLogo?"block":"none";
 textControls.hidden=!(activeOption===showText&&showText.checked);blurControls.hidden=!(activeOption===showBlur&&showBlur.checked);logoControls.hidden=!(activeOption===showLogo&&showLogo.checked);subtitleControls.hidden=!(activeOption===showSubtitles&&showSubtitles.checked);
}
window.update=update;
function selectEditorOption(which){
 const selected=typeof which==="string"?$(which==="blur"?"showBlur":which==="logo"?"showLogo":which==="subtitle"?"showSubtitles":"showText"):which;
 if(!selected)return;
 if(selected.checked)activeOption=selected;
 else if(activeOption===selected)activeOption=showSubtitles.checked?showSubtitles:showBlur.checked?showBlur:showLogo.checked?showLogo:showText;
 update();
}
window.yoonSelectEditorOption=selectEditorOption;
[showText,showBlur,showLogo,showSubtitles].forEach(option=>{
 option.addEventListener("change",()=>selectEditorOption(option));
 option.addEventListener("click",()=>requestAnimationFrame(()=>selectEditorOption(option)));
});
document.querySelectorAll("#textControls input,#subtitleControls input,#blurControls input,#logoControls input").forEach(el=>{if(el.type!=="file")el.addEventListener("input",update);});
["editText","fontStyle","textColor","borderColor","borderWidth"].forEach(id=>$(id).addEventListener("input",update));
$("fontFile").addEventListener("change",e=>{
 fontFile=e.target.files?.[0]||null;if(!fontFile)return;
 if(customFontUrl)URL.revokeObjectURL(customFontUrl);customFontUrl=URL.createObjectURL(fontFile);
 let style=document.getElementById("customFontStyle");if(!style){style=document.createElement("style");style.id="customFontStyle";document.head.appendChild(style);}
 style.textContent="@font-face{font-family:Eka03Custom;src:url('"+customFontUrl+"')}";$("fontStyle").value="eka";update();
});
$("logoFile").addEventListener("change",e=>{
 const next=e.target.files?.[0]||null;
 if(!next){if(logoPreview.dataset.objectUrl)URL.revokeObjectURL(logoPreview.dataset.objectUrl);delete logoPreview.dataset.objectUrl;logoPreview.removeAttribute("src");logoFile=null;update();return;}
 if(logoPreview.dataset.objectUrl)URL.revokeObjectURL(logoPreview.dataset.objectUrl);
 logoFile=next;const url=URL.createObjectURL(next);logoPreview.dataset.objectUrl=url;logoPreview.src=url;showLogo.checked=true;activeOption=showLogo;update();
});
function attachDrag(el,type,xId,yId){
 el.style.touchAction="none";
 el.addEventListener("pointerdown",e=>{
  const enabled=type==="text"?showText.checked:type==="blur"?showBlur.checked:type==="logo"?showLogo.checked:true;if(!enabled)return;
  if(type==="text"&&e.target.closest(".text-resize-handle"))return;
  if(e.button!==undefined&&e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  const rect=editorPreview.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=Number($(xId).value),oy=Number($(yId).value),pid=e.pointerId;
  try{editorPreview.setPointerCapture(pid)}catch{}
  const move=ev=>{
   if(ev.pointerId!==pid)return;
   const dx=(ev.clientX-sx)/Math.max(1,rect.width)*100,dy=(ev.clientY-sy)/Math.max(1,rect.height)*100;
   const minX=type==="blur"?Number($("blurW").value)/2:2,maxX=type==="blur"?100-Number($("blurW").value)/2:98;
   $(xId).value=Math.max(minX,Math.min(maxX,ox+dx));$(yId).value=Math.max(2,Math.min(98,oy+dy));update();if(typeof scheduleEditState==="function")scheduleEditState();
  };
  const end=ev=>{
   if(ev.pointerId!==pid)return;
   editorPreview.removeEventListener("pointermove",move);editorPreview.removeEventListener("pointerup",end);editorPreview.removeEventListener("pointercancel",end);if(typeof scheduleEditState==="function"){clearTimeout(historyTimer);saveEditState();}
   try{if(editorPreview.hasPointerCapture?.(pid))editorPreview.releasePointerCapture(pid)}catch{}
  };
  editorPreview.addEventListener("pointermove",move);editorPreview.addEventListener("pointerup",end);editorPreview.addEventListener("pointercancel",end);
 });
}
attachDrag(textPreview,"text","textX","textY");attachDrag(subtitlePreview,"subtitle","subtitleX","subtitleY");attachDrag(blurLayer,"blur","blurX","blurY");attachDrag(logoPreview,"logo","logoX","logoY");
textResizeHandle.addEventListener("pointerdown",e=>{
 if(!showText.checked||e.button!==0)return;e.preventDefault();e.stopPropagation();
 const rect=editorPreview.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,start=Number($("fontSize").value),pid=e.pointerId;
 try{editorPreview.setPointerCapture(pid)}catch{}
 const move=ev=>{if(ev.pointerId!==pid)return;const dx=(ev.clientX-sx)/Math.max(1,rect.width)*100,dy=(ev.clientY-sy)/Math.max(1,rect.height)*100;$("fontSize").value=Math.max(10,Math.min(64,start+Math.round((dx+dy)*.5)));update();};
 const end=ev=>{if(ev.pointerId!==pid)return;editorPreview.removeEventListener("pointermove",move);editorPreview.removeEventListener("pointerup",end);editorPreview.removeEventListener("pointercancel",end);try{if(editorPreview.hasPointerCapture?.(pid))editorPreview.releasePointerCapture(pid)}catch{}};
 editorPreview.addEventListener("pointermove",move);editorPreview.addEventListener("pointerup",end);editorPreview.addEventListener("pointercancel",end);
});
update();

$("render").onclick=async e=>{e?.preventDefault();
 const srt=(showSubtitles.checked&&voiceSrtReady)?voiceSrt.trim():"";if(!file)return status("fstatus","⚠️ Video ရွေးပါ။");if(showSubtitles.checked&&(!voiceSrtReady||!srt))return status("fstatus","⚠️ Final Video မှာ Subtitles ထည့်ဖို့ Burmese Recap Script → AI Voice → AI Voice SRT အဆင့်တွေ အရင်ပြီးအောင်လုပ်ပါ။");
 const b=$("render");b.disabled=true;let pct=1;
 const makeProgress=()=>{let p=document.getElementById("renderProgress");if(!p){p=document.createElement("div");p.id="renderProgress";p.innerHTML='<div class="render-progress-top"><span id="renderProgressLabel">Final Video Loading...</span><b id="renderProgressPct">1%</b></div><div class="render-progress-track"><div id="renderProgressBar"></div></div>';const target=document.getElementById("fstatus");target.parentNode.insertBefore(p,target);}};
 const setProgress=n=>{pct=Math.max(pct,Math.min(99,Math.round(n)));const bar=document.getElementById("renderProgressBar"),label=document.getElementById("renderProgressLabel"),num=document.getElementById("renderProgressPct");if(bar)bar.style.width=pct+"%";if(num)num.textContent=pct+"%";if(label)label.textContent=pct<99?"Final Video Loading...":"Final Video Finishing...";};
 makeProgress();setProgress(1);status("fstatus","⏳ Final Video render စနေပါတယ်... 1%");
 try{
  const f=new FormData();f.append("video",file);f.append("previewWidth",String(editorPreview.getBoundingClientRect().width||editorPreview.clientWidth||360));if(srt)f.append("srt",srt);if(voiceId)f.append("voiceId",voiceId);if(voiceUploadFile)f.append("voice",voiceUploadFile,voiceUploadFile.name);f.append("text",$("editText").value);f.append("fontStyle",$("fontStyle").value);f.append("textWeight",$("textWeight").value);f.append("fontColor",$("textColor").value);f.append("borderColor",$("borderColor").value);f.append("borderWidth",$("borderWidth").value);f.append("showText",showText.checked?"1":"0");f.append("showBlur",showBlur.checked?"1":"0");f.append("showLogo",showLogo.checked?"1":"0");
  ["fontSize","textWeight","textX","textY","subtitleFontSize","subtitleX","subtitleY","subtitleBorderWidth","blurAmount","blurX","blurY","blurW","blurH","logoSize","logoX","logoY"].forEach(id=>f.append(id,$(id).value));f.append("subtitleColor",$("subtitleColor").value);f.append("subtitleBorderColor",$("subtitleBorderColor").value);if(logoFile)f.append("logo",logoFile);if(fontFile)f.append("font",fontFile);
  if(!voiceUploadFile&&voiceUrl){try{const vr=await fetch(voiceUrl,{cache:"no-store"});if(!vr.ok)throw new Error();const vb=await vr.blob();f.append("voice",vb,"saved-ai-voice.wav");}catch(e){throw new Error("သိမ်းထားတဲ့ AI Voice ကို Final Video ထဲထည့်မရပါ။ AI Voice ကို တစ်ခါပြန်ထုတ်ပါ။");}}
  const d=await apiJson(await fetch("/api/render",{method:"POST",body:f}));const jobId=d.jobId;if(!jobId)throw new Error("Render job ID မရပါ။");
  for(let attempts=0;attempts<600;attempts++){await new Promise(r=>setTimeout(r,1000));const q=await apiJson(await fetch("/api/render/status/"+encodeURIComponent(jobId),{cache:"no-store"}));if(q.status==="processing"){setProgress(Math.max(pct,Math.min(96,Number(q.progress||5)+Math.min(70,attempts*.15))));status("fstatus","⏳ Final Video render လုပ်နေပါတယ်... "+pct+"%");continue;}if(q.status==="error")throw new Error(q.error||"Final render failed");if(q.status==="done"){setProgress(100);const label=document.getElementById("renderProgressLabel");if(label)label.textContent="Final Video Complete";$("finalLink").href=q.url;$("finalLink").hidden=false;if($("oneFinalVideo"))$("oneFinalVideo").src=q.url;if($("oneDownload")){$("oneDownload").href=q.url;$("oneDownload").download=q.filename||"yoon-recap.mp4";}$("oneResult")?.removeAttribute("hidden");status("fstatus","✅ Final MP4 ပြီးပါပြီ — 100%");break;}}
 }catch(e){status("fstatus","❌ "+e.message)}finally{b.disabled=false}
};


// One-click controller: runs existing pipeline endpoints in sequence.
(()=>{
 const $=id=>document.getElementById(id);if(!$("oneClickRecap"))return;
 let movie=null,original="",burmese="",transcript="",recapText="",recapSrt="",voiceBlob=null;
 const all=[["validation",5,"Validating video"],["audio",10,"Extracting audio / transcribing"],["original",30,"Creating original SRT"],["translation",40,"Translating to Burmese"],["recap",52,"Writing recap script"],["subtitle",62,"Creating recap subtitles"],["voice",72,"Generating AI voice"],["sync",82,"Syncing voice and subtitles"],["edit",88,"Edit video before final render"],["render",94,"Rendering final MP4"],["complete",100,"Complete"]];
 function progress(p,label,done=[]){$("oneProgressWrap").hidden=false;$("oneProgressPct").textContent=p+"%";$("oneProgressBar").style.width=p+"%";$("oneStepLabel").textContent=label;$("oneSteps").innerHTML=all.slice(0,-1).map(s=>'<div class="one-step '+(done.includes(s[0])?'done':(p>=s[1]?'active':''))+'">'+(done.includes(s[0])?'✓':(p>=s[1]?'→':'○'))+' '+s[2]+'</div>').join("");}
 function say(s){$("oneStatus").textContent=s;}
 async function call(url,opts){return apiJson(await fetch(url,opts));}
 async function json(url,obj){return call(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(obj)});}
 $("oneVideo").addEventListener("change",e=>{movie=e.target.files?.[0]||null;$("oneResult").hidden=true;$("oneMovieInfo").textContent=movie?movie.name+" • "+(movie.size/1048576).toFixed(1)+" MB":"Video မရွေးရသေးပါ။";});
 $("oneSpeed").addEventListener("input",()=> $("oneSpeedValue").textContent=Number($("oneSpeed").value).toFixed(1)+"x");
 $("oneClickRecap").addEventListener("click",async()=>{
  const btn=$("oneClickRecap");if(btn.disabled)return;
  if(!movie)return say("❌ Movie Video အရင်ရွေးပါ။");if(!groq())return say("❌ Groq API Key ထည့်ပြီး Save လုပ်ပါ။");if(!gemini())return say("❌ Gemini API Key ထည့်ပြီး Save လုပ်ပါ။");if(movie.size>500*1048576)return say("❌ Video size 500MB ထက်မကျော်ရပါ။");
  btn.disabled=true;$("oneResult").hidden=true;const done=[];
  try{
   progress(5,"Validating movie",done);say("Movie file ကိုစစ်ဆေးပြီး audio ထုတ်နေပါတယ်...");
   const fd=new FormData();fd.append("video",movie,movie.name);fd.append("groqKey",groq());
   progress(10,"Extracting audio / transcribing",done);const tr=await call("/api/transcribe",{method:"POST",body:fd});
   original=tr.srt||"";transcript=tr.text||"";if(!original)throw Error("Original SRT မရပါ။");done.push("validation","audio","original");progress(30,"Original SRT ready",done);
   progress(40,"Translating to Burmese",done);const tl=await json("/api/translate-srt",{geminiKey:gemini(),srt:original});burmese=tl.srt||"";if(!burmese)throw Error("Burmese translation မရပါ။");done.push("translation");
   if($("originalSrt"))$("originalSrt").value=original;if($("burmeseSrt"))$("burmeseSrt").value=burmese;
   progress(52,"Writing Burmese recap",done);const rec=await json("/api/recap",{transcript,groqKey:groq(),style:$("oneStyle").value,length:$("oneLength").value});recapText=String(rec.recap||"").trim();if(!recapText)throw Error("Recap script မရပါ။");done.push("recap");
   progress(62,"Preparing AI Voice SRT before voice",done);
   const mode=$("oneLength").value,maxChars=mode==="1-2 minutes"?20:mode==="5-10 minutes"?50:35;
   const pieces=recapText.replace(/\r/g,"").split(/(?<=[။.!?])\s+|\n+/u).map(x=>x.trim()).filter(Boolean);
   const lines=[];let carry="";
   for(const piece of pieces){let rest=piece;while(rest.length>maxChars){let cut=rest.lastIndexOf(" ",maxChars);if(cut<Math.floor(maxChars*.55))cut=maxChars;lines.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}if(rest)carry+=(carry?" ":"")+rest;if(carry.length>=Math.floor(maxChars*.7)||/[။.!?]$/.test(rest)){lines.push(carry);carry="";}}
   if(carry)lines.push(carry);
   const stamp=n=>{const ms=Math.max(0,Math.round(n*1000)),hh=Math.floor(ms/3600000),mm=Math.floor(ms%3600000/60000),ss=Math.floor(ms%60000/1000),mmm=ms%1000;return String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0")+","+String(mmm).padStart(3,"0");};
   let cursor=0;const draft=lines.map((line,i)=>{const start=cursor;cursor+=Math.max(1.2,Array.from(line).length/5);return (i+1)+"\n"+stamp(start)+" --> "+stamp(cursor)+"\n"+line;}).join("\n\n")+"\n";
   recapSrt=draft.trim();if(!recapSrt)throw Error("AI Voice SRT မရပါ။");done.push("subtitle");
   progress(72,"Generating AI voice from prepared SRT",done);
   const dialogue=recapSrt.replace(/\r/g,"").split(/\n\s*\n/).map(block=>{const a=block.split("\n"),ti=a.findIndex(x=>/-->/.test(x));return ti>=0?a.slice(ti+1).join(" ").trim():"";}).filter(Boolean).join("\n");
   const tts=await json("/api/tts",{text:dialogue,voice:$("oneVoice").value,rate:Number($("oneSpeed").value||1),maxChars});if(!tts.id)throw Error("AI Voice မရပါ။");
   const alignedSrt=String(tts.srt||tts.voiceSrt||"").trim();if(!alignedSrt)throw Error("AI Voice နဲ့အချိန်ကိုက် SRT မရပါ။");
   recapSrt=alignedSrt;voiceSrt=alignedSrt+"\n";voiceSrtReady=true;voiceId=tts.id;voiceUrl=tts.url;
   localStorage.setItem("yoon_voice_id",voiceId);localStorage.setItem("yoon_voice_url",voiceUrl);localStorage.setItem("yoon_voice_srt",voiceSrt);localStorage.setItem("yoon_burmese_srt",voiceSrt);localStorage.setItem("yoon_voice_srt_ready","1");
   $("burmeseSrt").value=voiceSrt;burmese=voiceSrt;done.push("voice","sync");
   try{const v=await fetch(tts.url,{cache:"no-store"});if(v.ok)voiceBlob=await v.blob();}catch{}
   progress(86,"Ready for Live Edit",done);
   // Edit-first flow: load the movie and generated voice into Advanced Studio, then wait for the user to render.
   file=movie;if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(movie);
   const editVideo=$("editVideo"),preview=$("preview");if(editVideo){editVideo.src=videoUrl;editVideo.load();}if(preview){preview.src=videoUrl;preview.hidden=false;preview.load();}
   const player=$("voicePreview");if(player){player.src=tts.url;player.hidden=false;player.load();}
   if($("showSubtitles"))$("showSubtitles").checked=!!$("oneSubtitles").checked;
   if($("oneSubtitles").checked&&$("showSubtitles"))$("showSubtitles").checked=true;
   const advanced=document.querySelector(".advanced-tools");if(advanced){advanced.open=true;advanced.scrollIntoView({behavior:"smooth",block:"start"});}
   localStorage.setItem("yoon_original_srt",original);localStorage.setItem("yoon_burmese_srt",burmese);localStorage.setItem("yoon_recap_script",recapText);
   done.push("edit");progress(88,"Live Edit ready — edit first, then render",done);
   say("✅ AI Voice နဲ့ အချိန်ကိုက် SRT ပြီးပါပြီ။ STEP 06 မှာ Blur/Logo/Text/Subtitle ကိုစိတ်ကြိုက်ပြင်ပြီး STEP 07 — Final MP4 Render ကိုနှိပ်ပါ။");
  }catch(e){say("❌ "+(e?.message||String(e)));}
  finally{btn.disabled=false;}
 });
 if($("oneOriginalSrt"))$("oneOriginalSrt").onclick=()=>download("original.srt",original,"application/x-subrip");
 if($("oneBurmeseSrt"))$("oneBurmeseSrt").onclick=()=>download("burmese.srt",burmese,"application/x-subrip");
 if($("oneRecapScript"))$("oneRecapScript").onclick=()=>download("recap.txt",recapText,"text/plain;charset=utf-8");
 if($("oneRecapSrt"))$("oneRecapSrt").onclick=()=>download("recap.srt",recapSrt,"application/x-subrip");
 if($("oneVoiceDownload"))$("oneVoiceDownload").onclick=()=>{if(!voiceBlob)return say("Voice file မရနိုင်သေးပါ။");const u=URL.createObjectURL(voiceBlob),a=document.createElement("a");a.href=u;a.download="ai-voice.wav";a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);};
 if($("oneTranscript"))$("oneTranscript").onclick=()=>download("transcript.txt",transcript,"text/plain;charset=utf-8");
})();
