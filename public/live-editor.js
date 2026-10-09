/* Yoon Recap Step 03 — touch/mouse live editor */
(()=>{
  const $=id=>document.getElementById(id);
  const editor=$('editorPreview'), text=$('textPreview'), blur=$('blurLayer'), logo=$('logoPreview');
  if(!editor||!text||!blur||!logo)return;
  const css=document.createElement('style');
  css.textContent=`
    #editorPreview{position:relative;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
    #editorPreview>video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1}
    #editorPreview .blur-layer,#editorPreview .text-preview,#editorPreview .logo-preview{z-index:5;touch-action:none;cursor:move;user-select:none;-webkit-user-select:none}
    #editorPreview .blur-layer{pointer-events:auto}
    #editorPreview .text-preview{padding:8px 14px;border:2px dashed rgba(255,255,255,.45);border-radius:8px;min-width:70px}
    #editorPreview .logo-preview{pointer-events:auto;object-fit:contain}
    .live-editor-hint{margin:8px 0;padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.12);font-size:13px}
    .live-selected{outline:2px solid #7c5cff!important;outline-offset:2px}
    .live-handle{position:absolute;right:-8px;bottom:-8px;width:18px;height:18px;border-radius:50%;background:#7c5cff;border:2px solid #fff;z-index:20;cursor:nwse-resize;touch-action:none;box-sizing:border-box}
    .live-inline-edit{outline:2px solid #00b894!important;outline-offset:2px;cursor:text!important}
  `;
  document.head.appendChild(css);

  const hint=document.createElement('div');
  hint.className='live-editor-hint';
  hint.textContent='👆 လက်နဲ့ ဖိပြီး ဆွဲရွှေ့ပါ • 🟣 ထောင့်စက်ဝိုင်းကို ဆွဲပြီး Size ချိန်ပါ • 📝 စာသားကို Preview ပေါ်မှာ နှစ်ချက်နှိပ်ပြီး တိုက်ရိုက်ရေးပါ';
  editor.parentNode.insertBefore(hint,editor);

  const rangeMap={
    text:['textX','textY'],blur:['blurX','blurY'],logo:['logoX','logoY']
  };
  const checked={text:()=>$('showText')?.checked,blur:()=>$('showBlur')?.checked,logo:()=>$('showLogo')?.checked};
  const active=()=>window.yoonSelectEditorOption||(()=>{});

  function sync(){ if(window.update)window.update(); }
  function select(type){ const id=type==='text'?'showText':type==='blur'?'showBlur':'showLogo'; const c=$(id); if(c&&!c.checked){c.checked=true;} active()(type); [text,blur,logo].forEach(x=>x.classList.remove('live-selected')); const el=type==='text'?text:type==='blur'?blur:logo; el.classList.add('live-selected'); }

  function drag(el,type){
    const [xId,yId]=rangeMap[type];
    el.addEventListener('pointerdown',e=>{
      if(e.target.classList.contains('live-handle'))return;
      if(!checked[type]())return;
      if(type==='text' && el.classList.contains('live-inline-edit'))return;
      e.preventDefault();e.stopPropagation();select(type);
      const r=editor.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=Number($(xId).value),oy=Number($(yId).value),pid=e.pointerId;
      try{el.setPointerCapture(pid)}catch{}
      const move=ev=>{
        if(ev.pointerId!==pid)return;
        const dx=(ev.clientX-sx)/Math.max(1,r.width)*100,dy=(ev.clientY-sy)/Math.max(1,r.height)*100;
        const half=type==='blur'?Number($('blurW').value)/2:0;
        $(xId).value=Math.max(type==='blur'?half:2,Math.min(type==='blur'?100-half:98,ox+dx));
        $(yId).value=Math.max(2,Math.min(98,oy+dy)); sync();
      };
      const end=ev=>{if(ev.pointerId!==pid)return;el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);try{el.releasePointerCapture(pid)}catch{}};
      el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
    });
  }
  drag(text,'text');drag(blur,'blur');drag(logo,'logo');

  function addResize(el,type){
    const h=document.createElement('span');h.className='live-handle';h.title='Size';el.appendChild(h);
    h.addEventListener('pointerdown',e=>{
      if(!checked[type]())return;e.preventDefault();e.stopPropagation();select(type);
      const pid=e.pointerId,sx=e.clientX,sy=e.clientY,r=editor.getBoundingClientRect();
      const start=type==='text'?Number($('fontSize').value):type==='logo'?Number($('logoSize').value):{w:Number($('blurW').value),h:Number($('blurH').value)};
      try{h.setPointerCapture(pid)}catch{}
      const move=ev=>{
        if(ev.pointerId!==pid)return;const dx=(ev.clientX-sx)/Math.max(1,r.width)*100,dy=(ev.clientY-sy)/Math.max(1,r.height)*100;
        if(type==='text')$('fontSize').value=Math.max(10,Math.min(96,start+Math.round((dx+dy)*.5)));
        else if(type==='logo')$('logoSize').value=Math.max(30,Math.min(500,start+Math.round((dx+dy)*.5)));
        else {$('blurW').value=Math.max(10,Math.min(100,start.w+Math.round(dx)));$('blurH').value=Math.max(5,Math.min(80,start.h+Math.round(dy)));}
        sync();
      };
      const end=ev=>{if(ev.pointerId!==pid)return;h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',end);h.removeEventListener('pointercancel',end);try{h.releasePointerCapture(pid)}catch{}};
      h.addEventListener('pointermove',move);h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
    });
  }
  addResize(text,'text');addResize(blur,'blur');addResize(logo,'logo');

  text.addEventListener('dblclick',e=>{
    if(!$('showText')?.checked)return;e.preventDefault();e.stopPropagation();select('text');
    text.classList.add('live-inline-edit');text.setAttribute('contenteditable','true');text.focus();
    const range=document.createRange();range.selectNodeContents(text);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
  });
  text.addEventListener('input',()=>{const label=text.querySelector('.text-preview-label');const value=(label?label.textContent:text.textContent).replace(/\s+$/,'');if($('editText'))$('editText').value=value;sync();});
  text.addEventListener('blur',()=>{text.removeAttribute('contenteditable');text.classList.remove('live-inline-edit');sync();});

  [text,blur,logo].forEach((el,i)=>el.addEventListener('click',()=>select(i===0?'text':i===1?'blur':'logo')));
  document.querySelectorAll('#textControls input,#textControls select,#blurControls input,#logoControls input').forEach(el=>{
    if(el.type!=='file')el.addEventListener('input',sync);
    if(el.type!=='file')el.addEventListener('change',sync);
  });
  const oldPreview=$('previewUpdate');if(oldPreview)oldPreview.remove();
  sync();
})();
