const $=id=>document.getElementById(id);
let file=null,videoUrl=null,voiceId=localStorage.getItem("yoon_voice_id")||null,logoFile=null;

const savedGroq=localStorage.getItem("yoon_groq_key"),savedGemini=localStorage.getItem("yoon_gemini_key");
if(localStorage.getItem("yoon_original_srt"))$("originalSrt").value=localStorage.getItem("yoon_original_srt");
if(localStorage.getItem("yoon_burmese_srt"))$("burmeseSrt").value=localStorage.getItem("yoon_burmese_srt");
if(savedGroq)$("groqKey").value=savedGroq;if(savedGemini)$("geminiKey").value=savedGemini;
$("saveGroq").onclick=()=>{localStorage.setItem("yoon_groq_key",$("groqKey").value.trim());$("keyStatus").textContent="✅ Groq Key သိမ်းပြီးပါပြီ။"};
$("saveGemini").onclick=()=>{localStorage.setItem("yoon_gemini_key",$("geminiKey").value.trim());$("keyStatus").textContent="✅ Gemini Key သိမ်းပြီးပါပြီ။"};
const groq=()=>$("groqKey").value.trim(),gemini=()=>$("geminiKey").value.trim();
function status(id,msg){$(id).textContent=msg}
async function apiJson(r){
 const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{}
 if(!r.ok){
   if(r.status===502||r.status===503||r.status===504) throw Error("Server ခဏမရသေးပါ။ Render deploy/restart ဖြစ်နေခြင်း သို့မဟုတ် request timeout ဖြစ်နိုင်ပါတယ်။ 10 စက္ကန့်အကြာ ပြန်စမ်းပါ။");
   throw Error(d?.error||t||("Request failed "+r.status));
 }
 if(!d)throw Error("Server က JSON မပြန်ပါ။");
 return d;
}
function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

$("video").onchange=e=>{file=e.target.files?.[0];if(videoUrl)URL.revokeObjectURL(videoUrl);if(file){videoUrl=URL.createObjectURL(file);$("preview").src=videoUrl;$("preview").hidden=false;$("editVideo").src=videoUrl}};
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!groq())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Audio extract → Whisper → Original SRT ထုတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",groq());const d=await apiJson(await fetch("/api/transcribe",{method:"POST",body:f}));$("originalSrt").value=d.srt||"";localStorage.setItem("yoon_original_srt",$("originalSrt").value);status("tstatus","✅ Audio + Transcript + Original SRT ပြီးပါပြီ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};
$("downloadOriginal").onclick=()=>download("original.srt",$("originalSrt").value,"application/x-subrip");

$("translate").onclick=async()=>{const srt=$("originalSrt").value.trim();if(!srt)return status("trstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");if(!gemini())return status("trstatus","⚠️ Gemini API Key ထည့်ပါ။");const b=$("translate");b.disabled=true;status("trstatus","⏳ Gemini နဲ့ မြန်မာဘာသာပြန်နေပါတယ်...");try{const d=await apiJson(await fetch("/api/translate-srt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geminiKey:gemini(),srt})}));$("burmeseSrt").value=d.srt;localStorage.setItem("yoon_burmese_srt",$("burmeseSrt").value);status("trstatus","✅ Burmese SRT ပြီးပါပြီ။")}catch(e){status("trstatus","❌ "+e.message)}finally{b.disabled=false}};
$("downloadBurmese").onclick=()=>download("burmese.srt",$("burmeseSrt").value,"application/x-subrip");

$("makeVoice").onclick=async()=>{const text=$("burmeseSrt").value.replace(/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/g,"").replace(/\n{2,}/g,"\n").trim();if(!text)return status("vstatus","⚠️ Burmese SRT အရင်ထုတ်ပါ။");const b=$("makeVoice");b.disabled=true;status("vstatus","⏳ Free AI Voice ထုတ်နေပါတယ်...");try{const d=await apiJson(await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,voice:$("voice").value})}));voiceId=d.id;localStorage.setItem("yoon_voice_id",voiceId);$("voicePreview").src=d.url;$("voicePreview").hidden=false;status("vstatus","✅ Free AI Voice ပြီးပါပြီ။")}catch(e){status("vstatus","❌ "+e.message)}finally{b.disabled=false}};

const showText=$("showText"),showBlur=$("showBlur"),showLogo=$("showLogo"),textControls=$("textControls"),blurControls=$("blurControls"),logoControls=$("logoControls"),textPreview=$("textPreview"),blurLayer=$("blurLayer"),logoPreview=$("logoPreview");
let active=null;let activeOption=showText;
function update(){textPreview.textContent=$("editText").value||"";textPreview.style.fontSize=$("fontSize").value+"px";textPreview.style.left=$("textX").value+"%";textPreview.style.top=$("textY").value+"%";textPreview.style.fontWeight=$("textWeight").value;textPreview.style.width="fit-content";textPreview.style.height="fit-content";textPreview.style.maxWidth="92%";$("fontValue").textContent=$("fontSize").value;$("textWeightValue").textContent=$("textWeight").value;$("textXValue").textContent=$("textX").value;$("textYValue").textContent=$("textY").value;
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
$("editText").addEventListener("input",update);
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

$("finishKeep").onclick=()=>{
  const ids=["editText","fontSize","textX","textY","textWeight","blurAmount","blurX","blurY","blurW","blurH","logoFile","logoSize","logoX","logoY","showText","showBlur","showLogo"];
  ids.forEach(id=>{const el=$(id);if(el)el.disabled=true});
  $("finishKeep").disabled=true;
  $("finishStatus").textContent="✅ ရပြီ — လက်ရှိ setting အတိုင်း lock လုပ်ထားပါပြီ။";
  $("finishStatus").style.color="#16a34a";
  $("previewUpdate").disabled=true;
};

$("render").onclick=async()=>{
 const srt=$("burmeseSrt").value.trim();if(!file)return status("fstatus","⚠️ Video ရွေးပါ။");if(!srt)return status("fstatus","⚠️ Burmese SRT အရင်ထုတ်ပါ။");if(!voiceId)return status("fstatus","⚠️ AI Voice အရင်ထုတ်ပါ။");
 const b=$("render");b.disabled=true;status("fstatus","⏳ Subtitles + Voice + Adjustments → Final MP4 render လုပ်နေပါတယ်...");
 try{
  const f=new FormData();f.append("video",file);f.append("srt",srt);f.append("voiceId",voiceId);f.append("text",$("editText").value);f.append("showText",showText.checked?"1":"0");f.append("showBlur",showBlur.checked?"1":"0");f.append("showLogo",showLogo.checked?"1":"0");
  ["fontSize","textWeight","textX","textY","blurAmount","blurX","blurY","blurW","blurH","logoSize","logoX","logoY"].forEach(id=>f.append(id,$(id).value));
  if(logoFile)f.append("logo",logoFile);
  const d=await apiJson(await fetch("/api/render",{method:"POST",body:f}));$("finalLink").href=d.url;$("finalLink").hidden=false;status("fstatus","✅ Final MP4 ပြီးပါပြီ။");
 }catch(e){status("fstatus","❌ "+e.message)}finally{b.disabled=false}
};
