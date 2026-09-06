(() => {
  'use strict';
  const api=globalThis.browser||chrome;
  const tracked=new Map();
  const session=crypto.randomUUID();
  let pending=[], busy=false, enabled=false;
  const text=sel=>document.querySelector(sel)?.textContent?.trim()||'';
  function identity(media) {
    const u=new URL(location.href), host=u.hostname;
    let platform=host,title=document.title,channel='',source='页面标题（未验证节目身份）';
    // Drop tracking/auth parameters. Preserve only known content identifiers.
    const clean=new URL(u.origin+u.pathname);
    for(const k of ['v','p','bvid','aid','cid','vid','id','episode_id']) if(u.searchParams.has(k)) clean.searchParams.set(k,u.searchParams.get(k));
    if(/(^|\.)youtube\.com$/.test(host)) {
      platform='YouTube'; title=text('ytd-watch-metadata h1')||text('h1.title')||title;
      channel=text('ytd-watch-metadata ytd-channel-name'); source='YouTube 页面字段（需实站验证）';
    } else if(/(^|\.)bilibili\.com$/.test(host)) {
      platform='哔哩哔哩'; title=text('h1.video-title')||text('h1')||title;
      channel=text('.up-name'); source='哔哩哔哩页面字段（需实站验证）';
    } else if(/(^|\.)iqiyi\.com$/.test(host)) platform='爱奇艺';
    else if(/(^|\.)v\.qq\.com$/.test(host)) platform='腾讯视频';
    else if(/(^|\.)youku\.com$/.test(host)) platform='优酷';
    // SPA title/content changes reset continuity, even if the media element is reused.
    const key=clean.href+'|'+title+'|'+(media.currentSrc||'');
    return {key,url:clean.href,title:title.slice(0,1000),platform,channel:channel.slice(0,500),identitySource:source};
  }
  function snapshot(media) {
    const meta=identity(media);
    return {...meta,clock:performance.now(),time:Date.now(),pos:media.currentTime,
      rate:media.playbackRate,playing:!media.paused&&!media.ended&&media.readyState>=2,
      seeking:media.seeking,hidden:document.hidden,muted:media.muted||media.volume===0,
      ad:!!document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')};
  }
  function sample(media) {
    const state=tracked.get(media), b=snapshot(media), a=state.last;
    state.last=b;
    if(!enabled||!a) return;
    const range=LedgerCore.interval(a,b);
    if(!range) return;
    pending.push({...range,id:crypto.randomUUID(),session:session+':'+state.id,url:a.url,title:a.title,
      platform:a.platform,channel:a.channel,identitySource:a.identitySource,kind:media.tagName.toLowerCase(),
      duration:Number.isFinite(media.duration)?media.duration:0,hidden:a.hidden,muted:a.muted,
      browser:'',adStatus:a.platform==='YouTube'?'未检测到 YouTube 广告标记':'广告未验证'});
    flush();
  }
  async function flush() {
    if(busy||!pending.length) return;
    busy=true;
    const batch=pending.slice(0,100);
    try {
      const response=await api.runtime.sendMessage({type:'segments',events:batch});
      if(response?.ok) pending.splice(0,batch.length);
    } catch(_) { /* Keep unacknowledged samples until the context closes. */ }
    finally {busy=false;}
  }
  function discover(root=document) {
    for(const media of root.querySelectorAll('video,audio')) {
      if(tracked.has(media)) continue;
      tracked.set(media,{last:null,id:crypto.randomUUID()});
      for(const name of ['play','pause','seeking','seeked','ratechange','ended','waiting','playing','volumechange','emptied']) {
        media.addEventListener(name,()=>sample(media));
      }
      sample(media);
    }
    for(const el of root.querySelectorAll('*')) if(el.shadowRoot) discover(el.shadowRoot);
  }
  api.storage.local.get('enabled').then(x=>{enabled=x.enabled!==false;});
  api.storage.onChanged.addListener((changes)=>{
    if(changes.enabled) {enabled=changes.enabled.newValue!==false; for(const s of tracked.values()) s.last=null;}
  });
  discover();
  setInterval(()=>{
    discover();
    for(const media of tracked.keys()) {
      if(media.isConnected) sample(media); else tracked.delete(media);
    }
    flush();
  },4000);
  document.addEventListener('visibilitychange',()=>{for(const media of tracked.keys()) sample(media);});
  window.addEventListener('pagehide',()=>{for(const media of tracked.keys()) sample(media);flush();});
})();
