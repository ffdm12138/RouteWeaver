'use strict';
// All endpoints and DNS replies remain at loopback. Reproduce an inherited
// inbound bypass of a REJECT sentinel; verify ordinary inbounds use main rules.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http'),dgram=require('node:dgram'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {once}=require('node:events'),f=require('./fixture.cjs');
const core=process.argv[2];assert.ok(core&&fs.existsSync(core),'Provide Mihomo executable');
const report={version:'14.3',revision:'thunder-repair-r3',status:'RUNNING',scope:'Owned loopback core; pre-R3 inbound bypass and post-R3 ordinary inbound rules; TUN/mobile NOT_RUN',coreSHA256:f.sha(core),platforms:[]};
const home=f.newExperiment('native-inbound'),connections=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let child,markerHits=0;const track=s=>{connections.add(s);s.on('error',()=>{});s.on('close',()=>connections.delete(s));};
const marker=http.createServer((req,res)=>{if(req.url==='/r3-marker')markerHits++;res.end('owned-loopback-marker');});marker.on('connection',track);
const resolver=dgram.createSocket('udp4');resolver.on('message',(b,peer)=>{let at=12;while(b[at])at+=b[at]+1;at+=5;const h=Buffer.from(b.subarray(0,12));h.writeUInt16BE(0x8180,2);h.writeUInt16BE(1,6);h.writeUInt16BE(0,8);h.writeUInt16BE(0,10);const a=Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,0,0,4,127,0,0,1]);resolver.send(Buffer.concat([h,b.subarray(12,at),a]),peer.port,peer.address);});
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function probe(inbound,receiver){return await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:inbound,path:'http://v14-runtime-check.invalid:'+receiver+'/r3-marker',headers:{Host:'v14-runtime-check.invalid:'+receiver}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body}));});req.setTimeout(2500,()=>req.destroy(Error('request timeout')));req.on('error',e=>resolve({error:e.code||e.message}));req.end();});}
async function ready(inbound){let lastError;for(let i=0;i<80;i++){const ok=await new Promise(r=>{const s=net.connect(inbound,'127.0.0.1');s.on('connect',()=>{s.destroy();r(true);});s.on('error',e=>{lastError=e.code;r(false);});s.setTimeout(100,()=>{s.destroy();r(false);});});if(ok)return;await sleep(40);}throw Error('Owned inbound not reachable: '+lastError);}
async function providersReady(controller,config){const names=Object.entries(config['rule-providers']).filter(([,p])=>p.type!=='inline').map(([name])=>name);for(let i=0;i<100;i++){try{const state=await new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:controller,path:'/providers/rules'},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(1000,()=>req.destroy(Error('Owned controller timeout')));});if(names.every(name=>state.providers?.[name]?.ruleCount>0))return {nonemptyFileProviders:names.length};}catch{}await sleep(40);}throw Error('Owned rule providers not ready');}
async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}child=undefined;}
function installHistoricalProviders(config){
  const lock=require('./historical-sources.cjs')();
  for(const [name,p]of Object.entries(config['rule-providers']))if(p.type!=='inline'){
    const source=lock.sources.find(s=>s.id===name&&s.url===p.url);assert.ok(source,'Unbound historical core provider '+name);
    assert.equal(f.sha(f.local(source.file)),source.sha256);const target=path.resolve(home,p.path);assert.ok(target.startsWith(home+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f.local(source.file),target);
  }
}
async function main(){
  report.coreVersion=cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim();
  marker.listen(0,'127.0.0.1');await once(marker,'listening');resolver.bind(0,'127.0.0.1');await once(resolver,'listening');
  const receiver=marker.address().port,dnsPort=resolver.address().port;
  for(const platform of ['desktop','android']){
    const observations=[];
    for(const stage of ['before-fixed-direct','after-main-rules']){
      const inbound=await port(),input={proxies:[{name:'Audit node',type:'socks5',server:'127.0.0.1',port:await port(),udp:true}],tun:{enable:false,'auto-route':false},listeners:[{name:'Audit inbound',type:'http',listen:'127.0.0.1',port:inbound,...(stage==='before-fixed-direct'?{proxy:'DIRECT'}:{})}]};
      const config=stage==='before-fixed-direct'?f.generate(platform,{...input,listeners:input.listeners.map(({proxy,...listener})=>listener)}):f.generate(platform,input);
      if(stage==='before-fixed-direct')config.listeners[0].proxy='DIRECT'; // Controlled negative injection, never a deployed config.
      if(stage==='before-fixed-direct')assert.throws(()=>f.generate(platform,input),/自定义入站会绕过主规则/);
      // Execution-only: a foreign client's generated TUN must never start on this host.
      config.tun={...config.tun,enable:false,'auto-route':false};
      const originalRules=config.rules.slice();assert.equal(originalRules[0],'DOMAIN,v14-runtime-check.invalid,REJECT');
      const controller=await port();config['mixed-port']=0;config['external-controller']='127.0.0.1:'+controller;config['allow-lan']=false;config['log-level']='debug';config.profile={'store-selected':false,'store-fake-ip':false};
      config.hosts={'v14-runtime-check.invalid':'127.0.0.1'};config.dns={enable:true,listen:'127.0.0.1:'+await port(),ipv6:false,'enhanced-mode':'redir-host','use-hosts':true,'use-system-hosts':false,'default-nameserver':['127.0.0.1:'+dnsPort],nameserver:['127.0.0.1:'+dnsPort],'direct-nameserver':['127.0.0.1:'+dnsPort],'proxy-server-nameserver':['127.0.0.1:'+dnsPort]};
      config['proxy-providers']={};for(const group of config['proxy-groups'])if(group.url)group.url='http://127.0.0.1:'+receiver+'/health';
      f.installReviewedProviders(config,home);for(const provider of Object.values(config['rule-providers']))if(provider.type!=='inline'){provider.type='file';delete provider.url;delete provider.proxy;delete provider.interval;}
      const name=platform+'-'+stage,file=path.join(home,name+'.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
      cp.execFileSync(core,['-t','-d',home,'-f',file],{windowsHide:true,stdio:'pipe'});
      let logs='';child=cp.spawn(core,['-d',home,'-f',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
      try{await ready(inbound);const providerReadiness=await providersReady(controller,config);const start=markerHits,result=await probe(inbound,receiver);await sleep(100);const hits=markerHits-start;
        if(stage==='before-fixed-direct'){assert.equal(result.status,200,JSON.stringify(result));assert.equal(hits,1,'Original listener no longer reproduces bypass');}
        else{assert.equal(hits,0,'Ordinary inbound bypassed main REJECT');assert.notEqual(result.status,200,JSON.stringify(result));}
        observations.push({stage,providerReadiness,mainRule:originalRules[0],result,markerHits:hits,generationGuard:stage==='before-fixed-direct'?'REJECTED':'ORDINARY_LISTENER_PRESERVED'});
      }finally{await stop();fs.writeFileSync(path.join(home,name+'.log'),logs);}
    }
    report.platforms.push({platform,cases:observations.length,observations});
  }
  report.status='CORE_INBOUND_GUARD_PASS';
}
main().catch(e=>{report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await stop();for(const s of connections)s.destroy();await new Promise(r=>marker.close(r));resolver.close();report.home=f.captureExperiment(home,'native-inbound-guard');report.sourceFiles=['src/windows/v14.3.js','src/android/v14.3-android.js','tests/native-inbound-guard.cjs','tests/fixture.cjs','data/rule-sources.lock.json'].map(file=>({file,sha256:f.sha(f.local(file))}));fs.writeFileSync(f.local('validation/native-inbound-guard.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,platforms:report.platforms,error:report.error}));});
