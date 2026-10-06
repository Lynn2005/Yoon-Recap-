const $=id=>document.getElementById(id);let file=null;
function key(){return $("key").value.trim()}
function status(id,msg){$(id).textContent=msg}
function copy(v){if(v)navigator.clipboard?.writeText(v)}
function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click()}
$("video").onchange=e=>{file=e.target.files?.[0];if(file){const u=URL.createObjectURL(file);$("preview").src=u;$("preview").hidden=false}};
$("transcribe").onclick=async()=>{if(!file)return status("tstatus","⚠️ Video ရွေးပါ။");if(!key())return status("tstatus","⚠️ Gemini API Key ထည့်ပါ။");const b=$("transcribe");b.disabled=true;status("tstatus","⏳ Video ကို AI ဆီပို့ပြီး အသံဖတ်နေပါတယ်...");try{const f=new FormData();f.append("video",file);f.append("geminiKey",key());const r=await fetch("/api/transcribe",{method:"POST",body:f});const d=await r.json();if(!r.ok)throw Error(d.error);$("transcript").value=d.text;status("tstatus","✅ Transcript ပြီးပါပြီ။")}catch(e){status("tstatus","❌ "+e.message)}finally{b.disabled=false}};
$("recap").onclick=async()=>{if(!key())return status("rstatus","⚠️ Gemini API Key ထည့်ပါ။");if(!$("transcript").value.trim())return status("rstatus","⚠️ Transcript အရင်ထုတ်ပါ။");const b=$("recap");b.disabled=true;status("rstatus","⏳ Myanmar recap ရေးနေပါတယ်...");try{const r=await fetch("/api/recap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({geminiKey:key(),transcript:$("transcript").value,style:$("style").value})});const d=await r.json();if(!r.ok)throw Error(d.error);$("title").value=d.title||"";$("hook").value=d.hook||"";$("summary").value=d.summary||"";$("script").value=d.recap||"";status("rstatus","✅ Myanmar Recap ပြီးပါပြီ။")}catch(e){status("rstatus","❌ "+e.message)}finally{b.disabled=false}};
$("copyTranscript").onclick=()=>copy($("transcript").value);
$("downloadTxt").onclick=()=>download("Yoon-Transcript.txt",$("transcript").value);
$("copyScript").onclick=()=>copy($("script").value);
$("downloadScript").onclick=()=>download("Yoon-Myanmar-Recap.txt",$("script").value);
$("makeCaption").onclick=()=>{$("caption").value=(($("hook").value||$("title").value)||"ဒီဇာတ်လမ်းက တကယ်မထင်မှတ်ထားတဲ့အတိုင်း ဖြစ်သွားပါတယ်")+" 😱\nအဆုံးထိကြည့်ပြီး ဘာဖြစ်မလဲ ခန့်မှန်းကြည့်ပါ။\n\n#movie #movierecap #recap #tiktokmyanmar #fyp #မြန်မာ"};
$("copyCaption").onclick=()=>copy($("caption").value);
