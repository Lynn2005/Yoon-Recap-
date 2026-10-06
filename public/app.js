const $=id=>document.getElementById(id);
let file=null,videoUrl=null,fontFile=null,customFontUrl=null,voiceSrt=localStorage.getItem("yoon_voice_srt")||"",voiceId=localStorage.getItem("yoon_voice_id")||null,voiceUrl=localStorage.getItem("yoon_voice_url")||null,logoFile=null;
if(voiceId&&voiceUrl){$("voicePreview").src=voiceUrl;$("voicePreview").hidden=false;}

const savedGroq=localStorage.getItem("yoon_groq_key"),savedGemini=localStorage.getItem("yoon_gemini_key");
if(localStorage.getItem("yoon_original_srt"))$("originalSrt").value=localStorage.getItem("yoon_original_srt");
if(localStorage.getItem("yoon_burmese_srt"))$("burmeseSrt").value=localStorage.getItem("yoon_burmese_srt");if(voiceSrt&&$("voiceSrt"))$("voiceSrt").value=voiceSrt;
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

$("video").onchange=e=>{file=e.target.files?.[0];if(videoUrl)URL.revokeObjectURL(videoUrl);if(file){videoUrl=URL.createObjectURL(file);$("preview").src=videoUrl;$("preview").hidden=false;$("editVideo").src=videoUrl}};
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!groq())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Audio extract → Whisper → Original SRT ထုတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",groq());const d=await apiJson(await fetch("/api/transcribe",{method:"POST",body:f}));$("originalSrt").value=d.srt||"";localStorage.setItem("yoon_original_srt",$("originalSrt").value);status("tstatus","✅ Audio + Transcript + Original SRT ပြီးပါပြီ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};
$("downloadOriginal").onclick=()=>download("original.srt",$("originalSrt").value,"application/x-subrip");

$("translate").onclick=async()=>{const srt=$("originalSrt").value.trim();if(!srt)return status("trstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");if(!gemini())return status("trstatus","⚠️ Gemini API Key ထည့်ပါ။");const b=$("translate");b.disabled=true;status("trstatus","⏳ Gemini နဲ့ မြန်မာဘာသာပြန်နေပါတယ်...");try{const d=await apiJson(await fetch("/api/translate-srt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geminiKey:gemini(),srt})}));$("burmeseSrt").value=d.srt;localStorage.setItem("yoon_burmese_srt",$("burmeseSrt").value);status("trstatus","✅ Burmese SRT ပြီးပါပြီ။")}catch(e){status("trstatus","❌ "+e.message)}finally{b.disabled=false}};
$("downloadBurmese").onclick=()=>download("burmese.srt",$("burmeseSrt").value,"application/x-subrip");$("srtUpload")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=await f.text();if(!/\\d+\\s*\\n\\d{2}:\\d{2}:\\d{2},\\d{3}\\s*-->\\s*\\d{2}:\\d{2}:\\d{2},\\d{3}/.test(s))throw new Error("Valid SRT ဖိုင်မဟုတ်ပါ။");voiceSrt=s.trim()+"\\n";localStorage.setItem("yoon_voice_srt",voiceSrt);$("voiceSrt").value=voiceSrt;status("vstatus","✅ External SRT Upload ပြီးပါပြီ။ Final Video မှာ ဒီ SRT ကိုသုံးပါမယ်။")}catch(err){status("vstatus","❌ "+err.message)}});$("downloadVoiceSrt")?.addEventListener("click",()=>download("external.srt",voiceSrt||$("voiceSrt")?.value||"","application/x-subrip"));

$("voiceSpeed").addEventListener("input",()=>$("voiceSpeedValue").textContent=Number($("voiceSpeed").value).toFixed(1)+"x");

$("makeVoice").onclick=async()=>{const srtInput=$("burmeseSrt").value.trim();if(!srtInput)return status("vstatus","⚠️ Burmese SRT အရင်ထုတ်ပါ။");const text=srtInput.replace(/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/g,"").replace(/\n{2,}/g,"\n").trim();const b=$("makeVoice");b.disabled=true;status("vstatus","⏳ Free Burmese AI Voice ထုတ်နေပါတယ်...");try{const d=await apiJson(await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,srt:srtInput,voice:$("voice").value,rate:Number($("voiceSpeed").value||1)})}));voiceId=d.id;voiceUrl=d.url;localStorage.setItem("yoon_voice_id",voiceId);localStorage.setItem("yoon_voice_url",voiceUrl);$("voicePreview").src=voiceUrl;$("voicePreview").hidden=false;status("vstatus","✅ AI Voice ပြီးပါပြီ။ External SRT ရှိရင် subtitles ထိုးပါမယ်။")}catch(e){status("vstatus","❌ "+e.message)}finally{b.disabled=false}};

