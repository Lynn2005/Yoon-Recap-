(()=>{
  'use strict';
  const hide=()=>{
    const input=document.getElementById('voiceSpeed');
    if(!input)return;
    input.value='1';
    input.disabled=true;
    input.style.display='none';
    const label=input.previousElementSibling;
    if(label && label.tagName==='LABEL') label.style.display='none';
    const note=input.nextElementSibling;
    if(note && note.tagName==='SMALL') note.style.display='none';
    const output=document.getElementById('voiceSpeedValue');
    if(output)output.textContent='1.0x';
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide,{once:true});else hide();
  setTimeout(hide,300);
})();
