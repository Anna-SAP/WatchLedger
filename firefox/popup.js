const api=globalThis.browser||chrome;
const $=id=>document.getElementById(id);
async function refresh(){const x=await api.storage.local.get(['token','enabled','status','queue']);$('token').value=x.token||'';$('enabled').checked=x.enabled!==false;$('status').textContent=x.status||'等待配对';$('queue').textContent='待同步片段：'+(x.queue||[]).length;}
$('save').onclick=async()=>{await api.storage.local.set({token:$('token').value.trim()});await api.runtime.sendMessage({type:'sync'});await refresh();};
$('enabled').onchange=async()=>{await api.storage.local.set({enabled:$('enabled').checked});};
$('open').onclick=async()=>{const {token=''}=await api.storage.local.get('token');api.tabs.create({url:'http://127.0.0.1:17643/#'+encodeURIComponent(token)});};
$('clear').onclick=async()=>{if(confirm('删除此浏览器尚未同步的片段？此操作不可撤销。')){await api.runtime.sendMessage({type:'clearQueue'});await refresh();}};
refresh().catch(e=>$('message').textContent=e.message);
