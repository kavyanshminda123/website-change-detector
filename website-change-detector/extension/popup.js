async function start(mode){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id || !/^https?:/.test(tab.url||'')){document.getElementById('status').textContent='Open a public HTTP(S) page first.';return;}
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['picker.js']});
    await chrome.tabs.sendMessage(tab.id,{type:'PAGEPULSE_PICK',mode});
    document.getElementById('status').textContent='Picker started. Click an element on the page.';
    window.close();
  }catch(e){document.getElementById('status').textContent='Could not start picker on this page.';}
}
document.getElementById('watch').addEventListener('click',()=>start('watch'));
document.getElementById('ignore').addEventListener('click',()=>start('ignore'));