const showText=$("showText"),showBlur=$("showBlur"),showLogo=$("showLogo"),textControls=$("textControls"),blurControls=$("blurControls"),logoControls=$("logoControls"),textPreview=$("textPreview"),blurLayer=$("blurLayer"),logoPreview=$("logoPreview");
let active=null;let activeOption=showText;
function update(){textPreview.textContent=$("editText").value||"";const fs=$("fontStyle").value;textPreview.style.fontFamily=fs==="sans"?"sans-serif":fs==="eka"?"Eka03Custom, Noto Sans Myanmar, sans-serif":"Noto Sans Myanmar, sans-serif";textPreview.style.color=$("textColor").value;textPreview.style.webkitTextStroke=Math.max(0,Number($("borderWidth").value||0))+"px "+$("borderColor").value;textPreview.style.textShadow="none";textPreview.style.fontSize=$("fontSize").value+"px";textPreview.style.left=$("textX").value+"%";textPreview.style.top=$("textY").value+"%";textPreview.style.fontWeight=$("textWeight").value;textPreview.style.width="fit-content";textPreview.style.height="fit-content";textPreview.style.maxWidth="92%";$("fontValue").textContent=$("fontSize").value;$("borderWidthValue").textContent=$("borderWidth").value;$("textWeightValue").textContent=$("textWeight").value;$("textXValue").textContent=$("textX").value;$("textYValue").textContent=$("textY").value;
blurLayer.style.left=(+$("blurX").value-(+$("blurW").value/2))+"%";blurLayer.style.top=$("blurY").value+"%";blurLayer.style.width=$("blurW").value+"%";blurLayer.style.height=$("blurH").value+"%";blurLayer.style.transform="translateY(-50%)";blurLayer.style.backdropFilter="blur("+$("blurAmount").value+"px)";$("blurValue").textContent=$("blurAmount").value;$("blurXValue").textContent=$("blurX").value;$("blurYValue").textContent=$("blurY").value;$("blurWValue").textContent=$("blurW").value;$("blurHValue").textContent=$("blurH").value;
logoPreview.style.width=$("logoSize").value+"px";logoPreview.style.height=$("logoSize").value+"px";logoPreview.style.left=$("logoX").value+"%";logoPreview.style.top=$("logoY").value+"%";logoPreview.style.right="auto";logoPreview.style.transform="translate(-50%,-50%)";$("logoValue").textContent=$("logoSize").value;$("logoXValue").textContent=$("logoX").value;$("logoYValue").textContent=$("logoY").value;
textPreview.style.display=showText.checked?"block":"none";blurLayer.style.display=showBlur.checked?"block":"none";logoPreview.style.display=showLogo.checked&&logoPreview.src?"block":"none";
textControls.hidden=!(activeOption===showText && showText.checked);blurControls.hidden=!(activeOption===showBlur && showBlur.checked);logoControls.hidden=!(activeOption===showLogo && showLogo.checked);
}
function selectEditorOption(selected){
  // Each checkbox keeps its own effect; only the latest selected option shows its Adjust panel.
  if(selected.checked) activeOption=selected;
  else if(activeOption===selected){
    activeOption=showLogo.checked?showLogo:showBlur.checked?showBlur:showText.checked?showText:null;
  }
  active=selected?.checked?selected:null;
  update();
}
showText.addEventListener("change",()=>selectEditorOption(showText));
showBlur.addEventListener("change",()=>selectEditorOption(showBlur));
showLogo.addEventListener("change",()=>selectEditorOption(showLogo));

