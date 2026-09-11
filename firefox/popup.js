'use strict';
const api=globalThis.browser||chrome;
const $=id=>document.getElementById(id);
let tokenDirty=false;
async function refresh(){
  const x=await api.storage.local.get(['token','enabled','status','queue','connected','starting','launchError']);
  if(!tokenDirty)$('token').value=x.token||'';
  $('enabled').checked=x.enabled!==false;
  $('status').textContent=x.starting?'正在启动服务并建立连接…':x.status||'正在检查本地连接…';
  $('status').classList.toggle('connected',x.connected===true&&!x.starting);
  $('queue').textContent='待同步片段：'+(x.queue||[]).length;
  $('start').disabled=x.starting===true;
  $('save').disabled=x.starting===true;
  $('start').classList.toggle('connected',x.connected===true);
  $('start-label').textContent=x.starting?'正在连接…':x.connected?'已连接 / 检查':'启动服务 / 连接';
  $('start').setAttribute('aria-busy',String(x.starting===true));
  $('message').textContent=x.launchError||'';
  $('setup').hidden=!x.launchError;
  $('extension-id').textContent=api.runtime.id;
}
function report(error){$('message').textContent=error.message;}
$('token').oninput=()=>{tokenDirty=true;};
$('start').onclick=async()=>{
  $('start').disabled=true;
  try{await api.runtime.sendMessage({type:'startService'});tokenDirty=false;await refresh();}
  catch(e){report(e);$('start').disabled=false;}
};
$('save').onclick=async()=>{
  try{await api.storage.local.set({token:$('token').value.trim(),launchError:''});tokenDirty=false;await api.runtime.sendMessage({type:'sync'});await refresh();}
  catch(e){report(e);}
};
$('enabled').onchange=async()=>{try{await api.storage.local.set({enabled:$('enabled').checked});}catch(e){report(e);}};
$('open').onclick=async()=>{try{
  const {token='',endpoint}=await api.storage.local.get(['token','endpoint']);
  const local=['http://127.0.0.1:17643','http://[::1]:17643'].includes(endpoint)?endpoint:'http://127.0.0.1:17643';
  await api.tabs.create({url:local+'/#'+encodeURIComponent(token)});
}catch(e){report(e);}};
$('clear').onclick=async()=>{if(confirm('删除此浏览器尚未同步的片段？此操作不可撤销。')){try{await api.runtime.sendMessage({type:'clearQueue'});await refresh();}catch(e){report(e);}}};
api.storage.onChanged.addListener((changes,area)=>{if(area==='local')refresh().catch(report);});
refresh().then(()=>api.runtime.sendMessage({type:'sync'})).then(refresh).catch(report);
