const rate=8000,count=rate*120,buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
function str(offset,s){for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));}
str(0,'RIFF');v.setUint32(4,36+count*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,count*2,true);
for(let i=0;i<count;i++)v.setInt16(44+i*2,Math.sin(i/rate*Math.PI*440)*300,true);
const audio=document.getElementById('audio');audio.src=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));document.getElementById('speed').onclick=()=>audio.playbackRate=audio.playbackRate===1?2:1;
