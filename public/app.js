const $=id=>document.getElementById(id);
let file=null,videoUrl=null,fontFile=null,customFontUrl=null,voiceUploadFile=null,voiceSrt=localStorage.getItem("yoon_voice_srt")||"",voiceId=localStorage.getItem("yoon_voice_id")||null,voiceUrl=localStorage.getItem("yoon_voice_url")||null,logoFile=null;
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
async function translateSrtAutomatically(srt,auto=false){
 srt=(srt||"").trim();if(!srt)return status("trstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");
 if(!gemini()){const msg=auto?"⚠️ Original SRT ပြီးပါပြီ။ Auto Translate အတွက် Options ထဲမှာ Gemini API Key ထည့်ပြီး Save လုပ်ပါ။":"⚠️ Gemini API Key ထည့်ပါ။";status("trstatus",msg);if(auto)status("tstatus",msg);return false;}
 const b=$("translate");if(b)b.disabled=true;const working=auto?"⏳ Original SRT ပြီးပါပြီ။ Gemini နဲ့ မြန်မာလို အလိုအလျောက် ဘာသာပြန်နေပါတယ်...":"⏳ Gemini နဲ့ မြန်မာဘာသာပြန်နေပါတယ်...";status("trstatus",working);if(auto)status("tstatus",working);
 try{const d=await apiJson(await fetch("/api/translate-srt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geminiKey:gemini(),srt})}));$("burmeseSrt").value=d.srt||"";localStorage.setItem("yoon_burmese_srt",$("burmeseSrt").value);status("trstatus","✅ Burmese SRT အလိုအလျောက် ပြီးပါပြီ။");if(auto)status("tstatus","✅ Original SRT + Burmese SRT အလိုအလျောက် ပြီးပါပြီ။");return true}
 catch(e){const msg="❌ Auto Translate မအောင်မြင်ပါ — "+e.message;status("trstatus",msg);if(auto)status("tstatus",msg);return false}
 finally{if(b)b.disabled=false}
}
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!groq())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Audio extract → Whisper → Original SRT ထုတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",groq());const d=await apiJson(await fetch("/api/transcribe",{method:"POST",body:f}));$("originalSrt").value=d.srt||"";localStorage.setItem("yoon_original_srt",$("originalSrt").value);status("tstatus","✅ Original SRT ပြီးပါပြီ။");await translateSrtAutomatically($("originalSrt").value,true)}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};
$("downloadOriginal").onclick=()=>download("original.srt",$("originalSrt").value,"application/x-subrip");

$("translate").onclick=()=>translateSrtAutomatically($("originalSrt").value,false);
$("downloadBurmese").onclick=()=>download("burmese.srt",$("burmeseSrt").value,"application/x-subrip");$("srtUpload")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=await f.text();if(!/\\d+\\s*\\n\\d{2}:\\d{2}:\\d{2},\\d{3}\\s*-->\\s*\\d{2}:\\d{2}:\\d{2},\\d{3}/.test(s))throw new Error("Valid SRT ဖိုင်မဟုတ်ပါ။");voiceSrt=s.trim()+"\\n";localStorage.setItem("yoon_voice_srt",voiceSrt);$("voiceSrt").value=voiceSrt;status("vstatus","✅ External SRT Upload ပြီးပါပြီ။ Final Video မှာ ဒီ SRT ကိုသုံးပါမယ်။")}catch(err){status("vstatus","❌ "+err.message)}});$("downloadVoiceSrt")?.addEventListener("click",()=>download("external.srt",voiceSrt||$("voiceSrt")?.value||"","application/x-subrip"));$("voiceUpload")?.addEventListener("change",e=>{voiceUploadFile=e.target.files?.[0]||null;if(voiceUploadFile){voiceId=null;voiceUrl=null;localStorage.removeItem("yoon_voice_id");localStorage.removeItem("yoon_voice_url");$("voicePreview").src=URL.createObjectURL(voiceUploadFile);$("voicePreview").hidden=false;status("vstatus","✅ AI Voice Upload ပြီးပါပြီ။ Final Video မှာ ဒီအသံကိုသုံးပါမယ်။")}});

$("voiceSpeed").addEventListener("input",()=>$("voiceSpeedValue").textContent=Number($("voiceSpeed").value).toFixed(1)+"x");

