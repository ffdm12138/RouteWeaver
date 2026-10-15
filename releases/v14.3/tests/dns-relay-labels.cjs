'use strict';
// Observational identity is the live source/destination address/port tuple.
// Reused source ports, address families and a delayed close cannot relabel a flow.
const assert=require('node:assert/strict');
const normalize=a=>String(a).replace(/^::ffff:/i,'').toLowerCase();
const key=(sa,sp,da,dp)=>JSON.stringify([normalize(sa),sp,normalize(da),dp]);
function createRegistry(){
  const labels=new Map();
  const clientKey=s=>key(s.localAddress,s.localPort,s.remoteAddress,s.remotePort);
  const serverKey=s=>key(s.remoteAddress,s.remotePort,s.localAddress,s.localPort);
  function register(socket,label){
    assert.ok(socket.localAddress&&socket.remoteAddress&&socket.localPort&&socket.remotePort,'Register only a connected relay');
    const tuple=clientKey(socket),entry={socket,label};labels.set(tuple,entry);
    socket.once('close',()=>{if(labels.get(tuple)===entry)labels.delete(tuple);});
    return tuple;
  }
  return {register,lookup:s=>labels.get(serverKey(s))?.label||'DIRECT',serverKey,clientKey,size:()=>labels.size};
}
module.exports={createRegistry};
