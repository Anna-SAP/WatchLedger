'use strict';
const api=globalThis.browser||chrome;
const ENDPOINT='http://127.0.0.1:17643';
let chain=Promise.resolve();
function serial(fn) {
  const next=chain.then(fn,fn);
  chain=next.catch(()=>{});
  return next;
}
async function receive(message,sender) {
  if(sender.tab?.incognito) return {ok:true};
  const data=await api.storage.local.get(['queue','enabled']);
  if(data.enabled===false) return {ok:true};
  if(!Array.isArray(message.events)||message.events.length>100) throw Error('invalid batch');
  const queue=data.queue||[], ids=new Set(queue.map(x=>x.id));
  for(const e of message.events) if(!ids.has(e.id)) {
    queue.push({...e,browser:api.runtime.getManifest().browser_specific_settings?.gecko?'Firefox':'Neo / Chromium'}); ids.add(e.id);
  }
  await api.storage.local.set({queue});
  return {ok:true};
}
async function sync() {
  const {queue=[],token=''}=await api.storage.local.get(['queue','token']);
  if(!token) {await api.storage.local.set({status:'等待配对'});return;}
  try {
    const response=await fetch(ENDPOINT+(queue.length?'/api/events':'/api/status'),{
      method:queue.length?'POST':'GET',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      ...(queue.length?{body:JSON.stringify(queue.slice(0,500))}:{}),signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw Error('HTTP '+response.status);
    await api.storage.local.set({queue:queue.slice(500),status:'已连接本机',lastSync:Date.now()});
    await api.action.setBadgeText({text:''});
  } catch(e) {
    await api.storage.local.set({status:'本地服务未连接：'+e.message});
    await api.action.setBadgeText({text:'!'});
    await api.action.setBadgeBackgroundColor({color:'#b45309'});
  }
}
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='segments') {
    serial(()=>receive(message,sender)).then(reply,e=>reply({ok:false,error:e.message}));
    return true;
  }
  if(message.type==='sync') {
    serial(sync).then(()=>reply({ok:true}),e=>reply({ok:false,error:e.message}));return true;
  }
  if(message.type==='clearQueue'&&!sender.tab?.url?.startsWith('http')) {
    serial(()=>api.storage.local.set({queue:[]})).then(()=>reply({ok:true}));return true;
  }
});
api.alarms.onAlarm.addListener(()=>serial(sync));
api.runtime.onInstalled.addListener(()=>api.alarms.create('sync',{periodInMinutes:0.5}));
api.runtime.onStartup.addListener(()=>{api.alarms.create('sync',{periodInMinutes:0.5});serial(sync);});
api.alarms.create('sync',{periodInMinutes:0.5});