$("makeVoice").onclick=async()=>{const srtInput=$("burmeseSrt").value.trim();if(!srtInput)return status("vstatus","⚠️ Burmese SRT အရင်ထုတ်ပါ။");const text=srtInput.replace(/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/g,"").replace(/\n{2,}/g,"\n").trim();const b=$("makeVoice");b.disabled=true;status("vstatus","⏳ Free Burmese AI Voice ထုတ်နေပါတယ်...");try{const d=await apiJson(await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,srt:srtInput,voice:$("voice").value,rate:Number($("voiceSpeed").value||1)})}));voiceId=d.id;voiceUrl=d.url;voiceUploadFile=null;const vu=$("voiceUpload");if(vu)vu.value="";localStorage.setItem("yoon_voice_id",voiceId);localStorage.setItem("yoon_voice_url",voiceUrl);$("voicePreview").src=voiceUrl;$("voicePreview").hidden=false;status("vstatus","✅ AI Voice ပြီးပါပြီ။ External SRT ရှိရင် subtitles ထိုးပါမယ်။")}catch(e){status("vstatus","❌ "+e.message)}finally{b.disabled=false}};

const showText=$("showText"),showBlur=$("showBlur"),showLogo=$("showLogo"),textControls=$("textControls"),blurControls=$("blurControls"),logoControls=$("logoControls"),textPreview=$("textPreview"),blurLayer=$("blurLayer"),logoPreview=$("logoPreview");
let active=null;let activeOption=showText;
function update(){textPreview.textContent=$("editText").value||"";const fs=$("fontStyle").value;textPreview.style.fontFamily=fs==="sans"?"sans-serif":fs==="eka"?"Eka03Custom, Noto Sans Myanmar, sans-serif":"Noto Sans Myanmar, sans-serif";textPreview.style.color=$("textColor").value;textPreview.style.webkitTextStroke=Math.max(0,Number($("borderWidth").value||0))+"px "+$("borderColor").value;textPreview.style.textShadow="none";textPreview.style.fontSize=$("fontSize").value+"px";textPreview.style.left=$("textX").value+"%";textPreview.style.top=$("textY").value+"%";textPreview.style.fontWeight=$("textWeight").value;textPreview.style.width="fit-content";textPreview.style.height="fit-content";textPreview.style.maxWidth="92%";$("fontValue").textContent=$("fontSize").value;$("borderWidthValue").textContent=$("borderWidth").value;$("textWeightValue").textContent=$("textWeight").value;$("textXValue").textContent=$("textX").value;$("textYValue").textContent=$("textY").value;
blurLayer.style.left=(+$("blurX").value-(+$("blurW").value/2))+"%";blurLayer.style.top=$("blurY").value+"%";blurLayer.style.width=$("blurW").value+"%";blurLayer.style.height=$("blurH").value+"%";blurLayer.style.transform="translateY(-50%)";blurLayer.style.backdropFilter="blur("+$("blurAmount").value+"px)";blurLayer.style.webkitBackdropFilter="blur("+$("blurAmount").value+"px)";$("blurValue").textContent=$("blurAmount").value;$("blurXValue").textContent=$("blurX").value;$("blurYValue").textContent=$("blurY").value;$("blurWValue").textContent=$("blurW").value;$("blurHValue").textContent=$("blurH").value;
logoPreview.style.width=$("logoSize").value+"px";logoPreview.style.height=$("logoSize").value+"px";logoPreview.style.left=$("logoX").value+"%";logoPreview.style.top=$("logoY").value+"%";logoPreview.style.right="auto";logoPreview.style.transform="translate(-50%,-50%)";$("logoValue").textContent=$("logoSize").value;$("logoXValue").textContent=$("logoX").value;$("logoYValue").textContent=$("logoY").value;
textPreview.style.display=showText.checked?"block":"none";blurLayer.style.display=showBlur.checked?"block":"none";const hasLogo=!!logoPreview.getAttribute("src");logoPreview.hidden=!(showLogo.checked&&hasLogo);logoPreview.style.display=showLogo.checked&&hasLogo?"block":"none";
textControls.hidden=!(activeOption===showText && showText.checked);blurControls.hidden=!(activeOption===showBlur && showBlur.checked);logoControls.hidden=!(activeOption===showLogo && showLogo.checked);
}
function selectEditorOption(selected){
  // Always switch the visible panel to the option the user just touched.
  if(typeof selected==="string") selected=$(selected==="blur"?"showBlur":selected==="logo"?"showLogo":"showText");
  if(!selected)return;
  if(selected.checked) activeOption=selected;
  else if(activeOption===selected){
    activeOption=showText.checked?showText:showBlur.checked?showBlur:showLogo.checked?showLogo:null;
  }
  active=selected.checked?selected:null;
  update();
}
// Expose a stable handler for mobile browsers and inline checkbox events.
window.yoonSelectEditorOption=selectEditorOption;
showText.addEventListener("change",()=>selectEditorOption(showText));
showBlur.addEventListener("change",()=>selectEditorOption(showBlur));
showLogo.addEventListener("change",()=>selectEditorOption(showLogo));

