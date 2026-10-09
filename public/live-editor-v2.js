/* Yoon Recap Step 03 — robust Android touch/mouse live editor */
(()=>{
  const $=id=>document.getElementById(id);
  const editor=$('editorPreview'), text=$('textPreview'), blur=$('blurLayer'), logo=$('logoPreview');
  if(!editor||!text||!blur||!logo)return;

  const css=document.createElement('style');
  css.textContent=`
    #editorPreview{position:relative;overflow:hidden;touch-action:none!important;-webkit-user-select:none;user-select:none}
    #editorPreview>video{position:absolute!important;inset:0;width:100%;height:100%;object-fit:contain;z-index:1}
    #editorPreview .blur-layer,#editorPreview .text-preview,#editorPreview .logo-preview{z-index:50!important;pointer-events:auto!important;touch-action:none!important;-webkit-user-select:none;user-select:none;cursor:move}
    #editorPreview .text-preview-label{pointer-events:none!important}
    .live-handle{pointer-events:auto!important;z-index:100!important}
    .live-selected{outline:3px solid #7c5cff!important;outline-offset:2px}
    .live-editor-hint{margin:8px 0;padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.12);font-size:13px}
  `;
  document.head.appendChild(css);

  const oldHint=editor.parentNode.querySelector('.live-editor-hint');
  if(!oldHint){const h=document.createElement('div');h.className='live-editor-hint';h.textContent='👆 Preview ပေါ်က စာ/Blur/Logo ကို လက်နဲ့ ဖိပြီး ဆွဲရွှေ့ပါ။ 🟣 ထောင့်စက်ဝိုင်းကို ဆွဲရင် Size ချိန်ပါမယ်။';editor.parentNode.insertBefore(h,editor);}

  const map={text:['textX','textY'],blur:['blurX','blurY'],logo:['logoX','logoY']};
  const els={text,blur,logo};
  const checks={text:'showText',blur:'showBlur',logo:'showLogo'};
  let dragging=null;

  function sync(){if(window.update)window.update();}
  function select(type){
    const c=$(checks[type]); if(c&&!c.checked)c.checked=true;
    if(window.yoonSelectEditorOption)window.yoonSelectEditorOption(type);
    Object.values(els).forEach(e=>e.classList.remove('live-selected'));
    els[type].classList.add('live-selected');
  }
  function xy(clientX,clientY){const r=editor.getBoundingClientRect();return {x:((clientX-r.left)/Math.max(1,r.width))*100,y:((clientY-r.top)/Math.max(1,r.height))*100};}
  function setPos(type,p,ox,oy){
    const [xi,yi]=map[type];
    const half=type==='blur'?Number($("blurW").value||90)/2:0;
    $(xi).value=Math.max(type==='blur'?half:2,Math.min(type==='blur'?100-half:98,ox+p.x));
    $(yi).value=Math.max(2,Math.min(98,oy+p.y));
  }

  function startDrag(type,e){
    if(e.target.closest('.live-handle'))return;
    const c=$(checks[type]);if(c&&!c.checked)return;
    if(type==='text'&&text.isContentEditable)return;
    e.preventDefault();e.stopPropagation();select(type);
    const point=e.touches&&e.touches[0]?e.touches[0]:e;
    const start=xy(point.clientX,point.clientY);
    const [xi,yi]=map[type];const ox=Number($(xi).value),oy=Number($(yi).value);
    dragging={type,start,ox,oy};
    document.addEventListener('touchmove',touchMove,{passive:false});
    document.addEventListener('touchend',endDrag,{passive:false});
    document.addEventListener('touchcancel',endDrag,{passive:false});
    document.addEventListener('mousemove',mouseMove);
    document.addEventListener('mouseup',endDrag);
  }
  function moveTo(type,clientX,clientY){
    if(!dragging)return;const p=xy(clientX,clientY);setPos(type,{x:p.x-dragging.start.x,y:p.y-dragging.start.y},dragging.ox,dragging.oy);sync();
  }
  function touchMove(e){if(!dragging)return;e.preventDefault();const t=e.touches[0];moveTo(dragging.type,t.clientX,t.clientY)}
  function mouseMove(e){if(dragging)moveTo(dragging.type,e.clientX,e.clientY)}
  function endDrag(){
    if(!dragging)return;dragging=null;
    document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',endDrag);document.removeEventListener('touchcancel',endDrag);document.removeEventListener('mousemove',mouseMove);document.removeEventListener('mouseup',endDrag);sync();
  }

  function bindDrag(el,type){
    el.addEventListener('touchstart',e=>startDrag(type,e),{passive:false});
    el.addEventListener('mousedown',e=>{if(e.button===0)startDrag(type,e)});
  }
  bindDrag(text,'text');bindDrag(blur,'blur');bindDrag(logo,'logo');

  function resizeStart(type,e){
    e.preventDefault();e.stopPropagation();select(type);
    const point=e.touches&&e.touches[0]?e.touches[0]:e;const startX=point.clientX,startY=point.clientY;
    const r=editor.getBoundingClientRect();
    const start=type==='text'?Number($('fontSize').value):type==='logo'?Number($('logoSize').value):{w:Number($('blurW').value),h:Number($('blurH').value)};
    function mv(ev){
      ev.preventDefault();const p=ev.touches&&ev.touches[0]?ev.touches[0]:ev;const dx=(p.clientX-startX)/Math.max(1,r.width)*100,dy=(p.clientY-startY)/Math.max(1,r.height)*100;
      if(type==='text')$('fontSize').value=Math.max(10,Math.min(96,start+Math.round((dx+dy)*.5)));
      else if(type==='logo')$('logoSize').value=Math.max(30,Math.min(500,start+Math.round((dx+dy)*.5)));
      else{$('blurW').value=Math.max(10,Math.min(100,start.w+Math.round(dx)));$('blurH').value=Math.max(5,Math.min(80,start.h+Math.round(dy)));}
      sync();
    }
    function done(){document.removeEventListener('touchmove',mv);document.removeEventListener('touchend',done);document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',done);sync()}
    document.addEventListener('touchmove',mv,{passive:false});document.addEventListener('touchend',done,{passive:false});document.addEventListener('mousemove',mv);document.addEventListener('mouseup',done);
  }

  ['text','blur','logo'].forEach(type=>{
    const el=els[type];let h=el.querySelector('.live-handle');
    if(!h){h=document.createElement('span');h.className='live-handle';el.appendChild(h)}
    h.style.cssText='position:absolute;right:-9px;bottom:-9px;width:22px;height:22px;border-radius:50%;background:#7c5cff;border:3px solid #fff;z-index:100;box-sizing:border-box;touch-action:none';
    h.addEventListener('touchstart',e=>resizeStart(type,e),{passive:false});
    h.addEventListener('mousedown',e=>{if(e.button===0)resizeStart(type,e)});
  });

  text.addEventListener('dblclick',e=>{
    e.preventDefault();e.stopPropagation();select('text');text.contentEditable='true';text.focus();
    const range=document.createRange();range.selectNodeContents(text);range.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(range);
  });
  text.addEventListener('input',()=>{const label=text.querySelector('.text-preview-label');$('editText').value=(label?label.textContent:text.textContent).trim();sync()});
  text.addEventListener('blur',()=>{text.contentEditable='false';sync()});

  document.querySelectorAll('#textControls input,#textControls select,#blurControls input,#logoControls input').forEach(el=>{if(el.type!=='file'){el.addEventListener('input',sync);el.addEventListener('change',sync)}});
  const old=$('previewUpdate');if(old)old.remove();
  sync();
})();