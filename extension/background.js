'use strict';
const api=globalThis.browser||chrome;
const ENDPOINT='http://127.0.0.1:17643';
let chain=Promise.resolve();
let starting=null;
async function connectionState(connected,status) {
  await api.storage.local.set({connected,status});
  const state=connected?'connected':'disconnected';
  await api.action.setIcon({path:{16:`icons/${state}-16.png`,32:`icons/${state}-32.png`}});
  await api.action.setTitle({title:'视听档案 · '+status});
  await api.action.setBadgeText({text:connected?'':'!'});
  if(!connected) await api.action.setBadgeBackgroundColor({color:'#b45309'});
}
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
  if(!token) {await connectionState(false,'等待配对，点击右上角启动服务 / 连接');return {ok:false};}
  try {
    const response=await fetch(ENDPOINT+(queue.length?'/api/events':'/api/status'),{
      method:queue.length?'POST':'GET',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      ...(queue.length?{body:JSON.stringify(queue.slice(0,500))}:{}),signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw Error('HTTP '+response.status);
    await api.storage.local.set({queue:queue.slice(500),lastSync:Date.now()});
    await connectionState(true,'已连接本机');
    return {ok:true};
  } catch(e) {
    await connectionState(false,e.message==='HTTP 401'?'配对码无效，请点击启动服务 / 连接重新配对':'本地服务未连接：'+e.message);
    return {ok:false,error:e.message};
  }
}
async function startService() {
  if(starting) return starting;
  starting=(async()=>{
    await api.storage.local.set({starting:true,launchError:''});
    try {
      // Keep native startup outside the queue lock so playback keeps being saved.
      if((await serial(sync)).ok) return {ok:true};
      let result;
      try {result=await api.runtime.sendNativeMessage('com.watchledger.launcher',{action:'start'});}
      catch(e) {throw Error('本地启动桥接不可用。请先双击项目目录中的 Install-Launcher.cmd 安装一次，然后重试。浏览器详情：'+e.message);}
      if(!result?.ok) throw Error(result?.error||'本地服务启动失败');
      if(typeof result.token!=='string'||!result.token.trim()) throw Error('启动桥接未返回有效配对码');
      await api.storage.local.set({token:result.token});
      const connected=await serial(sync);
      if(!connected.ok) throw Error('服务已启动，但连接尚未完成。请检查连接状态后重试。');
      return {ok:true};
    } catch(e) {
      await api.storage.local.set({launchError:e.message});
      return {ok:false,error:e.message};
    } finally {
      await api.storage.local.set({starting:false});
    }
  })();
  try {return await starting;} finally {starting=null;}
}
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='segments') {
    serial(()=>receive(message,sender)).then(reply,e=>reply({ok:false,error:e.message}));
    return true;
  }
  if(message.type==='sync') {
    serial(sync).then(reply,e=>reply({ok:false,error:e.message}));return true;
  }
  const fromPopup=sender.id===api.runtime.id&&sender.url===api.runtime.getURL('popup.html');
  if(message.type==='startService'&&fromPopup) {
    startService().then(reply,e=>reply({ok:false,error:e.message}));return true;
  }
  if(message.type==='clearQueue'&&!sender.tab?.url?.startsWith('http')) {
    serial(()=>api.storage.local.set({queue:[]})).then(()=>reply({ok:true}));return true;
  }
});
api.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='sync')serial(sync);});
api.runtime.onInstalled.addListener(()=>{api.alarms.create('sync',{periodInMinutes:0.5});serial(sync);});
api.runtime.onStartup.addListener(()=>{api.alarms.create('sync',{periodInMinutes:0.5});serial(sync);});
api.alarms.create('sync',{periodInMinutes:0.5});
// Recheck after a service-worker restart; never restore a stale green icon.
api.storage.local.set({starting:false}).then(()=>serial(sync));
