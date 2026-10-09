(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const msg=(id,t)=>{const e=$(id);if(e)e.textContent=t;};
  const json=async r=>{const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{}if(!r.ok)throw new Error(d?.error||t||('Request failed '+r.status));return d||{};};

  function bindVoice(){
    const b=$("makeVoice"),srtEl=$("burmeseSrt");
    if(!b||!srtEl||b.dataset.fixedVoice)return;
    b.dataset.fixedVoice='1';
    b.onclick=async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const srt=String(srtEl.value||'').trim();
      if(!srt)return msg('vstatus','⚠️ Burmese SRT အရင်ထုတ်ပါ။');
      b.disabled=true;msg('vstatus','⏳ Free Burmese AI Voice ထုတ်နေပါတယ်...');
      try{
        const text=srt.replace(/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n/g,'').replace(/\n{2,}/g,'\n').trim();
        const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,srt,voice:$("voice")?.value||'myanmar-female',rate:Number($("voiceSpeed")?.value||1)})});
        const d=await json(r);
        if(!d.id||!d.url)throw new Error('AI Voice file မရပါ။');
        window.voiceId=d.id;window.voiceUrl=d.url;window.voiceSrt=d.voiceSrt||d.srt||srt;
        localStorage.setItem('yoon_voice_id',d.id);localStorage.setItem('yoon_voice_url',d.url);localStorage.setItem('yoon_voice_srt',window.voiceSrt);
        const vp=$("voicePreview");if(vp){vp.src=d.url;vp.hidden=false;vp.load();}
        msg('vstatus','✅ AI Voice ပြီးပါပြီ။ Final Video ခလုတ်ကိုနှိပ်နိုင်ပါပြီ။');
      }catch(err){msg('vstatus','❌ AI Voice မအောင်မြင်ပါ — '+(err?.message||err));}
      finally{b.disabled=false;}
    };
  }

  function bindRender(){
    const b=$("render");
    if(!b||b.dataset.fixedRender)return;
    b.dataset.fixedRender='1';
    b.onclick=async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const file=window.file||null;
      if(!file){msg('fstatus','⚠️ Video ရွေးပါ။');return;}
      const voiceId=window.voiceId||localStorage.getItem('yoon_voice_id')||'';
      const voiceSrt=window.voiceSrt||localStorage.getItem('yoon_voice_srt')||'';
      b.disabled=true;msg('fstatus','⏳ Final Video render စနေပါတယ်...');
      try{
        const f=new FormData();f.append('video',file,file.name);if(voiceSrt.trim())f.append('srt',voiceSrt.trim());if(voiceId)f.append('voiceId',voiceId);
        const ids=['editText','fontStyle','textWeight','textColor','borderColor','borderWidth','showText','showBlur','showLogo','fontSize','textX','textY','blurAmount','blurX','blurY','blurW','blurH','logoSize','logoX','logoY'];
        ids.forEach(id=>{const x=$(id);if(!x)return;const v=x.type==='checkbox'?(x.checked?'1':'0'):x.value;f.append(id,v);});
        const logo=$("logoFile")?.files?.[0];if(logo)f.append('logo',logo,logo.name);
        const font=$("fontFile")?.files?.[0];if(font)f.append('font',font,font.name);
        const r=await fetch('/api/render',{method:'POST',body:f});const d=await json(r);if(!d.jobId)throw new Error('Render job ID မရပါ။');
        let last=5;
        for(let i=0;i<900;i++){
          await new Promise(x=>setTimeout(x,1000));
          const q=await json(await fetch('/api/render/status/'+encodeURIComponent(d.jobId),{cache:'no-store'}));
          if(q.status==='error')throw new Error(q.error||'Final render failed');
          if(q.status==='done'){
            const link=$("finalLink");if(link){link.href=q.url;link.hidden=false;link.target='_blank';}
            msg('fstatus','✅ Final MP4 ပြီးပါပြီ — Download ကိုနှိပ်ပါ။');return;
          }
          last=Math.min(99,Math.max(last,Math.round(Number(q.progress||5)+Math.min(80,i*.15))));
          msg('fstatus','⏳ Final Video render လုပ်နေပါတယ်... '+last+'%');
        }
        throw new Error('Render ကြာမြင့်နေပါတယ်။');
      }catch(err){msg('fstatus','❌ Final Video မအောင်မြင်ပါ — '+(err?.message||err));}
      finally{b.disabled=false;}
    };
  }

  const boot=()=>{bindVoice();bindRender();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  setTimeout(boot,500);
})();