document.querySelectorAll("#textControls input,#blurControls input,#logoControls input").forEach(x=>{if(x.id==="textY"){x.addEventListener("input",()=>{textPreview.style.top=x.value+"%";$("textYValue").textContent=x.value})}else{x.addEventListener("input",update)}});
$("editText").addEventListener("input",update);["fontStyle","textColor","borderColor","borderWidth"].forEach(id=>$(id).addEventListener("input",update));
$("fontFile").onchange=e=>{fontFile=e.target.files?.[0]||null;if(fontFile){customFontUrl=URL.createObjectURL(fontFile);let st=document.getElementById("customFontStyle");if(!st){st=document.createElement("style");st.id="customFontStyle";document.head.appendChild(st)}st.textContent="@font-face{font-family:Eka03Custom;src:url(\""+customFontUrl+"\")}";$("fontStyle").value="eka";update()}};
$("logoFile").onchange=e=>{logoFile=e.target.files?.[0]||null;if(logoFile){const previous=logoPreview.dataset.objectUrl;if(previous)URL.revokeObjectURL(previous);const objectUrl=URL.createObjectURL(logoFile);logoPreview.dataset.objectUrl=objectUrl;logoPreview.src=objectUrl;logoPreview.hidden=false;showLogo.checked=true;activeOption=showLogo;active=showLogo;selectEditorOption(showLogo)}else{const previous=logoPreview.dataset.objectUrl;if(previous)URL.revokeObjectURL(previous);delete logoPreview.dataset.objectUrl;logoPreview.removeAttribute("src");logoPreview.hidden=true;update()}};
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

$("render").onclick=async e=>{e?.preventDefault();
 const srt=voiceSrt.trim();if(!file)return status("fstatus","⚠️ Video ရွေးပါ။");
 const b=$("render");b.disabled=true;let pct=1;
 const makeProgress=()=>{let p=document.getElementById("renderProgress");if(!p){p=document.createElement("div");p.id="renderProgress";p.innerHTML='<div class="render-progress-top"><span id="renderProgressLabel">Final Video Loading...</span><b id="renderProgressPct">1%</b></div><div class="render-progress-track"><div id="renderProgressBar"></div></div>';const target=document.getElementById("fstatus");target.parentNode.insertBefore(p,target);}};
 const setProgress=n=>{pct=Math.max(pct,Math.min(99,Math.round(n)));const bar=document.getElementById("renderProgressBar"),label=document.getElementById("renderProgressLabel"),num=document.getElementById("renderProgressPct");if(bar)bar.style.width=pct+"%";if(num)num.textContent=pct+"%";if(label)label.textContent=pct<99?"Final Video Loading...":"Final Video Finishing...";};
 makeProgress();setProgress(1);status("fstatus","⏳ Final Video render စနေပါတယ်... 1%");
 try{
  const f=new FormData();f.append("video",file);if(srt)f.append("srt",srt);if(voiceId)f.append("voiceId",voiceId);if(voiceUploadFile)f.append("voice",voiceUploadFile,voiceUploadFile.name);f.append("text",$("editText").value);f.append("fontStyle",$("fontStyle").value);f.append("fontColor",$("textColor").value);f.append("borderColor",$("borderColor").value);f.append("borderWidth",$("borderWidth").value);f.append("showText",showText.checked?"1":"0");f.append("showBlur",showBlur.checked?"1":"0");f.append("showLogo",showLogo.checked?"1":"0");
  ["fontSize","textWeight","textX","textY","blurAmount","blurX","blurY","blurW","blurH","logoSize","logoX","logoY"].forEach(id=>f.append(id,$(id).value));if(logoFile)f.append("logo",logoFile);if(fontFile)f.append("font",fontFile);
  if(!voiceUploadFile&&voiceUrl){try{const vr=await fetch(voiceUrl,{cache:"no-store"});if(!vr.ok)throw new Error();const vb=await vr.blob();f.append("voice",vb,"saved-ai-voice.wav");}catch(e){throw new Error("သိမ်းထားတဲ့ AI Voice ကို Final Video ထဲထည့်မရပါ။ AI Voice ကို တစ်ခါပြန်ထုတ်ပါ။");}}
  const d=await apiJson(await fetch("/api/render",{method:"POST",body:f}));const jobId=d.jobId;if(!jobId)throw new Error("Render job ID မရပါ။");
  for(let attempts=0;attempts<600;attempts++){await new Promise(r=>setTimeout(r,1000));const q=await apiJson(await fetch("/api/render/status/"+encodeURIComponent(jobId),{cache:"no-store"}));if(q.status==="processing"){setProgress(Math.max(pct,Math.min(96,Number(q.progress||5)+Math.min(70,attempts*.15))));status("fstatus","⏳ Final Video render လုပ်နေပါတယ်... "+pct+"%");continue;}if(q.status==="error")throw new Error(q.error||"Final render failed");if(q.status==="done"){setProgress(100);const label=document.getElementById("renderProgressLabel");if(label)label.textContent="Final Video Complete";$("finalLink").href=q.url;$("finalLink").hidden=false;status("fstatus","✅ Final MP4 ပြီးပါပြီ — 100%");break;}}
 }catch(e){status("fstatus","❌ "+e.message)}finally{b.disabled=false}
};


