const DB_NAME="yoon-recap-db", STORE="projects", KEY="current";
let current=1, videoURL="", finalURL="", thumbURL="", project={};
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function saveProject(){
 project.name=project.name||"My Project"; project.transcript=$("transcript").value; project.translation=$("translation").value; project.voiceText=$("voiceText").value; project.voice=$("voice").value; project.step=current; project.updated=Date.now();
 const db=await openDB(); const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(project,KEY); $("saveState").textContent="Saved • "+new Date(project.updated).toLocaleTimeString(); 
}
async function loadProject(){
 try{const db=await openDB();const r=db.transaction(STORE).objectStore(STORE).get(KEY);r.onsuccess=()=>{project=r.result||{name:"My Project"}; $("projectName").textContent=project.name||"My Project"; $("transcript").value=project.transcript||""; $("translation").value=project.translation||""; $("voiceText").value=project.voiceText||""; if(project.step)go(project.step); if(project.theme==="light")document.body.classList.add("light"); if(project.video){videoURL=URL.createObjectURL(project.video);$("video").src=videoURL;$("videoPreview").hidden=false;$("fileInfo").innerHTML="<b>"+(project.videoName||"Saved video")+"</b> • Saved locally";} if(project.thumb){thumbURL=URL.createObjectURL(project.thumb);$("thumbPreview").src=thumbURL;$("thumbPreview").hidden=false;} if(project.final){finalURL=URL.createObjectURL(project.final);$("finalPreview").src=finalURL;$("finalPreview").hidden=false;}}}catch(e){console.log(e)}
}
function go(n){current=n;document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page"+n).classList.add("active");document.querySelectorAll(".step").forEach(x=>x.classList.toggle("active",+x.dataset.step===n));project.step=n;saveProject();window.scrollTo({top:0,behavior:"smooth"})}
function toggleTheme(){document.body.classList.toggle("light");project.theme=document.body.classList.contains("light")?"light":"dark";saveProject()}
async function renameProject(){const n=prompt("Project နာမည်ထည့်ပါ",project.name||"My Project");if(n&&n.trim()){project.name=n.trim();$("projectName").textContent=project.name;await saveProject()}}
async function newProject(){
 if(!confirm("Project အသစ်လုပ်မယ်ဆိုရင် လက်ရှိ Project ရဲ့ data အကုန်ရှင်းမယ်။ ဆက်လုပ်မလား?"))return;
 const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");const r=tx.objectStore(STORE).delete(KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
 location.reload();
}
$("videoFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>900*1024*1024){alert("900MB ထက်မကြီးရပါ။");return}project.video=f;project.videoName=f.name;videoURL=URL.createObjectURL(f);$("video").src=videoURL;$("videoPreview").hidden=false;$("fileInfo").innerHTML="<b>"+f.name+"</b> • "+(f.size/1024/1024).toFixed(1)+" MB";await saveProject()};
function processVideo(){if(!project.video){alert("Video ရွေးပေးပါ။");return}go(2)}
function transcribe(){ $("status2").textContent="ℹ️ Free mode: Transcript ကို ကိုယ်တိုင် paste/type လုပ်နိုင်ပါတယ်။ Paid API မသုံးပါ။";$("transcript").focus()}
function translateText(){const t=$("transcript").value.trim();if(!t){$("status2").textContent="Transcript အရင်ထည့်ပါ။";return} $("translation").value=t;saveProject();$("status2").textContent="✓ Text ကို Recap အတွက် ပြင်ပြီး သိမ်းထားပါတယ်။"}
function populateVoices(){const list=speechSynthesis.getVoices(),sel=$("voice");sel.innerHTML='<option value="">Default</option>';list.forEach((v,i)=>{const o=document.createElement("option");o.value=i;o.textContent=v.name+" • "+v.lang;sel.appendChild(o)});if(project.voice)sel.value=project.voice}
function generateVoice(){const text=$("voiceText").value.trim()||$("translation").value.trim();if(!text){$("status3").textContent="စာသားထည့်ပါ။";return}$("voiceText").value=text;saveProject();if(!("speechSynthesis" in window)){$("status3").textContent="ဒီ browser မှာ Voice မထောက်ပံ့ပါ။";return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);const i=parseInt($("voice").value);const v=speechSynthesis.getVoices()[i];if(v)u.voice=v;u.lang=v?.lang||"my-MM";u.rate=.95;u.onstart=()=>$("status3").textContent="▶ Voice playing...";u.onend=()=>$("status3").textContent="✓ Voice ပြီးပါပြီ";speechSynthesis.speak(u)}
$("transcript").oninput=saveProject;$("translation").oninput=saveProject;$("voiceText").oninput=saveProject;$("voice").onchange=saveProject;
$("finalFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;project.final=f;finalURL=URL.createObjectURL(f);$("finalPreview").src=finalURL;$("finalPreview").hidden=false;await saveProject()};
$("thumbFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;project.thumb=f;thumbURL=URL.createObjectURL(f);$("thumbPreview").src=thumbURL;$("thumbPreview").hidden=false;await saveProject()};
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click()}
function downloadFinal(){if(project.final)downloadBlob(project.final,"Yoon-Recap-Final.mp4");else if(finalURL){const a=document.createElement("a");a.href=finalURL;a.download="Yoon-Recap-Final.mp4";a.click()}else alert("Final video ထည့်ပေးပါ။")}
function downloadThumb(){if(project.thumb)downloadBlob(project.thumb,"Yoon-Recap-Thumbnail.png");else if(thumbURL){const a=document.createElement("a");a.href=thumbURL;a.download="Yoon-Recap-Thumbnail.png";a.click()}else alert("Thumbnail ထည့်ပေးပါ။")}
speechSynthesis.onvoiceschanged=populateVoices; window.addEventListener("beforeunload",saveProject); populateVoices(); loadProject();