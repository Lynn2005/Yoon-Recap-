
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
  ['preview','editVideo'].forEach(id=>{const el=document.getElementById(id);if(el){try{el.pause();}catch(e){}el.removeAttribute('src');el.load?.();if(id==='preview')el.hidden=true;}});
}

let file=null,videoUrl=null,fontFile=null,customFontUrl=null,logoFile=null;


const savedGroq=localStorage.getItem("yoon_groq_key"),savedGemini=localStorage.getItem("yoon_gemini_key");
if(localStorage.getItem("yoon_original_srt"))$("originalSrt").value=localStorage.getItem("yoon_original_srt");
if(localStorage.getItem("yoon_burmese_srt")&&$("burmeseSrt"))$("burmeseSrt").value=localStorage.getItem("yoon_burmese_srt");
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
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!groq())return status("tstatus","⚠️ Groq API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Video အသံကို extract လုပ်ပြီး Original SRT ထုတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("groqKey",groq());const d=await apiJson(await fetch("/api/transcribe",{method:"POST",body:f}));$("originalSrt").value=d.srt||"";localStorage.setItem("yoon_original_srt",$("originalSrt").value);status("tstatus","✅ Original SRT ပြီးပါပြီ။ နောက်တစ်ဆင့်မှာ Burmese Recap Script ထုတ်ပါ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};