// One-click controller: runs existing pipeline endpoints in sequence.
(()=>{
 const $=id=>document.getElementById(id);if(!$("oneClickRecap"))return;
 let movie=null,original="",burmese="",transcript="",recapText="",recapSrt="",voiceBlob=null;
 const all=[["validation",5,"Validating video"],["audio",10,"Extracting audio / transcribing"],["original",30,"Creating original SRT"],["translation",40,"Translating to Burmese"],["recap",52,"Writing recap script"],["subtitle",62,"Creating recap subtitles"],["voice",72,"Generating AI voice"],["sync",82,"Syncing voice and subtitles"],["render",90,"Rendering final MP4"],["complete",100,"Complete"]];
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
   progress(62,"Creating recap subtitles",done);const tts=await json("/api/tts",{text:recapText,voice:$("oneVoice").value,rate:Number($("oneSpeed").value||1)});recapSrt=tts.voiceSrt||tts.srt||"";if(!tts.id)throw Error("AI Voice မရပါ။");done.push("subtitle","voice","sync");
   try{const v=await fetch(tts.url);if(v.ok)voiceBlob=await v.blob();}catch{}
   progress(82,"Voice and subtitle timing ready",done);
   const rf=new FormData();rf.append("video",movie,movie.name);if($("oneSubtitles").checked)rf.append("srt",recapSrt);rf.append("voiceId",tts.id);rf.append("showText","0");rf.append("showBlur","0");rf.append("showLogo","0");
   progress(90,"Rendering final MP4",done);say("AI Voice + Video ကိုပေါင်းပြီး MP4 ထုတ်နေပါတယ်...");
   const r=await call("/api/render",{method:"POST",body:rf});if(!r.jobId)throw Error("Render job ID မရပါ။");
   let result=null;
   for(let i=0;i<900;i++){await new Promise(resolve=>setTimeout(resolve,1000));const q=await call("/api/render/status/"+encodeURIComponent(r.jobId),{cache:"no-store"});if(q.status==="error")throw Error(q.error||"Final rendering failed");if(q.status==="done"){result=q;break;}progress(Math.min(97,90+Math.floor(i/8)),"Rendering final video",done);}
   if(!result)throw Error("Render ကြာမြင့်နေပါတယ်။ ပြန်စမ်းပါ။");if(!result.url)throw Error("Final MP4 URL မရပါ။");
   $("oneFinalVideo").src=result.url;$("oneDownload").href=result.url;$("oneDownload").download=result.filename||"yoon-recap.mp4";$("oneResult").hidden=false;done.push("render","complete");progress(100,"Recap complete",done);say("✅ Recap ပြီးပါပြီ။ Final MP4 ကို preview ကြည့်ပြီး download လုပ်နိုင်ပါတယ်။");
   localStorage.setItem("yoon_original_srt",original);localStorage.setItem("yoon_burmese_srt",burmese);
  }catch(e){say("❌ "+(e?.message||String(e)));}
  finally{btn.disabled=false;}
 });
 $("oneOriginalSrt").onclick=()=>download("original.srt",original,"application/x-subrip");
 $("oneBurmeseSrt").onclick=()=>download("burmese.srt",burmese,"application/x-subrip");
 $("oneRecapScript").onclick=()=>download("recap.txt",recapText,"text/plain;charset=utf-8");
 $("oneRecapSrt").onclick=()=>download("recap.srt",recapSrt,"application/x-subrip");
 $("oneVoiceDownload").onclick=()=>{if(!voiceBlob)return say("Voice file မရနိုင်သေးပါ။");const u=URL.createObjectURL(voiceBlob),a=document.createElement("a");a.href=u;a.download="ai-voice.wav";a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);};
 $("oneTranscript").onclick=()=>download("transcript.txt",transcript,"text/plain;charset=utf-8");
})();
