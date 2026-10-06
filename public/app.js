const $=id=>document.getElementById(id);let file=null,previewUrl=null;
function key(){return $("key").value.trim()}
const saved=localStorage.getItem("yoon_groq_key");
if(saved){$("key").value=saved;$("keyStatus").textContent="✅ Saved Groq Key ကို အလိုအလျောက်ထည့်ထားပါတယ်။"}
$("saveKey").onclick=()=>{const k=key();if(!k){$("keyStatus").textContent="⚠️ API Key ထည့်ပါ။";return}localStorage.setItem("yoon_groq_key",k);$("keyStatus").textContent="✅ Groq API Key သိမ်းပြီးပါပြီ။"}
function status(id,msg){$(id).textContent=msg}
async function apiJson(r){
  const text=await r.text();
  let d;
  try{d=JSON.parse(text)}catch{
    const clean=text.replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim();
    throw Error(r.status+" "+(clean||"Server က JSON မပြန်ပါ။"));
  }
  if(!r.ok)throw Error(d.error||("Request failed: "+r.status));
  return d;
}
function copy(v){if(v)navigator.clipboard?.writeText(v)}
function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$("video").onchange=e=>{file=e.target.files?.[0];if(previewUrl)URL.revokeObjectURL(previewUrl);if(file){previewUrl=URL.createObjectURL(file);$("preview").src=previewUrl;$("preview").hidden=false}}
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!key())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Audio extract + AI transcription လုပ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",key());const r=await fetch("/api/transcribe",{method:"POST",body:f});const d=await apiJson(r);$("transcript").value=d.text;status("tstatus","✅ Transcript ပြီးပါပြီ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}}
$("recap").onclick=async()=>{const t=$("transcript").value.trim();if(!key())return status("rstatus","⚠️ Groq API Key ထည့်ပါ။");if(!t)return status("rstatus","⚠️ Transcript အရင်ထုတ်ပါ။");const b=$("recap");b.disabled=true;status("rstatus","⏳ Myanmar recap ရေးနေပါတယ်...");try{const r=await fetch("/api/recap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groqKey:key(),transcript:t,style:$("style").value})});const d=await apiJson(r);$("title").value=d.title||"";$("hook").value=d.hook||"";$("summary").value=d.summary||"";$("script").value=d.recap||"";status("rstatus","✅ Myanmar Recap ပြီးပါပြီ။")}catch(e){status("rstatus","❌ "+e.message)}finally{b.disabled=false}}
$("copyTranscript").onclick=()=>copy($("transcript").value);$("downloadTxt").onclick=()=>download("Yoon-Transcript.txt",$("transcript").value);$("copyScript").onclick=()=>copy($("script").value);$("downloadScript").onclick=()=>download("Yoon-Myanmar-Recap.txt",$("script").value);
$("makeCaption").onclick=()=>{$("caption").value=(($("hook").value||$("title").value)||"ဒီဇာတ်လမ်းက တကယ်မထင်မှတ်ထားတဲ့အတိုင်း ဖြစ်သွားပါတယ်")+" 😱\nအဆုံးထိကြည့်ပြီး ဘာဖြစ်မလဲ ခန့်မှန်းကြည့်ပါ။\n\n#movie #movierecap #recap #tiktokmyanmar #fyp #မြန်မာ"};$("copyCaption").onclick=()=>copy($("caption").value);
// Live video editor
const editVideo=$("editVideo"), editText=$("editText"), textPreview=$("textPreview"), blurLayer=$("blurLayer"), blurOriginal=$("blurOriginal"), blurAmount=$("blurAmount"), blurValue=$("blurValue"), fontSize=$("fontSize"), fontValue=$("fontValue"), logoFile=$("logoFile"), logoPreview=$("logoPreview"), logoSize=$("logoSize"), logoValue=$("logoValue"), logoPos=$("logoPos"), textX=$("textX"), textY=$("textY"), textXValue=$("textXValue"), textYValue=$("textYValue"), logoX=$("logoX"), logoY=$("logoY"), logoXValue=$("logoXValue"), logoYValue=$("logoYValue"), blurX=$("blurX"), blurY=$("blurY"), blurW=$("blurW"), blurH=$("blurH"), blurXValue=$("blurXValue"), blurYValue=$("blurYValue"), blurWValue=$("blurWValue"), blurHValue=$("blurHValue");
function syncEditorVideo(){if(file){editVideo.src=previewUrl;editVideo.currentTime=0;}}
const showText=$("showText"),showBlur=$("showBlur"),showLogo=$("showLogo"),textControls=$("textControls"),blurControls=$("blurControls"),logoControls=$("logoControls");
function toggleEditorOptions(){
  textControls.hidden=!showText.checked;
  blurControls.hidden=!showBlur.checked;
  logoControls.hidden=!showLogo.checked;
  textPreview.style.display=showText.checked?"block":"none";
  blurLayer.style.display=showBlur.checked?"block":"none";
  logoPreview.style.display=showLogo.checked&&logoPreview.src?"block":"none";
  const handles=document.querySelectorAll(".resize-handle");
  handles.forEach(h=>h.style.display="none");
  if(showText.checked) document.querySelector(".text-handle")?.style.setProperty("display","block");
  if(showBlur.checked) document.querySelector(".blur-layer .resize-handle")?.style.setProperty("display","block");
  if(showLogo.checked&&logoPreview.src) document.querySelector(".logo-handle")?.style.setProperty("display","block");
}
function updateEditor(){
  if(textPreview.firstChild) textPreview.firstChild.nodeValue=editText.value||"";
  else textPreview.insertBefore(document.createTextNode(editText.value||""),textPreview.firstChild);textPreview.style.fontSize=fontSize.value+"px";fontValue.textContent=fontSize.value;textPreview.style.left=textX.value+"%";textPreview.style.bottom="auto";textPreview.style.top=textY.value+"%";textPreview.style.transform="translate(-50%,-50%)";textXValue.textContent=textX.value;textYValue.textContent=textY.value;blurLayer.style.backdropFilter=blurOriginal.checked?"blur("+blurAmount.value+"px)":"none";blurLayer.style.webkitBackdropFilter=blurOriginal.checked?"blur("+blurAmount.value+"px)":"none";blurLayer.style.background=blurOriginal.checked?"rgba(0,0,0,.12)":"transparent";blurLayer.style.left=(blurX.value-(blurW.value/2))+"%";blurLayer.style.width=blurW.value+"%";blurLayer.style.right="auto";blurLayer.style.top=blurY.value+"%";blurLayer.style.height=blurH.value+"%";blurLayer.style.bottom="auto";blurLayer.style.transform="translateY(-50%)";blurValue.textContent=blurAmount.value;blurXValue.textContent=blurX.value;blurYValue.textContent=blurY.value;blurWValue.textContent=blurW.value;blurHValue.textContent=blurH.value;logoPreview.style.display=showLogo.checked&&logoPreview.src?"block":"none";logoPreview.style.width=logoSize.value+"px";logoPreview.style.height=logoSize.value+"px";logoValue.textContent=logoSize.value;logoPreview.className="logo-preview "+logoPos.value;if(logoPos.value==="free"){logoPreview.style.left=logoX.value+"%";logoPreview.style.right="auto";logoPreview.style.top=logoY.value+"%";logoPreview.style.bottom="auto";logoPreview.style.transform="translate(-50%,-50%)"}else{logoPreview.style.transform="";}logoXValue.textContent=logoX.value;logoYValue.textContent=logoY.value;
  const lh=document.querySelector(".logo-handle");
  if(lh){
    lh.style.display=showLogo.checked&&logoPreview.src?"block":"none";
    lh.style.width="22px";lh.style.height="22px";
    if(logoPos.value==="free"){
      lh.style.left=(+logoX.value + (+logoSize.value/Math.max(1,$("editorPreview").getBoundingClientRect().width)*100)/2)+"%";
      lh.style.top=(+logoY.value + (+logoSize.value/Math.max(1,$("editorPreview").getBoundingClientRect().height)*100)/2)+"%";
      lh.style.right="auto";lh.style.bottom="auto";lh.style.transform="translate(-50%,-50%)";
    }else{
      lh.style.left="auto";lh.style.top="auto";lh.style.right=logoPos.value.includes("right")?"2px":"auto";lh.style.left=logoPos.value.includes("left")?"2px":"auto";lh.style.bottom=logoPos.value.includes("bottom")?"2px":"auto";lh.style.top=logoPos.value.includes("top")?"2px":"auto";lh.style.transform="";
    }
  }
}
$("video").addEventListener("change",()=>{syncEditorVideo();updateEditor()});
function activateOnly(active){
  // Each option is independent: multiple options can stay enabled together.
  toggleEditorOptions();updateEditor();
}
showText?.addEventListener("change",()=>{toggleEditorOptions();updateEditor()});
showBlur?.addEventListener("change",()=>{toggleEditorOptions();updateEditor()});
showLogo?.addEventListener("change",()=>{toggleEditorOptions();updateEditor()});editText?.addEventListener("input",updateEditor);blurOriginal?.addEventListener("change",updateEditor);blurAmount?.addEventListener("input",updateEditor);fontSize?.addEventListener("input",updateEditor);logoSize?.addEventListener("input",updateEditor);logoPos?.addEventListener("change",updateEditor);textX?.addEventListener("input",updateEditor);textY?.addEventListener("input",updateEditor);logoX?.addEventListener("input",updateEditor);logoY?.addEventListener("input",updateEditor);blurX?.addEventListener("input",updateEditor);blurY?.addEventListener("input",updateEditor);blurW?.addEventListener("input",updateEditor);blurH?.addEventListener("input",updateEditor);
logoFile?.addEventListener("change",e=>{const f=e.target.files?.[0];if(!f)return;logoPreview.src=URL.createObjectURL(f);logoPreview.hidden=false;showLogo.checked=true;activateOnly(showLogo)});
$("applyEditor")?.addEventListener("click",()=>{updateEditor();$("editorStatus").textContent="✅ Preview update လုပ်ပြီးပါပြီ။ Video ကို play လုပ်ပြီး live ကြည့်နိုင်ပါတယ်။"});
toggleEditorOptions();updateEditor();
// Drag editor elements directly with finger or mouse
(()=>{const p=$("editorPreview");if(!p)return;let d=null;const pos=e=>{const r=p.getBoundingClientRect();return{x:Math.max(2,Math.min(98,(e.clientX-r.left)/r.width*100)),y:Math.max(2,Math.min(98,(e.clientY-r.top)/r.height*100))}};const down=(type,e)=>{if(e.target===editVideo)return;e.preventDefault();d=type;const q=pos(e);if(type==="text"){textX.value=q.x;textY.value=q.y}if(type==="logo"&&logoPos.value==="free"){logoX.value=q.x;logoY.value=q.y}if(type==="blur"){blurX.value=q.x;blurY.value=q.y}updateEditor();e.currentTarget.setPointerCapture?.(e.pointerId)};const move=e=>{if(!d)return;e.preventDefault();const q=pos(e);if(d==="text"){textX.value=q.x;textY.value=q.y}if(d==="logo"&&logoPos.value==="free"){logoX.value=q.x;logoY.value=q.y}if(d==="blur"){blurX.value=q.x;blurY.value=q.y}updateEditor()};textPreview.addEventListener("pointerdown",e=>down("text",e));logoPreview.addEventListener("pointerdown",e=>down("logo",e));blurLayer.addEventListener("pointerdown",e=>down("blur",e));p.addEventListener("pointermove",move);p.addEventListener("pointerup",()=>d=null);p.addEventListener("pointercancel",()=>d=null)})();

// Direct touch resize handles
(()=>{const p=$("editorPreview");if(!p)return;let rz=null;const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const start=(type,e)=>{e.preventDefault();e.stopPropagation();rz={type,sx:e.clientX,sy:e.clientY,fs:+fontSize.value,ls:+logoSize.value,bw:+blurW.value,bh:+blurH.value};e.currentTarget.setPointerCapture?.(e.pointerId)};const move=e=>{if(!rz)return;e.preventDefault();const r=p.getBoundingClientRect(),dx=(e.clientX-rz.sx)/r.width*100,dy=(e.clientY-rz.sy)/r.height*100;if(rz.type==="text"){fontSize.value=clamp(Math.round(rz.fs+dy*0.8),14,100)}if(rz.type==="logo"){logoSize.value=clamp(Math.round(rz.ls+dy*1.5),30,300)}if(rz.type==="blur"){blurW.value=clamp(Math.round(rz.bw+dx*1.5),10,100);blurH.value=clamp(Math.round(rz.bh+dy*1.5),5,80)}updateEditor()};const end=()=>rz=null;document.querySelectorAll(".resize-handle").forEach(h=>h.addEventListener("pointerdown",e=>start(h.dataset.resize,e)));p.addEventListener("pointermove",move);p.addEventListener("pointerup",end);p.addEventListener("pointercancel",end)})();
