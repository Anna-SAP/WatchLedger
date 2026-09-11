import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syncOutput,syncConfiguredOutput} from '../scripts/sync-output.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'watchledger-sync-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),target=path.join(root,'installed');
  for(const dir of [source,target])for(const browser of ['neo','firefox']){
    await mkdir(path.join(dir,browser),{recursive:true});
    await writeFile(path.join(dir,browser,'manifest.json'),JSON.stringify({name:'视听档案 WatchLedger',version:dir===source?'0.1.2':'0.1.1',...(browser==='firefox'?{browser_specific_settings:{gecko:{id:'watchledger@local.personal'}}}:{})}));
  }
  await writeFile(path.join(source,'neo','popup.js'),'new popup');
  await writeFile(path.join(target,'neo','popup.js'),'old popup');
  await writeFile(path.join(source,'server.py'),'new server');
  return {root,source,target};
}

test('configured sync updates runtime and keeps user files and identity',async t=>{
 const {source,target}=await fixture(t);
 await writeFile(path.join(source,'.watchledger-local.json'),JSON.stringify({outputDirectory:target}));
 await writeFile(path.join(source,'pairing-token.txt'),'must not copy');
 await writeFile(path.join(source,'ledger.sqlite3'),'must not copy');
 await writeFile(path.join(target,'pairing-token.txt'),'keep existing token');
 await writeFile(path.join(target,'ledger.sqlite3'),'keep existing database');
 await writeFile(path.join(target,'custom.txt'),'keep existing file');
 const result=await syncConfiguredOutput(source);
 assert.equal(result.changed,4);
 assert.equal(await readFile(path.join(target,'neo/popup.js'),'utf8'),'new popup');
 assert.equal(await readFile(path.join(target,'server.py'),'utf8'),'new server');
 assert.equal(await readFile(path.join(target,'pairing-token.txt'),'utf8'),'keep existing token');
 assert.equal(await readFile(path.join(target,'ledger.sqlite3'),'utf8'),'keep existing database');
 assert.equal(await readFile(path.join(target,'custom.txt'),'utf8'),'keep existing file');
 await assert.rejects(readFile(path.join(target,'.watchledger-local.json')), {code:'ENOENT'});
 assert.equal(await readFile(path.join(result.backup,'neo/popup.js'),'utf8'),'old popup');
 const repeat=await syncConfiguredOutput(source);assert.equal(repeat.changed,0);assert.equal(repeat.backup,null);
});
test('no local configuration leaves other folders untouched',async t=>{
 const {source,target}=await fixture(t);assert.equal(await syncConfiguredOutput(source),null);
 assert.equal(await readFile(path.join(target,'neo/popup.js'),'utf8'),'old popup');
});
test('refuses unrelated installation before replacing any file',async t=>{
 const {source,target}=await fixture(t);await writeFile(path.join(target,'neo/manifest.json'),JSON.stringify({name:'Another extension'}));
 await assert.rejects(syncOutput(source,target),/not a WatchLedger/);
 assert.equal(await readFile(path.join(target,'neo/popup.js'),'utf8'),'old popup');
});
test('refuses changing extension identity',async t=>{
 const {source,target}=await fixture(t);
 const manifest=JSON.parse(await readFile(path.join(source,'neo/manifest.json'),'utf8'));manifest.key='new identity';
 await writeFile(path.join(source,'neo/manifest.json'),JSON.stringify(manifest));
 await assert.rejects(syncOutput(source,target),/identity changed/);
});
test('rejects nested targets, relative paths and Git checkouts',async t=>{
 const {source,target}=await fixture(t);
 await assert.rejects(syncOutput(source,source),/must be separate/);
 await assert.rejects(syncOutput(source,'relative'),/absolute path/);
 await mkdir(path.join(target,'.git'));
 await assert.rejects(syncOutput(source,target),/Git checkout/);
});
test('rejects destination junctions before writing outside installation',async t=>{
 const {root,source,target}=await fixture(t);
 const outside=path.join(root,'outside');await mkdir(outside);
 await writeFile(path.join(outside,'sentinel'),'untouched');
 await mkdir(path.join(source,'web'));await writeFile(path.join(source,'web','app.js'),'new app');
 await symlink(outside,path.join(target,'web'),'junction');
 await assert.rejects(syncOutput(source,target),/symlink or junction/);
 assert.equal(await readFile(path.join(outside,'sentinel'),'utf8'),'untouched');
 await assert.rejects(readFile(path.join(outside,'app.js')),{code:'ENOENT'});
});
