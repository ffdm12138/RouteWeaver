'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),net=require('node:net'),cp=require('node:child_process');
const {once}=require('node:events'),{createController}=require('./native-controller.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listen(server,port=0){server.listen(port,'127.0.0.1');await once(server,'listening');return server.address().port;}
async function close(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
const options={secret:'synthetic-controller-fixture',requestTimeout:150,startupTimeout:1500};

test('a delayed controller must become ready and confirm nonempty providers',async()=>{
  const reservation=net.createServer(),port=await listen(reservation);await close(reservation);
  let hits=0;
  const server=http.createServer((req,res)=>{hits++;res.end(JSON.stringify({providers:{rules:{ruleCount:hits>1?1:0}}}));});
  const controller=createController({...options,port});
  const start=setTimeout(()=>server.listen(port,'127.0.0.1'),120);
  try{
    await controller.waitUntil(async deadline=>(await controller.request('GET','/providers/rules',undefined,deadline)).providers.rules.ruleCount>0);
    assert.ok(hits>=2);assert.ok(controller.stats.startupChecks>=2);
    assert.ok(controller.stats.transportErrors.some(e=>e.code==='ECONNREFUSED'||e.code==='ETIMEDOUT'));
  }finally{clearTimeout(start);await controller.stop();await close(server);}
});
test('a silent controller fails within the whole request deadline',async()=>{
  const sockets=new Set(),server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const port=await listen(server),controller=createController({...options,port,maxRetries:0});
  const start=performance.now();
  try{await assert.rejects(controller.request('GET','/proxies'),{code:'ETIMEDOUT'});assert.ok(performance.now()-start<1200);}
  finally{await controller.stop();for(const socket of sockets)socket.destroy();await close(server);}
});
test('an idempotent request retries a reset, and reads the actual recovered response',async()=>{
  let hits=0;const server=http.createServer((req,res)=>{if(++hits===1){req.socket.destroy();return;}res.end('{"now":"AuditDead"}');});
  const port=await listen(server),controller=createController({...options,port});
  try{assert.equal((await controller.request('GET','/proxies/owned')).now,'AuditDead');assert.equal(hits,2);assert.equal(controller.stats.retries,1);}
  finally{await controller.stop();await close(server);}
});
test('exhausted transport retries still fail',async()=>{
  let hits=0;const server=http.createServer(req=>{hits++;req.socket.destroy();});
  const port=await listen(server),controller=createController({...options,port});
  try{await assert.rejects(controller.request('GET','/proxies'),{code:'ECONNRESET'});assert.equal(hits,3);}
  finally{await controller.stop();await close(server);}
});
test('non-idempotent POST is never replayed after a reset',async()=>{
  let hits=0;const server=http.createServer(req=>{hits++;req.socket.destroy();});
  const port=await listen(server),controller=createController({...options,port});
  try{await assert.rejects(controller.request('POST','/cache/dns/flush'),{code:'ECONNRESET'});assert.equal(hits,1);}
  finally{await controller.stop();await close(server);}
});
test('HTTP rejection and invalid JSON fail without transport retries',async()=>{
  let hits=0;const server=http.createServer((req,res)=>{hits++;if(req.url==='/bad'){res.statusCode=400;res.end('bad selection');}else res.end('not JSON');});
  const port=await listen(server),controller=createController({...options,port});
  try{await assert.rejects(controller.request('PUT','/bad',{name:'missing'}),{code:'HTTP_STATUS'});await assert.rejects(controller.request('GET','/json'),{code:'API_JSON'});assert.equal(hits,2);assert.equal(controller.stats.retries,0);}
  finally{await controller.stop();await close(server);}
});
test('an alive controller with empty providers never passes a nonempty readiness condition',async()=>{
  const server=http.createServer((req,res)=>res.end('{"providers":{"rules":{"ruleCount":0}}}'));
  const port=await listen(server),controller=createController({...options,port,startupTimeout:220});
  try{await assert.rejects(controller.waitUntil(async deadline=>(await controller.request('GET','/providers/rules',undefined,deadline)).providers.rules.ruleCount>0),{code:'CORE_NOT_READY'});}
  finally{await controller.stop();await close(server);}
});
test('a core that exited before readiness is a failure and cleanup returns promptly',async()=>{
  const child=cp.spawn(process.execPath,['-e','process.exit(23)'],{windowsHide:true,stdio:'ignore'});
  const controller=createController({...options,port:9,child});await once(child,'exit');
  await assert.rejects(controller.waitUntil(()=>true),{code:'CORE_EXITED'});
  const start=performance.now();await controller.stop();assert.ok(performance.now()-start<300);
});
