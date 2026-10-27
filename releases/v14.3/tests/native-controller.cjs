'use strict';
// Controller transport for owned loopback replays, never a running client.
const http=require('node:http');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transient=new Set(['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT']);
const idempotent=new Set(['GET','PUT','DELETE']);

function createController({port,secret,child,requestTimeout=1500,startupTimeout=10000,maxRetries=2}){
  const agent=new http.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1});
  const stats={requests:0,retries:0,startupChecks:0,startupMilliseconds:0,transportErrors:[]};
  let exited=false,spawnError,exitResult;
  const done=new Promise(resolve=>{
    if(!child){resolve();return;}
    child.once('error',error=>{spawnError=error;exited=true;resolve();});
    child.once('exit',(code,signal)=>{exited=true;exitResult={code,signal};resolve();});
  });
  function alive(){
    if(child&&(exited||child.exitCode!==null||child.signalCode!==null)){
      const error=new Error('Owned replay core exited: '+JSON.stringify({pid:child.pid,...exitResult,spawnError:spawnError?.message}));
      error.code='CORE_EXITED';throw error;
    }
  }
  function raw(method,resource,value,timeout){
    alive();stats.requests++;
    return new Promise((resolve,reject)=>{
      const body=value===undefined?'':JSON.stringify(value);
      let timer,settled=false;
      const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
      const req=http.request({host:'127.0.0.1',port,path:resource,method,agent,
        headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',part=>text+=part);
        response.on('error',error=>finish(error));
        response.on('aborted',()=>finish(Object.assign(new Error('Local API response aborted'),{code:'ECONNRESET'})));
        response.on('end',()=>{
          if(response.statusCode>=400){finish(Object.assign(new Error('Local API HTTP '+response.statusCode+': '+text),{code:'HTTP_STATUS'}));return;}
          try{finish(null,text?JSON.parse(text):{});}catch(error){error.code='API_JSON';finish(error);}
        });
      });
      req.on('error',error=>finish(error));
      // A wall deadline also bounds connecting, queued and stalled responses.
      timer=setTimeout(()=>req.destroy(Object.assign(new Error('Local API deadline exceeded'),{code:'ETIMEDOUT'})),timeout);
      req.end(body);
    });
  }
  async function request(method,resource,value,deadline=Infinity){
    for(let attempt=0;;attempt++){
      alive();
      const remaining=deadline-performance.now();
      if(remaining<=0)throw Object.assign(new Error(method+' '+resource+': controller deadline exceeded'),{code:'ETIMEDOUT'});
      try{return await raw(method,resource,value,Math.min(requestTimeout,remaining));}
      catch(error){
        alive();
        if(transient.has(error.code))stats.transportErrors.push({method,resource,code:error.code});
        if(attempt>=maxRetries||!idempotent.has(method)||!transient.has(error.code)||performance.now()>=deadline){
          throw Object.assign(new Error(method+' '+resource+': '+error.message,{cause:error}),{code:error.code});
        }
        stats.retries++;await sleep(Math.min(25*(attempt+1),Math.max(0,deadline-performance.now())));
      }
    }
  }
  async function waitUntil(probe,label='Core/provider readiness'){
    const start=performance.now(),deadline=start+startupTimeout;let lastError='condition not met';
    do{
      alive();stats.startupChecks++;
      try{if(await probe(deadline)){stats.startupMilliseconds=Math.ceil(performance.now()-start);return;}}
      catch(error){if(!transient.has(error.code))throw error;lastError=error.message;}
      await sleep(Math.min(50,Math.max(0,deadline-performance.now())));
    }while(performance.now()<deadline);
    stats.startupMilliseconds=Math.ceil(performance.now()-start);
    throw Object.assign(new Error(label+': '+lastError+'; '+stats.startupMilliseconds+'ms'),{code:'CORE_NOT_READY'});
  }
  async function stop(){
    agent.destroy();
    if(!child||exited||child.exitCode!==null||child.signalCode!==null)return;
    // Observe exit before kill; an already exited process must never hang cleanup.
    if(!child.kill())throw new Error('Could not stop owned replay core '+child.pid);
    let timer;
    try{await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned replay core did not exit '+child.pid)),5000);})]);}
    finally{clearTimeout(timer);}
  }
  return {request,waitUntil,stop,stats};
}
module.exports={createController};
