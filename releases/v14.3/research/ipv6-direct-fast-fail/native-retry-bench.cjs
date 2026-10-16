'use strict';
// Research only: native OS error and owned loopback sockets. Never starts TUN.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const http = require('node:http'), os = require('node:os'), cp = require('node:child_process'), dgram = require('node:dgram');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const {once} = require('node:events');
const root = __dirname, home = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'native-bench');
fs.mkdirSync(home, {recursive:true});
const binaries = [
  ['upstream', path.join(root, 'bin/mihomo-v1.19.31-upstream-control.exe')],
  ['candidate', path.join(root, 'bin/mihomo-v1.19.31-rw-ipv6-retry-research.exe')]
];
const target6 = Buffer.from('20010db8000000000000000000000042', 'hex');
const loopback = Object.entries(os.networkInterfaces()).find(([, values]) => values.some(v => v.address === '127.0.0.1'))?.[0];
assert.ok(loopback);
const sockets = new Set(), servers = [], requests = [], allLogs = {};
let child, log = '', apiPort, mixedPort, secret, deny = false;
const report = {status:'RUNNING', researchOnly:true, clientChanged:false, cases:[],
  containment:{tun:false, interface:loopback, dns:false, realNodes:false, processOnlySkipSystemIPv6Check:true,
    target:'2001:db8::42 documentation prefix, dial bound to owned loopback interface',
    policy:'Minimal lab select group only. Full production rules replay recorded separately.'},
  scope:'One Windows host; OS native TCP network-unreachable. Not app IPv4 retry, public IPv6, UDP error propagation or device acceptance.'};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function track(s){sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));return s;}
