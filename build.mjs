import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const icons=Object.fromEntries([16,32,48,128].map(size=>[size,`icons/disconnected-${size}.png`]));
const base={manifest_version:3,name:'视听档案 WatchLedger',version:'0.1.1',description:'仅在本机记录网页视频与音频播放，汇总到本地视听档案。',permissions:['storage','unlimitedStorage','alarms','nativeMessaging'],host_permissions:['http://*/*','https://*/*'],incognito:'not_allowed',icons,action:{default_popup:'popup.html',default_icon:icons,default_title:'视听档案 · 未连接'},content_scripts:[{matches:['http://*/*','https://*/*'],js:['core.js','content.js'],all_frames:true,run_at:'document_idle'}]};
for(const target of ['neo','firefox']){
 const dest=path.join(root,target);await mkdir(dest,{recursive:true});
 const manifest=structuredClone(base);
 if(target==='neo')manifest.background={service_worker:'background.js'};
 else {manifest.background={scripts:['background.js']};manifest.browser_specific_settings={gecko:{id:'watchledger@local.personal',strict_min_version:'140.0',data_collection_permissions:{required:['none']}}};}
 await writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2));
 for(const f of ['core.js','content.js','background.js','popup.html','popup.js','popup.css'])await copyFile(path.join(root,'extension',f),path.join(dest,f));
 await mkdir(path.join(dest,'icons'),{recursive:true});
 for(const state of ['connected','disconnected'])for(const size of [16,32,48,128]){
  const file=`${state}-${size}.png`;
  await copyFile(path.join(root,'extension','icons',file),path.join(dest,'icons',file));
 }
}
console.log('Built neo/ and firefox/');
