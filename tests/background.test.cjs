const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(initial={},options={}) {
  const data={queue:[],...initial},icons=[],badges=[];
  let listener,nativeCalls=0;
  const api={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]));},async set(x){Object.assign(data,x);}}},
    action:{async setIcon(x){icons.push(x);},async setTitle(){},async setBadgeText(x){badges.push(x.text);},async setBadgeBackgroundColor(){}},
    runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({}),
      onMessage:{addListener:f=>listener=f},onInstalled:{addListener(){}},onStartup:{addListener(){}},
      async sendNativeMessage(name,message){nativeCalls++;assert.equal(name,'com.watchledger.launcher');assert.equal(message.action,'start');return options.native();}},
    alarms:{create(){},onAlarm:{addListener(){}}}};
  const ctx=vm.createContext({chrome:api,AbortSignal,Date,fetch:async(...args)=>options.fetch?options.fetch(...args):({ok:true})});
  vm.runInContext(fs.readFileSync('extension/background.js','utf8'),ctx);
  return {data,icons,badges,get nativeCalls(){return nativeCalls;},async ready(){await vm.runInContext('chain',ctx);await new Promise(setImmediate);},
    send(type,sender={id:'test',url:'chrome-extension://test/popup.html'},extra={}){return new Promise(resolve=>{if(!listener({type,...extra},sender,resolve))resolve(undefined);});}};
}
test('authenticated success turns icon green and clears warning',async()=>{
 const h=harness({token:'paired'});await h.ready();await h.send('sync');
 assert.equal(h.data.connected,true);assert.match(h.icons.at(-1).path[32],/connected-32/);assert.equal(h.badges.at(-1),'');
});
test('offline retains queued events and uses gray icon',async()=>{
 const events=[{id:'one'}];const h=harness({token:'paired',queue:events},{fetch:async()=>{throw Error('offline');}});
 await h.ready();await h.send('sync');assert.equal(h.data.connected,false);assert.deepEqual(h.data.queue,events);assert.match(h.icons.at(-1).path[16],/disconnected/);
});
test('missing token resets stale connected state',async()=>{
 const h=harness({connected:true});await h.ready();assert.equal(h.data.connected,false);assert.match(h.data.status,/等待配对/);
});
test('start launches host, pairs and uploads pending events',async()=>{
 let online=false;const h=harness({queue:[{id:'pending'}]},{native:async()=>{online=true;return {ok:true,token:'local-token'};},fetch:async(url,request)=>{
   assert.equal(online,true);assert.equal(request.headers.Authorization,'Bearer local-token');return {ok:true};}});
 await h.ready();const result=await h.send('startService');assert.equal(result.ok,true);assert.equal(h.nativeCalls,1);assert.equal(h.data.connected,true);assert.equal(h.data.queue.length,0);assert.equal(h.data.starting,false);
});
test('already connected service does not launch a duplicate',async()=>{
 const h=harness({token:'paired'});await h.ready();assert.equal((await h.send('startService')).ok,true);assert.equal(h.nativeCalls,0);
});
test('bridge failure gives setup guidance and preserves queue',async()=>{
 const h=harness({queue:[{id:'pending'}]},{native:async()=>{throw Error('host not found');}});await h.ready();
 const result=await h.send('startService');assert.equal(result.ok,false);assert.match(h.data.launchError,/Install-Launcher.cmd/);assert.equal(h.data.queue.length,1);assert.equal(h.data.starting,false);
});
test('native failure never marks connection green',async()=>{
 const h=harness({}, {native:async()=>({ok:false,error:'port occupied'})});await h.ready();
 assert.equal((await h.send('startService')).ok,false);assert.equal(h.data.connected,false);assert.equal(h.data.launchError,'port occupied');
});
test('content scripts cannot start local programs',async()=>{
 const h=harness();await h.ready();assert.equal(await h.send('startService',{id:'test',url:'https://example.com',tab:{url:'https://example.com'}}),undefined);assert.equal(h.nativeCalls,0);
});
test('concurrent clicks share one native launch and recording continues',async()=>{
 let finish,entered;const started=new Promise(resolve=>entered=resolve);
 const h=harness({}, {native:()=>{entered();return new Promise(resolve=>finish=resolve);}});await h.ready();
 const first=h.send('startService');await started;const second=h.send('startService');
 const receipt=await h.send('segments',{tab:{url:'https://example.com'}},{events:[{id:'during-start'}]});assert.equal(receipt.ok,true);assert.equal(h.data.queue.length,1);
 finish({ok:true,token:'paired'});await Promise.all([first,second]);assert.equal(h.nativeCalls,1);assert.equal(h.data.connected,true);
});
test('unauthorized response keeps queue and returns to gray',async()=>{
 const h=harness({token:'bad',queue:[{id:'pending'}]}, {fetch:async()=>({ok:false,status:401})});await h.ready();await h.send('sync');
 assert.equal(h.data.connected,false);assert.match(h.data.status,/配对码无效/);assert.equal(h.data.queue.length,1);
});
