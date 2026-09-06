(function(root) {
  'use strict';
  function interval(a,b) {
    const wall = (b.clock-a.clock)/1000, delta = b.pos-a.pos;
    if (!a.playing || a.seeking || b.seeking || a.key!==b.key || a.ad || b.ad ||
        wall<=0 || wall>15 || delta<=0 || delta>wall*a.rate+0.8 || delta<wall*a.rate*0.5) return null;
    const seconds=Math.min(wall,delta/a.rate);
    return {start:b.time-seconds*1000,end:b.time,from:a.pos,to:b.pos,rate:a.rate};
  }
  function union(ranges) {
    const sorted=ranges.map(x=>[...x]).sort((a,b)=>a[0]-b[0]);
    const out=[];
    for(const [a,b] of sorted) {
      const tail=out[out.length-1];
      if(tail && a<=tail[1]) tail[1]=Math.max(tail[1],b); else out.push([a,b]);
    }
    return out.reduce((n,[a,b])=>n+b-a,0);
  }
  root.LedgerCore={interval,union};
  if(typeof module!=='undefined') module.exports=root.LedgerCore;
})(globalThis);