async function generateRecapScript(){const srt=$("originalSrt")?.value.trim()||"";if(!srt)return status("rstatus","⚠️ Original SRT အရင်ထုတ်ပါ။");if(!groq())return status("rstatus","⚠️ Groq API Key ထည့်ပြီး Save လုပ်ပါ။");const transcript=srt.replace(/\r/g,"").split(/\n/).filter(line=>!/^\s*\d+\s*$/.test(line)&&!/^\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(line)).join(" ").trim();const b=$("makeRecap");b.disabled=true;status("rstatus","⏳ မြန်မာ Recap Script ရေးနေပါတယ်...");try{const d=await apiJson(await fetch("/api/recap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groqKey:groq(),transcript,style:$("recapStyle").value,length:$("recapLength").value})}));$("recapScript").value=d.recap||"";localStorage.setItem("yoon_recap_script",$("recapScript").value);status("rstatus","✅ Recap Script ပြီးပါပြီ။ STEP 04 မှာ Burmese SRT ထုတ်ပါ။")}catch(e){status("rstatus","❌ "+e.message)}finally{b.disabled=false}}
$("makeRecap")?.addEventListener("click",generateRecapScript);
if(localStorage.getItem("yoon_recap_script")&&$("recapScript"))$("recapScript").value=localStorage.getItem("yoon_recap_script");
$("downloadOriginalSrt")?.addEventListener("click",()=>{const s=$("originalSrt")?.value.trim();if(s)download("original-timeline.srt",s+"\n","application/x-subrip");else status("tstatus","Original SRT မရှိသေးပါ။")});
if($("translate"))$("translate").onclick=()=>translateSrtAutomatically($("originalSrt").value,false);

const srtButton = $("generateSrt");
if(srtButton){
 srtButton.addEventListener("click",()=>{
  const script=String($("recapScript")?.value||"").trim();
  if(!script)return status("trstatus","⚠️ STEP 03 မှာ Burmese Recap Script အရင်ထုတ်ပါ။");
  try{
   status("trstatus","⏳ Recap Script ကို Burmese SRT ပြောင်းနေပါတယ်...");
   const mode=$("srtLength")?.value||"normal",maxChars=mode==="short"?20:mode==="long"?50:35;
   const pieces=script.replace(/\r/g,"").split(/(?<=[။.!?])\s+|\n+/u).map(x=>x.trim()).filter(Boolean);
   const lines=[];let carry="";
   for(const piece of pieces){let rest=piece;while(rest.length>maxChars){let cut=rest.lastIndexOf(" ",maxChars);if(cut<Math.floor(maxChars*.55))cut=maxChars;lines.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}if(rest)carry+=(carry?" ":"")+rest;if(carry.length>=Math.floor(maxChars*.7)||/[။.!?]$/.test(rest)){lines.push(carry);carry="";}}
   if(carry)lines.push(carry);if(!lines.length)throw Error("Recap Script မှ SRT မပြုလုပ်နိုင်ပါ။");
   const stamp=n=>{const ms=Math.max(0,Math.round(n*1000)),hh=Math.floor(ms/3600000),mm=Math.floor(ms%3600000/60000),ss=Math.floor(ms%60000/1000),mmm=ms%1000;return String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0")+","+String(mmm).padStart(3,"0");};
   let cursor=0;const draft=lines.map((line,i)=>{const begin=cursor;cursor+=Math.max(1.2,Array.from(line).length/5);return (i+1)+"\n"+stamp(begin)+" --> "+stamp(cursor)+"\n"+line;}).join("\n\n")+"\n";
   $("burmeseSrt").value=draft;localStorage.setItem("yoon_burmese_srt",draft);status("trstatus","✅ Burmese SRT ပြီးပါပြီ။ STEP 05 မှာ Preview/Edit လုပ်ပါ။");
  }catch(e){status("trstatus","❌ SRT မထုတ်နိုင်ပါ — "+errorText(e));}
 });
}
$("srtUpload")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const s=await f.text();if(!/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(s))throw Error("Valid SRT ဖိုင်မဟုတ်ပါ။");$("burmeseSrt").value=s.trim()+"\n";localStorage.setItem("yoon_burmese_srt",$("burmeseSrt").value);status("trstatus","✅ SRT Upload ပြီးပါပြီ။");}catch(e){status("trstatus","❌ "+e.message);}});
$("downloadSrt")?.addEventListener("click",()=>{const s=$("burmeseSrt")?.value.trim();if(s)download("burmese-recap.srt",s+"\n","application/x-subrip");else status("trstatus","SRT မရှိသေးပါ။")});
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
 const srt=(showSubtitles.checked?String($("burmeseSrt")?.value||"").trim():"");if(!file)return status("fstatus","⚠️ Video ရွေးပါ။");if(showSubtitles.checked&&(!srt||!srt.includes("-->")))return status("fstatus","⚠️ Subtitle ထည့်ရန် STEP 04 မှာ Burmese SRT ထုတ်ပါ သို့မဟုတ် Upload လုပ်ပါ။");
 const b=$("render");b.disabled=true;let pct=1;
 const makeProgress=()=>{let p=document.getElementById("renderProgress");if(!p){p=document.createElement("div");p.id="renderProgress";p.innerHTML='<div class="render-progress-top"><span id="renderProgressLabel">Final Video Loading...</span><b id="renderProgressPct">1%</b></div><div class="render-progress-track"><div id="renderProgressBar"></div></div>';const target=document.getElementById("fstatus");target.parentNode.insertBefore(p,target);}};
 const setProgress=n=>{pct=Math.max(pct,Math.min(99,Math.round(n)));const bar=document.getElementById("renderProgressBar"),label=document.getElementById("renderProgressLabel"),num=document.getElementById("renderProgressPct");if(bar)bar.style.width=pct+"%";if(num)num.textContent=pct+"%";if(label)label.textContent=pct<99?"Final Video Loading...":"Final Video Finishing...";};
 makeProgress();setProgress(1);status("fstatus","⏳ Final Video render စနေပါတယ်... 1%");
 try{
  const f=new FormData();f.append("video",file);f.append("previewWidth",String(editorPreview.getBoundingClientRect().width||editorPreview.clientWidth||360));if(srt)f.append("srt",srt);f.append("text",$("editText").value);f.append("fontStyle",$("fontStyle").value);f.append("textWeight",$("textWeight").value);f.append("fontColor",$("textColor").value);f.append("borderColor",$("borderColor").value);f.append("borderWidth",$("borderWidth").value);f.append("showText",showText.checked?"1":"0");f.append("showBlur",showBlur.checked?"1":"0");f.append("showLogo",showLogo.checked?"1":"0");
  ["fontSize","textWeight","textX","textY","subtitleFontSize","subtitleX","subtitleY","subtitleBorderWidth","blurAmount","blurX","blurY","blurW","blurH","logoSize","logoX","logoY"].forEach(id=>f.append(id,$(id).value));f.append("subtitleColor",$("subtitleColor").value);f.append("subtitleBorderColor",$("subtitleBorderColor").value);if(logoFile)f.append("logo",logoFile);if(fontFile)f.append("font",fontFile);
  const d=await apiJson(await fetch("/api/render",{method:"POST",body:f}));const jobId=d.jobId;if(!jobId)throw new Error("Render job ID မရပါ။");
  for(let attempts=0;attempts<600;attempts++){await new Promise(r=>setTimeout(r,1000));const q=await apiJson(await fetch("/api/render/status/"+encodeURIComponent(jobId),{cache:"no-store"}));if(q.status==="processing"){setProgress(Math.max(pct,Math.min(96,Number(q.progress||5)+Math.min(70,attempts*.15))));status("fstatus","⏳ Final Video render လုပ်နေပါတယ်... "+pct+"%");continue;}if(q.status==="error")throw new Error(q.error||"Final render failed");if(q.status==="done"){setProgress(100);const label=document.getElementById("renderProgressLabel");if(label)label.textContent="Final Video Complete";$("finalLink").href=q.url;$("finalLink").hidden=false;if($("oneFinalVideo"))$("oneFinalVideo").src=q.url;if($("oneDownload")){$("oneDownload").href=q.url;$("oneDownload").download=q.filename||"yoon-recap.mp4";}$("oneResult")?.removeAttribute("hidden");status("fstatus","✅ Final MP4 ပြီးပါပြီ — 100%");break;}}
 }catch(e){status("fstatus","❌ "+e.message)}finally{b.disabled=false}
};


