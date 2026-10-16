(() => {
  if (window.__pagePulsePickerInstalled) return;
  window.__pagePulsePickerInstalled=true;
  let overlay, current, mode='watch';
  const css = el => {
    if (!el || el.nodeType!==1) return '';
    if (el.id) return '#'+CSS.escape(el.id);
    const parts=[]; let node=el;
    while(node && node.nodeType===1 && node!==document.body){
      let part=node.tagName.toLowerCase();
      if(node.classList.length){
        const cls=[...node.classList].find(c=>/^[a-zA-Z_-][\\w-]*$/.test(c));
        if(cls) part+='.'+CSS.escape(cls);
      }
      
      const parent=node.parentElement;
      if(parent){
        const siblings=[...parent.children].filter(x=>x.tagName===node.tagName);
        if(siblings.length>1) part+=`:nth-of-type(${siblings.indexOf(node)+1})`;
      }
      parts.unshift(part); node=node.parentElement;
      if(parts.length>5) break;
    }
    return parts.length?parts.join(' > '):'body';
  };
  const remove=()=>{document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);overlay?.remove();overlay=null;current=null;window.__pagePulsePickerInstalled=false;};
  const move=e=>{if(overlay?.contains(e.target))return;current=e.target;const r=current.getBoundingClientRect();overlay.style.display='block';overlay.style.top=(r.top+window.scrollY)+'px';overlay.style.left=(r.left+window.scrollX)+'px';overlay.style.width=Math.max(1,r.width)+'px';overlay.style.height=Math.max(1,r.height)+'px';};
  const click=async e=>{
    if(overlay?.contains(e.target))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const selector=css(e.target);
    try{await navigator.clipboard.writeText(selector);}catch{}
    const note=document.createElement('div');note.textContent=(mode==='watch'?'Watch selector':'Ignore selector')+': '+selector+' (copied)';
    note.style.cssText='position:fixed;z-index:2147483647;top:12px;left:12px;background:#172033;color:white;padding:12px 16px;border-radius:9px;font:13px system-ui;max-width:80vw;overflow-wrap:anywhere';
    document.documentElement.appendChild(note);setTimeout(()=>note.remove(),2600);remove();
  };
  const key=e=>{if(e.key==='Escape')remove();};
  chrome.runtime.onMessage.addListener(msg=>{if(msg?.type!=='PAGEPULSE_PICK')return;mode=msg.mode||'watch';overlay=document.createElement('div');overlay.style.cssText='position:absolute;z-index:2147483646;pointer-events:none;border:2px solid #ff704f;background:#ff704f33;display:none;box-sizing:border-box';document.documentElement.appendChild(overlay);document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);});
})();