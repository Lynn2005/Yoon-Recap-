FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-noto-core fonts-noto-extra fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

# Gemini model compatibility patch.
RUN python3 - <<'PY'
from pathlib import Path
p=Path('server.js')
s=p.read_text()
start=s.find('const GEMINI_MODELS=')
if start < 0:
    raise SystemExit('GEMINI_MODELS declaration not found')
end=s.find(';', start)
if end < 0:
    raise SystemExit('GEMINI_MODELS declaration end not found')
s=s[:start]+'const GEMINI_MODELS=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"]'+s[end:]
s=s.replace('generationConfig:{temperature:.2}','generationConfig:{}')
p.write_text(s)
PY

# Add mobile touch resize handles for Blur and Logo after the existing Live Edit script.
RUN cat >> public/live-editor.js <<'JS'

/* Mobile touch resize patch: Blur + Logo */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const editor=$('editorPreview');
  const blur=$('blurLayer');
  const logo=$('logoPreview');
  if(!editor||!blur||!logo)return;

  const style=document.createElement('style');
  style.textContent=`
    #editorPreview .touch-resize-handle{
      position:absolute!important;right:-10px!important;bottom:-10px!important;
      width:22px!important;height:22px!important;border-radius:50%!important;
      background:#7c5cff!important;border:3px solid #fff!important;
      box-sizing:border-box!important;z-index:1000!important;
      touch-action:none!important;cursor:nwse-resize!important;pointer-events:auto!important;
    }
  `;
  document.head.appendChild(style);

  function addHandle(el,type){
    if(el.querySelector('.touch-resize-handle'))return el.querySelector('.touch-resize-handle');
    const h=document.createElement('span');
    h.className='touch-resize-handle';
    h.dataset.resizeType=type;
    el.appendChild(h);
    return h;
  }

  const blurHandle=addHandle(blur,'blur');
  const logoHandle=addHandle(logo,'logo');
  let state=null;

  function setVal(id,v){const x=$(id);if(x)x.value=String(v)}
  function getVal(id,d){const x=$(id);return x?Number(x.value):d}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function rerender(){if(typeof window.update==='function')window.update()}

  function start(type,e){
    if(e.button!==undefined&&e.button!==0)return;
    const r=editor.getBoundingClientRect();
    state={type,id:e.pointerId,sx:e.clientX,sy:e.clientY,w:r.width,h:r.height,
      bw:getVal('blurW',90),bh:getVal('blurH',22),size:getVal('logoSize',72),handle:e.currentTarget};
    e.preventDefault();e.stopPropagation();
    try{state.handle.setPointerCapture(e.pointerId)}catch{}
  }
  function move(e){
    if(!state||e.pointerId!==state.id)return;
    e.preventDefault();
    const dx=(e.clientX-state.sx)/Math.max(1,state.w)*100;
    const dy=(e.clientY-state.sy)/Math.max(1,state.h)*100;
    if(state.type==='blur'){
      setVal('blurW',clamp(state.bw+dx,10,100));
      setVal('blurH',clamp(state.bh+dy,5,80));
    }else{
      const delta=(dx+dy)/2;
      setVal('logoSize',clamp(state.size+delta,30,500));
    }
    rerender();
  }
  function end(e){
    if(!state)return;
    if(e.pointerId!==undefined&&e.pointerId!==state.id)return;
    try{state.handle.releasePointerCapture(state.id)}catch{}
    state=null;
    rerender();
  }

  [blurHandle,logoHandle].forEach(h=>{
    h.addEventListener('pointerdown',e=>start(h.dataset.resizeType,e),{passive:false});
    h.addEventListener('pointermove',move,{passive:false});
    h.addEventListener('pointerup',end,{passive:false});
    h.addEventListener('pointercancel',end,{passive:false});
  });
})();
JS

RUN mkdir -p uploads work
EXPOSE 10000
CMD ["node", "server.js"]
