/* Yoon Recap Studio — STEP 03 rebuilt from scratch
   Mobile-first LIVE EDIT: Text / Blur / Logo drag + resize + live controls.
*/
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const editor=$('editorPreview');
  if(!editor)return;

  const css=document.createElement('style');
  css.id='yoon-step3-live-style';
  css.textContent=`
    #editorPreview{
      position:relative!important;
      overflow:hidden!important;
      touch-action:none!important;
      -webkit-user-select:none!important;
      user-select:none!important;
      background:#111;
    }
    #editorPreview>video{
      position:absolute!important;
      inset:0!important;
      width:100%!important;
      height:100%!important;
      object-fit:contain!important;
      z-index:1!important;
      pointer-events:none!important;
    }
    #editorPreview .step3-object{
      position:absolute!important;
      box-sizing:border-box!important;
      touch-action:none!important;
      -webkit-user-select:none!important;
      user-select:none!important;
      cursor:grab!important;
      pointer-events:auto!important;
    }
    #editorPreview .step3-object.dragging{cursor:grabbing!important;}
    #editorPreview .step3-object.step3-active{
      outline:2px solid #7c5cff!important;
      outline-offset:2px!important;
      z-index:100!important;
    }
    #editorPreview .step3-handle{
      position:absolute!important;
      right:-10px!important;
      bottom:-10px!important;
      width:22px!important;
      height:22px!important;
      border-radius:50%!important;
      background:#7c5cff!important;
      border:3px solid #fff!important;
      box-sizing:border-box!important;
      z-index:999!important;
      touch-action:none!important;
      cursor:nwse-resize!important;
      pointer-events:auto!important;
    }
    #editorPreview .text-preview-label{pointer-events:none!important;}
    .step3-help{
      margin:8px 0!important;
      padding:10px 12px!important;
      border-radius:12px!important;
      background:rgba(124,92,255,.10)!important;
      border:1px solid rgba(124,92,255,.25)!important;
      font-size:13px!important;
      line-height:1.5!important;
    }
    .step3-toolbar{
      display:flex!important;
      gap:8px!important;
      flex-wrap:wrap!important;
      margin:10px 0!important;
    }
    .step3-toolbar button{flex:1 1 120px!important;min-height:42px!important;}
  `;
  document.head.appendChild(css);

  // Remove the previous editor's event-bound overlay nodes while preserving the controls.
  function replaceLayer(id,tag){
    const old=$(id); if(!old)return null;
    const fresh=document.createElement(tag);
    for(const a of old.attributes) fresh.setAttribute(a.name,a.value);
    fresh.id=id;
    old.replaceWith(fresh);
    return fresh;
  }
  const video=editor.querySelector('#editVideo');
  const text=replaceLayer('textPreview','div');
  const blur=replaceLayer('blurLayer','div');
  const logo=replaceLayer('logoPreview','img');
  if(!text||!blur||!logo)return;

  text.className='text-preview step3-object';
  blur.className='blur-layer step3-object';
  logo.className='logo-preview step3-object';
  if(video)video.style.pointerEvents='none';

  // Fresh hint and reset controls.
  editor.parentNode.querySelectorAll('.live-editor-hint,.step3-help').forEach(x=>x.remove());
  const help=document.createElement('div');
  help.className='step3-help';
  help.innerHTML='👆 <b>လက်နဲ့ဖိပြီး ဆွဲရွှေ့ပါ</b> — စာ / Blur / Logo ကို တိုက်ရိုက်ရွှေ့နိုင်ပါတယ်။<br>🟣 ထောင့်က စက်ဝိုင်းကို ဆွဲရင် Size ပြောင်းပါတယ်။ စာသားကို နှစ်ချက်နှိပ်ရင် တိုက်ရိုက်ရေးနိုင်ပါတယ်။';
  editor.parentNode.insertBefore(help,editor);

  const toolbar=document.createElement('div');
  toolbar.className='step3-toolbar';
  const reset=document.createElement('button');
  reset.type='button'; reset.textContent='↺ Reset';
  const center=document.createElement('button');
  center.type='button'; center.textContent='🎯 Center Text';
  toolbar.append(reset,center);
  editor.parentNode.insertBefore(toolbar,editor.nextSibling);

  const controls={
    text:['showText','textControls'],
    blur:['showBlur','blurControls'],
    logo:['showLogo','logoControls']
  };
  const objects={text,blur,logo};
  let active='text';
  let drag=null;
  let logoUrl=null;
  let fontUrl=null;

  let label=text.querySelector('.text-preview-label');
  if(!label){
    label=document.createElement('span');
    label.className='text-preview-label';
    text.replaceChildren(label);
  }
  let handle=text.querySelector('.step3-handle');
  if(!handle){
    handle=document.createElement('span');
    handle.className='step3-handle';
    text.appendChild(handle);
  }

  function value(id,fallback=''){const el=$(id);return el?el.value:fallback}
  function setValue(id,v){const el=$(id);if(el)el.value=String(v)}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
  function editorPoint(e){return {x:e.clientX,y:e.clientY}}
  function percent(x,y){const r=editor.getBoundingClientRect();return {x:(x-r.left)/Math.max(1,r.width)*100,y:(y-r.top)/Math.max(1,r.height)*100}}

  function activate(type){
    active=type;
    Object.entries(objects).forEach(([k,el])=>{
      el.classList.toggle('step3-active',k===type);
      el.style.zIndex=k===type?'100':k==='logo'?'70':k==='text'?'60':'50';
    });
    const [check,panel]=controls[type];
    if($(check))$(check).checked=true;
    Object.entries(controls).forEach(([k,[c,p]])=>{if($(p))$(p).hidden=!(k===type && $(c)?.checked)})
    render();
  }

  function render(){
    const showT=$('showText')?.checked;
    const showB=$('showBlur')?.checked;
    const showL=$('showLogo')?.checked;

    label.textContent=value('editText','Myanmar Recap');
    const fs=value('fontStyle','noto');
    text.style.fontFamily=fs==='sans'?'sans-serif':fs==='eka'?'Eka03Custom, "Noto Sans Myanmar", sans-serif':'"Noto Sans Myanmar", sans-serif';
    text.style.color=value('textColor','#fff');
    text.style.webkitTextStroke=`${Number(value('borderWidth',3))}px ${value('borderColor','#000')}`;
    text.style.fontSize=`${Number(value('fontSize',28))}px`;
    text.style.fontWeight=value('textWeight',800);
    text.style.left=`${Number(value('textX',50))}%`;
    text.style.top=`${Number(value('textY',88))}%`;
    text.style.transform='translate(-50%,-50%)';
    text.style.width='max-content';
    text.style.maxWidth='92%';
    text.style.display=showT?'block':'none';

    const bw=Number(value('blurW',90)),bh=Number(value('blurH',22));
    blur.style.left=`${Number(value('blurX',50))-bw/2}%`;
    blur.style.top=`${Number(value('blurY',82))}%`;
    blur.style.width=`${bw}%`;
    blur.style.height=`${bh}%`;
    blur.style.transform='translateY(-50%)';
    blur.style.backdropFilter=`blur(${Number(value('blurAmount',8))}px)`;
    blur.style.webkitBackdropFilter=`blur(${Number(value('blurAmount',8))}px)`;
    blur.style.background='rgba(255,255,255,.02)';
    blur.style.border='1px dashed rgba(255,255,255,.35)';
    blur.style.display=showB?'block':'none';

    logo.style.width=`${Number(value('logoSize',72))}px`;
    logo.style.height=`${Number(value('logoSize',72))}px`;
    logo.style.left=`${Number(value('logoX',90))}%`;
    logo.style.top=`${Number(value('logoY',10))}%`;
    logo.style.right='auto';
    logo.style.transform='translate(-50%,-50%)';
    logo.style.objectFit='contain';
    logo.style.display=showL&&!!logo.src?'block':'none';
    logo.hidden=!(showL&&!!logo.src);

    if(handle.parentElement!==text)text.appendChild(handle);
    handle.style.display=showT?'block':'none';

    const out={fontValue:'fontSize',borderWidthValue:'borderWidth',textWeightValue:'textWeight',textXValue:'textX',textYValue:'textY',blurValue:'blurAmount',blurXValue:'blurX',blurYValue:'blurY',blurWValue:'blurW',blurHValue:'blurH',logoValue:'logoSize',logoXValue:'logoX',logoYValue:'logoY'};
    Object.entries(out).forEach(([oid,cid])=>{if($(oid)&&$(cid))$(oid).textContent=$(cid).value});
    Object.entries(controls).forEach(([k,[c,p]])=>{if($(p))$(p).hidden=!(k===active&&$(c)?.checked)});
    if(window.yoonStep3Changed)window.yoonStep3Changed();
  }
  window.update=render;
  window.yoonSelectEditorOption=activate;

  function beginDrag(type,e){
    if(e.button!==undefined&&e.button!==0)return;
    if(e.target.closest('.step3-handle'))return;
    const check=$(controls[type][0]);
    if(check&&!check.checked)check.checked=true;
    activate(type);
    const p=editorPoint(e),s=percent(p.x,p.y);
    drag={mode:'move',type,pointerId:e.pointerId,start:s,ox:Number(value(type==='text'?'textX':type==='blur'?'blurX':'logoX',50)),oy:Number(value(type==='text'?'textY':type==='blur'?'blurY':'logoY',50)),el:objects[type]};
    e.preventDefault();e.stopPropagation();
    try{drag.el.setPointerCapture(e.pointerId)}catch{}
    drag.el.classList.add('dragging');
  }
  function moveDrag(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    e.preventDefault();
    const p=percent(e.clientX,e.clientY),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    const xId=drag.type==='text'?'textX':drag.type==='blur'?'blurX':'logoX';
    const yId=drag.type==='text'?'textY':drag.type==='blur'?'blurY':'logoY';
    if(drag.type==='blur'){
      const half=Number(value('blurW',90))/2;
      setValue(xId,clamp(drag.ox+dx,half,100-half));
    }else setValue(xId,clamp(drag.ox+dx,2,98));
    setValue(yId,clamp(drag.oy+dy,2,98));
    render();
  }
  function endDrag(e){
    if(!drag)return;
    if(e.pointerId!==undefined&&drag.pointerId!==undefined&&e.pointerId!==drag.pointerId)return;
    drag.el.classList.remove('dragging');
    try{drag.el.releasePointerCapture(drag.pointerId)}catch{}
    drag=null;render();
  }

  function beginResize(type,e){
    if(e.button!==undefined&&e.button!==0)return;
    const p=editorPoint(e),r=editor.getBoundingClientRect();
    const base=type==='text'?Number(value('fontSize',28)):type==='logo'?Number(value('logoSize',72)):{w:Number(value('blurW',90)),h:Number(value('blurH',22))};
    drag={mode:'resize',type,pointerId:e.pointerId,sx:p.x,sy:p.y,rect:r,base,el:objects[type]};
    activate(type);e.preventDefault();e.stopPropagation();
    try{handle.setPointerCapture(e.pointerId)}catch{}
  }
  function moveResize(e){
    if(!drag||drag.mode!=='resize'||e.pointerId!==drag.pointerId)return;
    e.preventDefault();
    const dx=(e.clientX-drag.sx)/Math.max(1,drag.rect.width)*100;
    const dy=(e.clientY-drag.sy)/Math.max(1,drag.rect.height)*100;
    if(drag.type==='text')setValue('fontSize',clamp(drag.base+Math.round((dx+dy)/2),10,96));
    else if(drag.type==='logo')setValue('logoSize',clamp(drag.base+Math.round((dx+dy)/2),30,500));
    else{setValue('blurW',clamp(drag.base.w+Math.round(dx),10,100));setValue('blurH',clamp(drag.base.h+Math.round(dy),5,80));}
    render();
  }

  [
    ['text',text],['blur',blur],['logo',logo]
  ].forEach(([type,el])=>{
    el.addEventListener('pointerdown',e=>beginDrag(type,e),{passive:false});
    el.addEventListener('pointermove',moveDrag,{passive:false});
    el.addEventListener('pointerup',endDrag,{passive:false});
    el.addEventListener('pointercancel',endDrag,{passive:false});
  });
  handle.addEventListener('pointerdown',e=>beginResize('text',e),{passive:false});
  handle.addEventListener('pointermove',moveResize,{passive:false});
  handle.addEventListener('pointerup',endDrag,{passive:false});
  handle.addEventListener('pointercancel',endDrag,{passive:false});

  text.addEventListener('dblclick',e=>{
    e.preventDefault();e.stopPropagation();activate('text');
    text.contentEditable='true';text.focus();
    const range=document.createRange();range.selectNodeContents(label);range.collapse(false);
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
  });
  text.addEventListener('input',()=>{setValue('editText',label.textContent.trim());render()});
  text.addEventListener('blur',()=>{text.contentEditable='false';render()});

  // Controls: every slider/input updates the preview immediately.
  document.querySelectorAll('#textControls input,#textControls select,#blurControls input,#logoControls input').forEach(el=>{
    if(el.type==='file')return;
    el.addEventListener('input',render);el.addEventListener('change',render);
  });
  ['showText','showBlur','showLogo'].forEach(id=>$(id)?.addEventListener('change',()=>activate(id==='showText'?'text':id==='showBlur'?'blur':'logo')));

  $('fontFile')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(fontUrl)URL.revokeObjectURL(fontUrl);fontUrl=URL.createObjectURL(f);
    let st=$('step3CustomFont');if(!st){st=document.createElement('style');st.id='step3CustomFont';document.head.appendChild(st)}
    st.textContent=`@font-face{font-family:Eka03Custom;src:url("${fontUrl}")}`;
    setValue('fontStyle','eka');render();
  });
  $('logoFile')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(logoUrl)URL.revokeObjectURL(logoUrl);logoUrl=URL.createObjectURL(f);
    logo.src=logoUrl;logo.hidden=false;setValue('showLogo','on');if($('showLogo'))$('showLogo').checked=true;activate('logo');render();
  });

  reset.addEventListener('click',()=>{
    const defaults={editText:'Myanmar Recap',fontStyle:'noto',textColor:'#ffffff',borderColor:'#000000',borderWidth:3,fontSize:28,textX:50,textY:88,textWeight:800,blurAmount:8,blurX:50,blurY:82,blurW:90,blurH:22,logoSize:72,logoX:90,logoY:10};
    Object.entries(defaults).forEach(([id,v])=>setValue(id,v));
    if($('showText'))$('showText').checked=true;if($('showBlur'))$('showBlur').checked=false;if($('showLogo'))$('showLogo').checked=false;
    activate('text');render();
  });
  center.addEventListener('click',()=>{setValue('textX',50);setValue('textY',50);activate('text');render()});

  // Initial state.
  activate('text');render();
})();