function reader(s){
  let buffer=Buffer.alloc(0), queue=[], ended=false;
  const drain=()=>{while(queue.length && buffer.length>=queue[0].n){const q=queue.shift();clearTimeout(q.timer);const b=buffer.subarray(0,q.n);buffer=buffer.subarray(q.n);q.resolve(b);}};
  s.on('data', b=>{buffer=Buffer.concat([buffer,b]);drain();});
  s.on('close',()=>{ended=true;for(const q of queue){clearTimeout(q.timer);q.reject(Error('closed'));}queue=[];});
  return n=>new Promise((resolve,reject)=>{if(ended)return reject(Error('closed'));const q={n,resolve,reject};q.timer=setTimeout(()=>{queue=queue.filter(x=>x!==q);reject(Error('owned read timeout'));},10000);queue.push(q);drain();});
}
async function listen(host, handler, port=0){const server=net.createServer(s=>handler(track(s)));server.listen({host,port,ipv6Only:host==='::1'});await once(server,'listening');servers.push(server);return server;}
async function freePort(){for(let i=0;i<10;i++){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const p=server.address().port,u=dgram.createSocket('udp4');let available=false;try{await new Promise((resolve,reject)=>{u.once('error',reject);u.bind(p,'127.0.0.1',resolve);});available=true;}catch(e){if(e.code!=='EADDRINUSE')throw e;}finally{try{u.close();}catch{}await new Promise(r=>server.close(r));}if(available)return p;}throw Error('No owned TCP/UDP test port');}
function api(method, resource, body){return new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port:apiPort,path:resource,method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'}}, response=>{let b='';response.on('data',x=>b+=x);response.on('end',()=>response.statusCode>=400?reject(Error('owned API '+response.statusCode)):resolve(b?JSON.parse(b):null));});request.on('error',reject);request.setTimeout(1000,()=>request.destroy(Error('owned API timeout')));request.end(body?JSON.stringify(body):'');});}
async function stop(){if(child && child.exitCode===null){const done=once(child,'exit');child.kill();await Promise.race([done,sleep(3000)]);}child=null;}
async function start(core,label,sniffPort){
  await stop();apiPort=await freePort();mixedPort=await freePort();secret=crypto.randomBytes(16).toString('hex');log='';
  const config={'mixed-port':mixedPort,'allow-lan':false,'bind-address':'127.0.0.1',mode:'rule',ipv6:true,
    'external-controller':'127.0.0.1:'+apiPort,secret,'log-level':'debug','find-process-mode':'off',
    'interface-name':loopback,tun:{enable:false},dns:{enable:false},profile:{'store-selected':false},
    sniffer:{enable:!!sniffPort,'parse-pure-ip':true,sniff:{HTTP:{ports:sniffPort?[sniffPort]:[80],'override-destination':true}}},
    proxies:[{name:'OwnedRelay',type:'socks5',server:'127.0.0.1',port:relay.address().port,udp:false},
      {name:'OwnedViaDirect',type:'socks5',server:'2001:db8::42',port:443,udp:false,'dialer-proxy':'DIRECT'}],
    'proxy-groups':[{name:'LabPolicy',type:'select',proxies:['DIRECT','OwnedRelay','OwnedViaDirect']}],
    rules:['IP-CIDR6,2001:db8::42/128,LabPolicy,no-resolve','IP-CIDR,127.0.0.0/8,DIRECT,no-resolve','IP-CIDR6,::1/128,DIRECT,no-resolve','MATCH,OwnedRelay']};
  const file=path.join(home,label+'.json');fs.writeFileSync(file,JSON.stringify(config));
  child=cp.spawn(core,['-d',home,'-f',file],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,SKIP_SYSTEM_IPV6_CHECK:'true'}});
  child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('owned core exited');if(log.includes('Start Mixed(http+socks) server error:'))throw Error('mixed listener bind failed');try{await api('GET','/version');if(log.includes('Mixed(http+socks) proxy listening')){ready=true;break;}}catch{}await sleep(50);}
  assert.ok(ready,'owned listener readiness');await api('PUT','/proxies/LabPolicy',{name:'DIRECT'});
}
function address(host){if(host==='2001:db8::42')return Buffer.concat([Buffer.from([4]),target6]);if(host==='::1')return Buffer.concat([Buffer.from([4]),Buffer.from('00000000000000000000000000000001','hex')]);assert.equal(host,'127.0.0.1');return Buffer.from([1,127,0,0,1]);}
async function request(host,port,send=true){
  const s=track(net.createConnection(mixedPort,'127.0.0.1')),read=reader(s),start=performance.now();
  try{await once(s,'connect');s.write(Buffer.from([5,1,0]));assert.deepEqual(await read(2),Buffer.from([5,0]));const p=Buffer.alloc(2);p.writeUInt16BE(port);s.write(Buffer.concat([Buffer.from([5,1,0]),address(host),p]));const h=await read(4);assert.equal(h[1],0);if(h[3]===1)await read(4);else if(h[3]===4)await read(16);else await read((await read(1))[0]);await read(2);if(send)s.write('PING');const answer=(await read(4)).toString();return {success:true,answer,milliseconds:performance.now()-start};}
  catch(error){return {success:false,error:error.message,milliseconds:performance.now()-start};}
  finally{s.destroy();}
}
let relay;
async function main(){
  const echo4=await listen('127.0.0.1',s=>s.once('data',()=>s.end('PONG')));
  const echo6=await listen('::1',s=>s.once('data',()=>s.end('PONG')));
  const serverFirst=await listen('127.0.0.1',s=>s.end('PONG'));
  relay=await listen('127.0.0.1',s=>{const read=reader(s);(async()=>{const h=await read(2);await read(h[1]);s.write(Buffer.from([5,0]));const q=await read(4);let target;if(q[3]===4)target=(await read(16)).toString('hex');else if(q[3]===1)target=[...await read(4)].join('.');else target=(await read((await read(1))[0])).toString();const port=(await read(2)).readUInt16BE(0);requests.push({atyp:q[3],target,port,denied:deny,outerFamily:s.remoteFamily});if(deny){s.destroy();return;}s.write(Buffer.from([5,0,0,1,127,0,0,1,0,0]));assert.equal((await read(4)).toString(),'PING');s.end('PONG');})().catch(()=>s.destroy());});
  for(const [label,core] of binaries){
    const version=cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim();
    const binarySHA256=crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex');
    await start(core,label+'-retry');
    const attempts=[];
    for(let i=0;i<5;i++){const before=log.length,at=requests.length;const result=await request('2001:db8::42',443);await sleep(30);const emitted=log.slice(before);const warnings=(emitted.match(/level=warning.*dial /g)||[]).length;assert.equal(result.success,false);assert.equal(result.error,'closed');assert.equal(warnings,label==='upstream'?10:1);assert.equal(requests.length,at,'DIRECT failure must not invoke proxy');attempts.push({...result,warnings});}
    report[label]={version,binarySHA256,attempts};
    for(const [host,port] of [['127.0.0.1',echo4.address().port],['::1',echo6.address().port]]){const result=await request(host,port);assert.equal(result.answer,'PONG');report.cases.push({name:label+':reachable-'+host,...result});}
    await api('PUT','/proxies/LabPolicy',{name:'OwnedRelay'});let at=requests.length;const forwarded=await request('2001:db8::42',443);assert.equal(forwarded.answer,'PONG');assert.equal(requests.length,at+1);assert.equal(requests[at].atyp,4);assert.equal(requests[at].target,target6.toString('hex'));assert.equal(requests[at].outerFamily,'IPv4');
    report.cases.push({name:label+':explicit-proxy-keeps-IPv6-over-IPv4',...forwarded,request:requests[at]});
    deny=true;at=requests.length;const denied=await request('2001:db8::42',443);await sleep(30);assert.equal(denied.success,false);assert.equal(requests.length-at,10,'Proxy retries must remain unchanged');report.cases.push({name:label+':proxy-error-keeps-ten-attempts-no-DIRECT-fallback',...denied,attempts:requests.length-at});deny=false;
    await api('PUT','/proxies/LabPolicy',{name:'OwnedViaDirect'});at=requests.length;const beforeInner=log.length,inner=await request('2001:db8::42',443);await sleep(30);const innerLog=log.slice(beforeInner),innerWarnings=(innerLog.match(/level=warning.*dial /g)||[]).length;assert.equal(inner.success,false);assert.equal(innerWarnings,10,'Proxy transport using DIRECT must keep its retry behavior');assert.equal(requests.length,at);assert.ok(!innerLog.includes('direct IPv6 network unreachable'));report.cases.push({name:label+':proxy-transport-via-DIRECT-keeps-ten-attempts',...inner,warnings:innerWarnings});
    const noSniff=await request('127.0.0.1',serverFirst.address().port,false);assert.equal(noSniff.answer,'PONG');
    allLogs[label+'-retry']=log;await stop();
    await start(core,label+'-sniff',serverFirst.address().port);const sniff=await request('127.0.0.1',serverFirst.address().port,false);assert.equal(sniff.answer,'PONG');allLogs[label+'-sniff']=log;await stop();
    report.cases.push({name:label+':server-first-sniff-wait-control',sniffDisabled:noSniff,sniffEnabled:sniff,scope:'Constructed server-first protocol; does not identify WeChat protocol or duration.'});
    const durations=attempts.map(x=>x.milliseconds).sort((a,b)=>a-b);
    report[label]={version,binarySHA256,attempts,medianMilliseconds:durations[2]};
  }
  report.status='PASS';
}
main().catch(error=>{report.status='FAIL';report.error=error.stack;process.exitCode=1;}).finally(async()=>{await stop();for(const s of sockets)s.destroy();for(const server of servers)if(server.listening)await new Promise(resolve=>server.close(resolve));for(const [name,value]of Object.entries(allLogs))fs.writeFileSync(path.join(home,name+'.log'),value);fs.writeFileSync(path.join(home,'last-core.log'),log);report.harnessSHA256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');fs.writeFileSync(path.join(home,'proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,upstreamMedianMilliseconds:report.upstream?.medianMilliseconds,candidateMedianMilliseconds:report.candidate?.medianMilliseconds,cases:report.cases.length,error:report.error}));});