document.querySelectorAll("#textControls input,#blurControls input,#logoControls input").forEach(x=>{if(x.id==="textY"){x.addEventListener("input",()=>{textPreview.style.top=x.value+"%";$("textYValue").textContent=x.value})}else{x.addEventListener("input",update)}});
$("editText").addEventListener("input",update);["fontStyle","textColor","borderColor","borderWidth"].forEach(id=>$(id).addEventListener("input",update));
$("fontFile").onchange=e=>{fontFile=e.target.files?.[0]||null;if(fontFile){customFontUrl=URL.createObjectURL(fontFile);let st=document.getElementById("customFontStyle");if(!st){st=document.createElement("style");st.id="customFontStyle";document.head.appendChild(st)}st.textContent="@font-face{font-family:Eka03Custom;src:url(\""+customFontUrl+"\")}";$("fontStyle").value="eka";update()}};
$("logoFile").onchange=e=>{logoFile=e.target.files?.[0]||null;if(logoFile){logoPreview.src=URL.createObjectURL(logoFile);showLogo.checked=true;active=showLogo;update()}};
update();

function dragElement(el,type,xId,yId){
  el.addEventListener("pointerdown",e=>{
    const enabled=$(type==="blur"?"showBlur":type==="text"?"showText":"showLogo").checked;
    if(!enabled)return;
    if(type==="text" && e.target===textResizeHandle)return;
    if(e.pointerType==="mouse") e.preventDefault();
    e.stopPropagation();
    const box=$("editorPreview").getBoundingClientRect();
    const startX=e.clientX,startY=e.clientY;
    const ox=Number($(xId).value),oy=Number($(yId).value);
    const move=ev=>{
      const dx=(ev.clientX-startX)/box.width*100;
      const dy=(ev.clientY-startY)/box.height*100;
      $(xId).value=Math.max(5,Math.min(95,ox+dx));
      $(yId).value=Math.max(5,Math.min(95,oy+dy));
      update();
    };
    const end=()=>{
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",end);
      document.removeEventListener("pointercancel",end);
    };
    document.addEventListener("pointermove",move);
    document.addEventListener("pointerup",end);
    document.addEventListener("pointercancel",end);
  });
}
// Text ကို Blur box လို yellow boundary + corner resize နဲ့ တိုက်ရိုက်ပြင်နိုင်စေမယ်
const textResizeHandle=document.createElement("div");
textResizeHandle.className="text-resize-handle";
textResizeHandle.title="Resize text";
textPreview.appendChild(textResizeHandle);

dragElement(textPreview,"text","textX","textY");
dragElement(blurLayer,"blur","blurX","blurY");
dragElement(logoPreview,"logo","logoX","logoY");

textResizeHandle.addEventListener("pointerdown",e=>{
  if(!showText.checked)return;
  e.preventDefault();
  e.stopPropagation();
  textResizeHandle.setPointerCapture?.(e.pointerId);
  const box=$("editorPreview").getBoundingClientRect();
  const startX=e.clientX,startY=e.clientY;
  const startSize=Number($("fontSize").value);
  const move=ev=>{
    const dx=(ev.clientX-startX)/box.width*100;
    const dy=(ev.clientY-startY)/box.height*100;
    const next=Math.max(14,Math.min(96,startSize+Math.round((dx+dy)*0.45)));
    $("fontSize").value=next;
    update();
  };
  const end=ev=>{
    textResizeHandle.releasePointerCapture?.(ev.pointerId);
    textResizeHandle.removeEventListener("pointermove",move);
    textResizeHandle.removeEventListener("pointerup",end);
    textResizeHandle.removeEventListener("pointercancel",end);
  };
  textResizeHandle.addEventListener("pointermove",move);
  textResizeHandle.addEventListener("pointerup",end);
  textResizeHandle.addEventListener("pointercancel",end);
});

