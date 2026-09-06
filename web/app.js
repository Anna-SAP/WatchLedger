'use strict';
const $=id=>document.getElementById(id);
let events=[],token=decodeURIComponent(location.hash.slice(1))||sessionStorage.getItem('ledgerToken')||'';
history.replaceState(null,'',location.pathname);
$('token').value=token;
const now=new Date(); $('date').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
function union(ranges){let sum=0,end=-Infinity;for(const [a,b] of ranges.sort((a,b)=>a[0]-b[0])){sum+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return sum;}
const minutes=seconds=>seconds<60?Math.round(seconds)+' 秒':(seconds/60).toFixed(1)+' 分钟';
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
async function request(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('连接失败（'+r.status+'），请检查服务与配对码。');return r.json();}
async function refresh(){try{const status=await request('status');events=await request('events');$('connection').textContent='本地服务已连接';$('path').textContent='数据库：'+status.dataPath;sessionStorage.setItem('ledgerToken',token);$('notice').textContent='';render();}catch(e){$('connection').textContent='未连接';$('notice').textContent=e.message;$('setup').open=true;}}
function render(){
  const date=new Date($('date').value+'T00:00:00');const lo=$('all').checked?-Infinity:date.getTime();date.setDate(date.getDate()+1);const hi=$('all').checked?Infinity:date.getTime();
  const query=$('search').value.toLowerCase();
  const selected=events.filter(e=>e.end>lo&&e.start<hi&&[e.title,e.platform,e.channel].join(' ').toLowerCase().includes(query)).map(e=>{
    const start=Math.max(lo,e.start),end=Math.min(hi,e.end),ratio=(e.to-e.from)/(e.end-e.start);
    return {...e,start,end,from:e.from+(start-e.start)*ratio,to:e.to-(e.end-end)*ratio};
  });
  const groups=new Map(),platforms=new Map();
  for(const e of selected){const key=e.url+'|'+e.title;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);platforms.set(e.platform,(platforms.get(e.platform)||0)+(e.end-e.start)/1000);}
  const total=selected.reduce((n,e)=>n+(e.end-e.start)/1000,0);
  $('count').textContent=groups.size;$('total').textContent=minutes(total);$('unique').textContent=minutes(union(selected.map(e=>[e.start,e.end]))/1000);$('background').textContent=minutes(selected.filter(e=>e.hidden).reduce((n,e)=>n+(e.end-e.start)/1000,0));
  $('records').replaceChildren();
  if(!groups.size)$('records').append(el('div','empty','尚无播放记录。安装并配对扩展后，播放节目，约 30 秒后刷新。'));
  for(const list of groups.values()){
    const e=list[0],row=el('div','record'),time=el('div','time',new Date(e.start).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}));
    const info=el('div'),a=el('a','title',e.title||'未识别标题');a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';info.append(a);
    info.append(el('div','meta',[e.platform,e.channel||'作者未知',e.kind==='audio'?'音频':'视频',...new Set(list.map(x=>x.browser))].join(' · ')));
    info.append(el('div','meta',e.identitySource+'；'+e.adStatus));
    const seconds=list.reduce((n,x)=>n+(x.end-x.start)/1000,0),cover=union(list.map(x=>[x.from,x.to]));
    const metric=el('div','metric',minutes(seconds));const percentage=e.duration>0?Math.min(100,cover/e.duration*100):null;
    metric.append(el('div','meta',percentage===null?'节目时长未知':'本期覆盖 '+percentage.toFixed(1)+'%'));
    const bar=el('div','bar'),fill=el('i');fill.style.width=(percentage||0)+'%';bar.append(fill);metric.append(bar);
    row.append(time,info,metric);$('records').append(row);
  }
  $('platforms').replaceChildren();
  for(const [name,seconds] of [...platforms].sort((a,b)=>b[1]-a[1])){const row=el('div','platform'),bar=el('div','bar'),fill=el('i');fill.style.width=(seconds/total*100)+'%';bar.append(fill);row.append(el('span','',name),bar,el('span','',minutes(seconds)));$('platforms').append(row);}
  $('updated').textContent='最近刷新 '+new Date().toLocaleTimeString('zh-CN');
}
$('connect').onclick=()=>{token=$('token').value.trim();refresh();};$('refresh').onclick=refresh;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(token);$('notice').textContent='配对码已复制，请粘贴到扩展弹窗。';}catch(_){$('token').type='text';$('token').select();$('notice').textContent='请按 Ctrl+C 复制配对码。';}};
for(const id of ['date','search','all'])$(id).addEventListener('input',render);
$('export').onclick=async()=>{try{const data=await request('events'),url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),events:data},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='watchledger-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('notice').textContent=e.message;}};
$('delete').onclick=async()=>{if(!confirm('已关闭两个扩展的记录并清空待同步队列？确认永久删除数据库中的全部记录？'))return;try{await request('delete',{confirm:'DELETE ALL'});await refresh();}catch(e){$('notice').textContent=e.message;}};
refresh();setInterval(refresh,30000);
