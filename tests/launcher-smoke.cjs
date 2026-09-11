// Requires Install-Launcher.cmd to have been run for this checkout.
// Starts the real local service and leaves it available for the user. No events
// are recorded or removed; all browser storage uses an isolated test profile.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'work','launcher-smoke-'+Date.now());
fs.mkdirSync(output,{recursive:true});
let context;
(async()=>{
 context=await chromium.launchPersistentContext(path.join(output,'profile'),{
  executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  args:['--disable-extensions-except='+path.join(root,'neo'),'--load-extension='+path.join(root,'neo')]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host;
 if(process.env.PREFERRED_ENDPOINT)await worker.evaluate(endpoint=>chrome.storage.local.set({endpoint}),process.env.PREFERRED_ENDPOINT);
 await worker.evaluate(()=>{
  const setIcon=chrome.action.setIcon.bind(chrome.action);
  chrome.action.setIcon=async options=>{globalThis.testLastIcon=options.path;return setIcon(options);};
 });
 const popup=await context.newPage();await popup.setViewportSize({width:370,height:630});
 const errors=[];popup.on('pageerror',e=>errors.push(e.message));
 await popup.goto('chrome-extension://'+extensionId+'/popup.html');
 await popup.locator('#status').filter({hasText:'等待配对'}).waitFor();
 await popup.screenshot({path:path.join(output,'disconnected.png')});
 await popup.locator('#start').click();
 await popup.waitForFunction(()=>document.querySelector('#status').textContent==='已连接本机'||document.querySelector('#message').textContent.length>0,{},{timeout:35000});
 assert.equal(await popup.locator('#message').textContent(),'');
 assert.equal(await popup.locator('#status').textContent(),'已连接本机');
 assert.equal(await worker.evaluate(()=>globalThis.testLastIcon[32]),'icons/connected-32.png');
 assert.equal(await worker.evaluate(()=>chrome.action.getBadgeText({})),'');
 const paired=await worker.evaluate(async()=>{const d=await chrome.storage.local.get(['token','queue','connected']);return Boolean(d.token)&&d.connected&&!(d.queue||[]).length;});
 assert.equal(paired,true);
 const endpoint=await worker.evaluate(async()=>(await chrome.storage.local.get('endpoint')).endpoint);
 if(process.env.EXPECT_ENDPOINT)assert.equal(endpoint,process.env.EXPECT_ENDPOINT);
 await popup.screenshot({path:path.join(output,'connected.png')});
 const dashboardPromise=context.waitForEvent('page');
 await popup.locator('#open').click();const dashboard=await dashboardPromise;
 await dashboard.waitForURL(endpoint+'/**');
 await dashboard.locator('#connection').filter({hasText:'本地服务已连接'}).waitFor();
 await dashboard.close();
 // A reopened popup must recheck the real service; manual drafts survive updates.
 await popup.reload();await popup.locator('#status').filter({hasText:'已连接本机'}).waitFor();
 await popup.locator('#token').fill('unsaved-test-draft');
 await worker.evaluate(()=>chrome.storage.local.set({enabled:false}));
 assert.equal(await popup.locator('#token').inputValue(),'unsaved-test-draft');
 // Failed authentication must revert the green icon without deleting data.
 await popup.locator('#save').click();
 await popup.locator('#status').filter({hasText:'配对码无效'}).waitFor();
 assert.equal(await worker.evaluate(()=>globalThis.testLastIcon[32]),'icons/disconnected-32.png');
 await popup.locator('#start').click();await popup.locator('#status').filter({hasText:'已连接本机'}).waitFor();
 assert.equal(errors.length,0);
 await context.close();context=null;
 await new Promise(resolve=>setTimeout(resolve,1000));
 assert.equal((await fetch('http://127.0.0.1:17643/')).ok,true,'service must survive closing the browser');
 console.log(JSON.stringify({ok:true,extensionId,endpoint,output,checks:['real native host launch','automatic pairing','green connected icon','gray failed-auth icon','dashboard via connected loopback address','popup reopen','unsaved pairing draft preserved','reconnect existing service','service survives browser exit','no page errors']},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