$("finishKeep")?.addEventListener("click",()=>{
  const ids=["editText","fontSize","textX","textY","textWeight","blurAmount","blurX","blurY","blurW","blurH","logoFile","logoSize","logoX","logoY","showText","showBlur","showLogo"];
  ids.forEach(id=>{const el=$(id);if(el)el.disabled=true});
  $("finishKeep").disabled=true;
  $("finishStatus").textContent="✅ ရပြီ — လက်ရှိ setting အတိုင်း lock လုပ်ထားပါပြီ။";
  $("finishStatus").style.color="#16a34a";
  $("previewUpdate").disabled=true;
});

$("render").onclick=async()=>{
 const srt=voiceSrt.trim();if(!file)return status("fstatus","⚠️ Video ရွေးပါ။");
 const b=$("render");b.disabled=true;let pct=1;
 const makeProgress=()=>{let p=document.getElementById("renderProgress");if(!p){p=document.createElement("div");p.id="renderProgress";p.innerHTML='<div class="render-progress-top"><span id="renderProgressLabel">Final Video Loading...</span><b id="renderProgressPct">1%</b></div><div class="render-progress-track"><div id="renderProgressBar"></div></div>';const target=document.getElementById("fstatus");target.parentNode.insertBefore(p,target);}};
 const setProgress=n=>{pct=Math.max(pct,Math.min(99,Math.round(n)));const bar=document.getElementById("renderProgressBar"),label=document.getElementById("renderProgressLabel"),num=document.getElementById("renderProgressPct");if(bar)bar.style.width=pct+"%";if(num)num.textContent=pct+"%";if(label)label.textContent=pct<99?"Final Video Loading...":"Final Video Finishing...";};
 makeProgress();setProgress(1);status("fstatus","⏳ Final Video render စနေပါတယ်... 1%");
 try{
  const f=new FormData();f.append("video",file);if(srt)f.append("srt",srt);if(voiceId)f.append("voiceId",voiceId);f.append("text",$("editText").value);f.append("fontStyle",$("fontStyle").value);f.append("fontColor",$("textColor").value);f.append("borderColor",$("borderColor").value);f.append("borderWidth",$("borderWidth").value);f.append("showText",showText.checked?"1":"0");f.append("showBlur",showBlur.checked?"1":"0");f.append("showLogo",showLogo.checked?"1":"0");
  ["fontSize","textWeight","textX","textY","blurAmount","blurX","blurY","blurW","blurH","logoSize","logoX","logoY"].forEach(id=>f.append(id,$(id).value));if(logoFile)f.append("logo",logoFile);if(fontFile)f.append("font",fontFile);
  if(voiceUrl){try{const vr=await fetch(voiceUrl,{cache:"no-store"});if(!vr.ok)throw new Error();const vb=await vr.blob();f.append("voice",vb,"saved-ai-voice.wav");}catch(e){throw new Error("သိမ်းထားတဲ့ AI Voice ကို Final Video ထဲထည့်မရပါ။ AI Voice ကို တစ်ခါပြန်ထုတ်ပါ။");}}
  const d=await apiJson(await fetch("/api/render",{method:"POST",body:f}));const jobId=d.jobId;if(!jobId)throw new Error("Render job ID မရပါ။");
  for(let attempts=0;attempts<600;attempts++){await new Promise(r=>setTimeout(r,1000));const q=await apiJson(await fetch("/api/render/status/"+encodeURIComponent(jobId),{cache:"no-store"}));if(q.status==="processing"){setProgress(Math.max(pct,Math.min(96,Number(q.progress||5)+Math.min(70,attempts*.15))));status("fstatus","⏳ Final Video render လုပ်နေပါတယ်... "+pct+"%");continue;}if(q.status==="error")throw new Error(q.error||"Final render failed");if(q.status==="done"){setProgress(100);const label=document.getElementById("renderProgressLabel");if(label)label.textContent="Final Video Complete";$("finalLink").href=q.url;$("finalLink").hidden=false;status("fstatus","✅ Final MP4 ပြီးပါပြီ — 100%");break;}}
 }catch(e){status("fstatus","❌ "+e.message)}finally{b.disabled=false}
};
