import {mkdir,readFile,readdir,writeFile,copyFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Deliberately exclude browser profiles, databases, work/, dist/, local config,
// and arbitrary repository files from the installed application.
const directories=['extension','neo','firefox','web','scripts','tests'];
const topLevel=['Start.cmd','Start.ps1','Enable-Autostart.cmd','Enable-Autostart.ps1',
  'Install-Launcher.cmd','Install-Launcher.ps1','server.py','build.mjs','README.md','OPERATIONS.md','preview.png'];
const extensions=new Set(['.js','.mjs','.cjs','.json','.html','.css','.png','.svg','.py','.ps1','.cmd']);
const excluded=new Set(['__pycache__','node_modules','work','dist','.git']);

function contains(parent,child){const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
async function stat(file){try{return await lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function requirePlainPath(root,relative){
  let current=root;
  for(const part of relative.split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    const info=await stat(current);
    if(info?.isSymbolicLink())throw Error('Refusing a symlink or junction: '+current);
  }
}
async function collect(root){
  const files=[];
  async function walk(relative){
    await requirePlainPath(root,relative);
    for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
      if(excluded.has(entry.name)||entry.name.startsWith('.'))continue;
      const name=path.join(relative,entry.name);
      if(entry.isSymbolicLink())throw Error('Refusing source symlink: '+name);
      if(entry.isDirectory())await walk(name);
      else if(entry.isFile()&&extensions.has(path.extname(name)))files.push(name);
    }
  }
  for(const name of topLevel)if(await stat(path.join(root,name)))files.push(name);
  for(const name of directories)if(await stat(path.join(root,name)))await walk(name);
  return files.sort();
}

export async function syncOutput(source,destination){
  source=await realpath(source);
  if(!path.isAbsolute(destination))throw Error('outputDirectory must be an absolute path');
  await requirePlainPath(path.parse(destination).root,path.relative(path.parse(destination).root,destination));
  const target=await realpath(destination);
  if(contains(source,target)||contains(target,source))throw Error('Source and output directories must be separate');
  if(await stat(path.join(target,'.git')))throw Error('Output must be an installed copy, not a Git checkout');
  // This workflow updates an existing installation, never guesses a destination.
  for(const browser of ['neo','firefox']){
    await requirePlainPath(target,path.join(browser,'manifest.json'));
    const installed=JSON.parse(await readFile(path.join(target,browser,'manifest.json'),'utf8'));
    if(installed.name!=='视听档案 WatchLedger')throw Error('Destination is not a WatchLedger installation');
    const built=JSON.parse(await readFile(path.join(source,browser,'manifest.json'),'utf8'));
    if(installed.key!==built.key||installed.browser_specific_settings?.gecko?.id!==built.browser_specific_settings?.gecko?.id)
      throw Error('Extension identity changed; refusing to replace the installed extension');
  }
  const files=await collect(source),changes=[];
  for(const name of files){
    await requirePlainPath(source,name);
    await requirePlainPath(target,name);
    const data=await readFile(path.join(source,name));
    const current=await stat(path.join(target,name));
    if(current&&!current.isFile())throw Error('Destination file is not a regular file: '+name);
    if(!current||!data.equals(await readFile(path.join(target,name))))changes.push({name,data,exists:!!current});
  }
  // Back up every replaced application file before the first write. No deletion
  // or mirroring is used, so user data and files outside the allowlist stay put.
  const backup=path.join(source,'work','output-sync-backups',new Date().toISOString().replaceAll(':','-')+'-'+process.pid);
  if(changes.length){
    await requirePlainPath(source,path.relative(source,backup));
    await mkdir(backup,{recursive:true});
    await writeFile(path.join(backup,'sync.json'),JSON.stringify({target,files:changes.map(({name,exists})=>({name,replaced:exists}))},null,2));
    for(const {name,exists} of changes)if(exists){
      await mkdir(path.dirname(path.join(backup,name)),{recursive:true});
      await copyFile(path.join(target,name),path.join(backup,name));
    }
    for(const {name,data} of changes){
      await mkdir(path.dirname(path.join(target,name)),{recursive:true});
      await writeFile(path.join(target,name),data);
    }
  }
  for(const name of files){
    if(!(await readFile(path.join(source,name))).equals(await readFile(path.join(target,name))))throw Error('Output verification failed: '+name);
  }
  return {target,changed:changes.length,verified:files.length,backup:changes.length?backup:null};
}

export async function syncConfiguredOutput(root){
  const config=path.join(root,'.watchledger-local.json');
  if(!await stat(config)){console.log('No local output configured; build only.');return null;}
  const {outputDirectory}=JSON.parse(await readFile(config,'utf8'));
  if(typeof outputDirectory!=='string'||!outputDirectory.trim())throw Error('Missing outputDirectory in '+config);
  const result=await syncOutput(root,outputDirectory);
  console.log(`Synced ${result.changed} file(s), verified ${result.verified}: ${result.target}`);
  if(result.backup)console.log('Previous application files: '+result.backup);
  console.log('Reload the existing browser extension to activate the update; do not uninstall it.');
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await syncConfiguredOutput(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
}
