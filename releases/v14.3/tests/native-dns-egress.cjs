"use strict";
// All transports in this experiment terminate at loopback. Runtime-only DoH
// certificates and redir-host mode expose the real resolver egress for A/AAAA.
// Production DNS URLs, certificate checks, TUN, and the active client are untouched.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),dgram=require('node:dgram');
const http=require('node:http'),https=require('node:https'),tlsModule=require('node:tls'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {once}=require('node:events'),{root,local,sha,load,installReviewedProviders,newExperiment,captureExperiment}=require('./fixture.cjs');
const {cloudTenants,exactMicrosoft}=require('./cases.cjs');
const core=process.argv[2],openssl=process.argv[3];assert.ok(core&&fs.existsSync(core),'Provide Mihomo');assert.ok(openssl&&fs.existsSync(openssl),'Provide OpenSSL');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),home=newExperiment('native-dns');
const report={version:'14.3',date:'2026-10-10',status:'RUNNING',scope:'Real-core A/AAAA DNS egress, IPv4/IPv6 node dialing, and explicit DIRECT on loopback; no native mobile/TUN acceptance',coreSHA256:sha(core),platforms:[]};
const relayLabels=require('./dns-relay-labels.cjs').createRegistry();
const sockets=new Set(),observed=[],ownedServers=[];let child,keepAlive=false;
const track=s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{});return s;};
async function ipv6Preflight(){const server=net.createServer(s=>s.end());let socket;try{server.listen(0,'::1');await once(server,'listening');socket=net.connect(server.address().port,'::1');await once(socket,'connect');return {status:'PASS'};}catch(e){return {status:'NOT_RUN_ENVIRONMENT',code:e.code,message:e.message};}finally{if(socket)socket.destroy();await new Promise(r=>server.close(r));}}
async function listen(server,host,port=0){ownedServers.push(server);server.listen(port,host);await once(server,'listening');return server.address().port;}
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function reader(s){let b=Buffer.alloc(0),wait=[];s.on('data',x=>{b=Buffer.concat([b,x]);drain();});function drain(){while(wait.length&&b.length>=wait[0].n){const q=wait.shift();clearTimeout(q.timer);const value=b.subarray(0,q.n);b=b.subarray(q.n);q.resolve(value);}}return n=>new Promise((resolve,reject)=>{wait.push({n,resolve,timer:setTimeout(()=>reject(Error('SOCKS read timeout')),3000)});drain();});}
const portBytes=p=>{const b=Buffer.alloc(2);b.writeUInt16BE(p);return b;};
function question(b){let i=12,labels=[];while(b[i]){const n=b[i++];labels.push(b.subarray(i,i+n).toString());i+=n;}i++;return {host:labels.join('.'),type:b.readUInt16BE(i),end:i+4};}
function answer(b){const q=question(b),header=Buffer.from(b.subarray(0,12));header.writeUInt16BE(0x8180,2);header.writeUInt16BE(1,4);header.writeUInt16BE(1,6);header.writeUInt16BE(0,8);header.writeUInt16BE(0,10);
  const value=q.type===28?Buffer.from('26064700000000000000000000001111','hex'):Buffer.from([1,1,1,1]);const rr=Buffer.alloc(12);rr.writeUInt16BE(0xc00c);rr.writeUInt16BE(q.type,2);rr.writeUInt16BE(1,4);rr.writeUInt32BE(0,6);rr.writeUInt16BE(value.length,10);return Buffer.concat([header,b.subarray(12,q.end),rr,value]);}
function query(host,type){const header=Buffer.alloc(12);header.writeUInt16BE(crypto.randomInt(65536));header.writeUInt16BE(0x100,2);header.writeUInt16BE(1,4);const tail=Buffer.alloc(5);tail.writeUInt16BE(type,1);tail.writeUInt16BE(1,3);return Buffer.concat([header,...host.split('.').map(s=>Buffer.concat([Buffer.from([Buffer.byteLength(s)]),Buffer.from(s)])),tail]);}
async function requestDNS(port,host,type){const s=dgram.createSocket('udp4'),b=query(host,type);try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('DNS timeout '+host)),6000);s.on('message',r=>{if(r.readUInt16BE(0)===b.readUInt16BE(0)){clearTimeout(timer);resolve(r);}});s.on('error',e=>{clearTimeout(timer);reject(e);});s.send(b,port,'127.0.0.1');});}finally{s.close();}}
function addressAnswers(b,type){
  const skipName=start=>{let at=start;while(b[at]){if((b[at]&0xc0)===0xc0)return at+2;at+=1+b[at];}return at+1;};
  let at=12;for(let i=0;i<b.readUInt16BE(4);i++)at=skipName(at)+4;
  const result=[];for(let i=0;i<b.readUInt16BE(6);i++){at=skipName(at);const kind=b.readUInt16BE(at),length=b.readUInt16BE(at+8);at+=10;if(kind===type)result.push(b.subarray(at,at+length));at+=length;}
  return result;
}
async function main(){
  const opensslConfig=path.join(home,'openssl-test.cnf');fs.writeFileSync(opensslConfig,'[req]\ndistinguished_name=test_dn\n[test_dn]\n');
  process.env.OPENSSL_CONF=opensslConfig; // Test-process environment only; no machine configuration change.
  report.coreVersion=cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim();
  const key=path.join(home,'loopback.key'),cert=path.join(home,'loopback.crt');cp.execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=isolated-loopback-test'],{windowsHide:true,stdio:'pipe'});
  const tls={key:fs.readFileSync(key),cert:fs.readFileSync(cert)},handler=(req,res)=>{let chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{try{const b=req.method==='GET'?Buffer.from(new URL(req.url,'https://localhost').searchParams.get('dns'),'base64url'):Buffer.concat(chunks),q=question(b);
      observed.push({host:q.host,type:q.type,via:relayLabels.lookup(req.socket),tuple:relayLabels.serverKey(req.socket),resolverAddress:req.socket.localAddress});res.writeHead(200,{'Content-Type':'application/dns-message','Connection':keepAlive?'keep-alive':'close'});res.end(answer(b));}catch(e){res.writeHead(400);res.end();}});};
  report.ipv6Preflight=await ipv6Preflight();const hasIPv6=report.ipv6Preflight.status==='PASS',videoLabel=hasIPv6?'Video-v6':'Video-v4';
  const doh4=https.createServer(tls,handler),dohPort=await listen(doh4,'127.0.0.1');doh4.on('connection',track);
  if(hasIPv6){const doh6=https.createServer(tls,handler);await listen(doh6,'::1',dohPort);doh6.on('connection',track);}
  const dotHandler=socket=>{track(socket);let pending=Buffer.alloc(0);socket.on('data',b=>{pending=Buffer.concat([pending,b]);while(pending.length>=2&&pending.length>=pending.readUInt16BE(0)+2){const n=pending.readUInt16BE(0),q=Buffer.from(pending.subarray(2,n+2));pending=pending.subarray(n+2);const query=question(q);observed.push({host:query.host,type:query.type,via:relayLabels.lookup(socket),tuple:relayLabels.serverKey(socket),resolverAddress:socket.localAddress,protocol:'DoT'});const a=answer(q);socket.write(Buffer.concat([portBytes(a.length),a]));}});};
  const dot4=tlsModule.createServer(tls,dotHandler),dotPort=await listen(dot4,'127.0.0.1');dot4.on('connection',track);
  if(hasIPv6){const dot6=tlsModule.createServer(tls,dotHandler);await listen(dot6,'::1',dotPort);dot6.on('connection',track);}
  const createRelay=async(label,host)=>{const server=net.createServer(socket=>{track(socket);(async()=>{const read=reader(socket),hello=await read(2);await read(hello[1]);socket.write(Buffer.from([5,0]));const h=await read(4);assert.equal(h[1],1,'Only local TCP forwarding is permitted');let target;
        if(h[3]===1)target=[...await read(4)].join('.');else if(h[3]===3){const n=await read(1);target=(await read(n[0])).toString();}else throw Error('Unexpected address family');
        const p=(await read(2)).readUInt16BE();assert.equal(target,'127.0.0.1');assert.ok([dohPort,dotPort].includes(p),'Prevent public network forwarding');
        const upstream=track(net.connect(p,'127.0.0.1'));await once(upstream,'connect');relayLabels.register(upstream,label);socket.write(Buffer.concat([Buffer.from([5,0,0,1,127,0,0,1]),portBytes(upstream.localPort)]));socket.pipe(upstream);upstream.pipe(socket);socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
      })().catch(()=>socket.destroy());});return await listen(server,host);};
  const aPort=await createRelay('AI-v4','127.0.0.1'),bPort=await createRelay(videoLabel,hasIPv6?'::1':'127.0.0.1');
  for(const platform of ['desktop','android']){
    const fixture=load(platform),config=JSON.parse(JSON.stringify(fixture.config)),inputs=installReviewedProviders(config,home),apiPort=await freePort(),dnsPort=await freePort(),secret=crypto.randomBytes(16).toString('hex');
    Object.assign(config,{'mixed-port':await freePort(),port:0,'socks-port':0,'redir-port':0,'tproxy-port':0,'bind-address':'127.0.0.1','allow-lan':false,'external-controller':'127.0.0.1:'+apiPort,secret,'log-level':'debug',tun:{enable:false},sniffer:{enable:false},profile:{'store-selected':false,'store-fake-ip':false}});
    config.proxies=[{name:'AI-v4',type:'socks5',server:'127.0.0.1',port:aPort,udp:true},{name:videoLabel,type:'socks5',server:hasIPv6?'::1':'127.0.0.1',port:bPort,udp:true},{name:'Dead',type:'socks5',server:'127.0.0.1',port:await freePort(),udp:true}];config['proxy-providers']={};
    config['proxy-groups']=fixture.config['proxy-groups'].map(g=>({name:g.name,type:'select','empty-fallback':'REJECT',proxies:g.name==='自动选择'?['AI-v4']:['高纯净度AI用','高网速视频用'].includes(g.name)?['AI-v4',videoLabel,'Dead']:['高纯净度AI用','高网速视频用','DIRECT','AI-v4',videoLabel]}));
    const testResolver=s=>{const hash=s.indexOf('#'),group=hash<0?'DIRECT':s.slice(hash+1).split('&')[0],host=group==='DIRECT'&&hasIPv6?'[::1]':'127.0.0.1';return s.startsWith('tls://')?'tls://'+host+':'+dotPort+'#'+group+'&disable-reuse=true&skip-cert-verify=true':'https://'+host+':'+dohPort+'/dns-query#'+group+'&skip-cert-verify=true';};
    const dns=config.dns;dns.listen='127.0.0.1:'+dnsPort;dns['enhanced-mode']='redir-host';dns['use-hosts']=false;dns['use-system-hosts']=false;delete dns.hosts;delete config.hosts;
    for(const key of ['nameserver','fallback','default-nameserver','proxy-server-nameserver','direct-nameserver'])if(dns[key])dns[key]=[...new Set(dns[key].map(testResolver))];
    for(const key of Object.keys(dns['nameserver-policy']))dns['nameserver-policy'][key]=[...new Set(dns['nameserver-policy'][key].map(testResolver))];
    for(const p of Object.values(config['rule-providers']))if(p.type!=='inline'){p.type='file';delete p.url;delete p.proxy;delete p.interval;}
    const file=path.join(home,platform+'-loopback.json');fs.writeFileSync(file,JSON.stringify(config,null,2));let logs='';child=cp.spawn(core,['-d',home,'-f',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    const api=(method,resource,value)=>new Promise((resolve,reject)=>{const b=value?JSON.stringify(value):'',q=http.request({host:'127.0.0.1',port:apiPort,path:resource,method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>r.statusCode>=400?reject(Error(b)):resolve(b?JSON.parse(b):{}));});q.on('error',reject);q.end(b);});
    try{let ready=false;for(let i=0;i<80;i++){try{const p=await api('GET','/providers/rules');if(Object.entries(config['rule-providers']).filter(([,v])=>v.type!=='inline').every(([n])=>p.providers[n]?.ruleCount>0)){ready=true;break;}}catch{}await sleep(40);}assert.ok(ready,'Core not ready');
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'AI-v4'});await api('PUT','/proxies/'+encodeURIComponent('高网速视频用'),{name:videoLabel});

      const results=[];let serial=0;
      // Requery the SAME exact names after each independent selector change;
      // flush only this owned core's DNS cache to observe fresh A/AAAA egress.
      const asyncHosts=JSON.parse(fs.readFileSync(local('data/rules/azure-async-review.json'),'utf8')).hosts;
      for(const host of asyncHosts)for(const selected of ['高纯净度AI用','高网速视频用','DIRECT'])for(const type of [1,28]){
        await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:selected});
        await api('PUT','/proxies/'+encodeURIComponent('公共基础服务'),{name:selected==='DIRECT'?'高纯净度AI用':'DIRECT'});
        await api('POST','/cache/dns/flush');
        const start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(e=>e.host===host&&e.type===type),expected=selected==='DIRECT'?'DIRECT':selected==='高纯净度AI用'?'AI-v4':videoLabel;
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(e=>e.via===expected),JSON.stringify({host,selected,expected,events}));results.push({name:'r4-exact-async-selector-dns',host,type:type===1?'A':'AAAA',selected,expected,observed:events});
      }
      await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'DIRECT'});
      await api('PUT','/proxies/'+encodeURIComponent('公共基础服务'),{name:'高网速视频用'});
      for(const host of ['audit-child.'+asyncHosts[0],'chatgpt-async-webps-prod-eastus-2.webpubsub.azure.com','chatgpt-async-webps-prod-eastus.evil-1.webpubsub.azure.com'])for(const type of [1,28]){
        await api('POST','/cache/dns/flush');const start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(e=>e.host===host&&e.type===type);assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(e=>e.via===videoLabel),JSON.stringify({host,events}));results.push({name:'r4-unreviewed-async-shared-dns',host,type:type===1?'A':'AAAA',expected:videoLabel,observed:events});
      }
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'Dead'});
      await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'高纯净度AI用'});
      for(const type of [1,28]){
        const host=asyncHosts[0];await api('POST','/cache/dns/flush');const start=observed.length,b=await requestDNS(dnsPort,host,type);assert.ok((b.readUInt16BE(2)&15)!==0||b.readUInt16BE(6)===0);assert.equal(observed.slice(start).filter(e=>e.host===host).length,0,'Exact Azure DNS fell back on dead node');results.push({name:'r4-exact-async-failed-node-no-DIRECT',host,type:type===1?'A':'AAAA',expected:'FAIL_CLOSED',noUpstreamQuery:true});
      }
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'AI-v4'});
      await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'DIRECT'});
      await api('PUT','/proxies/'+encodeURIComponent('公共基础服务'),{name:'高纯净度AI用'});
      for(const [host,expected] of [['openai.com.cdn.cloudflare.net','DIRECT'],['audit-child.openai.com.cdn.cloudflare.net','AI-v4']]) for(const type of [1,28]) {
        const start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(q=>q.host===host&&q.type===type);
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(q=>q.via===expected),JSON.stringify({host,expected,events}));
        results.push({name:'thunder-cname-exact-versus-shared',host,type:type===1?'A':'AAAA',expected,observed:events});
      }
      // Exact CDN ownership and unreviewed-number guards use opposing policy selections.
      // Every query uses the exact hostname, so an accidental suffix projection cannot pass.
      const cdnCases=[['cdn1-epicgames-17.file.myqcloud.com','Epic Games'],['epicgames-download1-17.file.myqcloud.com','Epic Games'],['hses.akamaized.net','Disney+'],['hses7.akamaized.net','Disney+'],['epicgames-download0.akamaized.net','Epic Games'],['epicgames-download9.akamaized.net','Epic Games'],['cdn1-epicgames-9999.file.myqcloud.com','公共基础服务'],['epicgames-download1-00017.file.myqcloud.com','公共基础服务']];
      for(const [host,group]of cdnCases)for(const selected of ['高纯净度AI用','高网速视频用','DIRECT'])for(const type of [1,28]){
        for(const other of ['Epic Games','Disney+','公共基础服务'])await api('PUT','/proxies/'+encodeURIComponent(other),{name:selected==='DIRECT'?'高纯净度AI用':'DIRECT'});
        await api('PUT','/proxies/'+encodeURIComponent(group),{name:selected});await api('POST','/cache/dns/flush');
        const start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(e=>e.host===host&&e.type===type),expected=selected==='DIRECT'?'DIRECT':selected==='高纯净度AI用'?'AI-v4':videoLabel;
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(e=>e.via===expected),JSON.stringify({host,group,selected,events}));results.push({name:'r5-cdn-exact-or-shared-selector-dns',host,group,selected,type:type===1?'A':'AAAA',expected,observed:events});
      }
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'Dead'});
      for(const [host,group]of [cdnCases[0],cdnCases[2],cdnCases[6]]){
        await api('PUT','/proxies/'+encodeURIComponent(group),{name:'高纯净度AI用'});
        for(const type of [1,28]){await api('POST','/cache/dns/flush');const start=observed.length,b=await requestDNS(dnsPort,host,type);assert.ok((b.readUInt16BE(2)&15)!==0||b.readUInt16BE(6)===0);assert.equal(observed.slice(start).filter(e=>e.host===host).length,0,'CDN DNS fell back DIRECT');results.push({name:'r5-cdn-failed-node-no-DIRECT',host,group,type:type===1?'A':'AAAA',expected:'FAIL_CLOSED',noUpstreamQuery:true});}
      }
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'AI-v4'});
      const tests=[['openai','chatgpt.com','OpenAI 服务'],['anthropic','claude.ai','Anthropic 服务'],['gemini','gemini.google.com','谷歌服务'],['youtube','youtube.com','谷歌服务'],['google-cn','google.cn','谷歌服务'],['microsoft','officecdn.microsoft.com','微软生态'],['shared','auth0.com','公共基础服务'],['shared-google','appspot.com','公共基础服务'],['shared-azure','blob.core.windows.net','公共基础服务'],['steam','steamserver.net','Steam'],['stun-google','stun.l.google.com','谷歌服务'],['reviewed-cn-suffix','ordinary-business-test.cn','国内网站'],['wechat','weixin.qq.com','国内网站'],['wechat-cdn','qpic.cn','国内网站'],['domestic-baidu','baidu.com','国内网站'],['unknown-udp-cn','stun.example.cn','漏网之鱼']];
      tests.push(...cloudTenants.map(domain=>['reviewed-cloud-'+domain,domain,'公共基础服务']),['placeholder-undefined','foo.undefined','漏网之鱼'],['placeholder-null','foo.null','漏网之鱼']);
      // Each group is switched independently; a unique hostname avoids DNS cache
      // reuse. Connection: close avoids claiming existing DoH sessions migrate.
      for(const [name,domain,group]of tests){
        if(group==='公共基础服务')for(const company of ['微软生态','谷歌服务'])await api('PUT','/proxies/'+encodeURIComponent(company),{name:'DIRECT'});
        for(const selection of ['高纯净度AI用','高网速视频用',...(group==='漏网之鱼'?[]:['DIRECT'])])for(const type of [1,28]){
        await api('PUT','/proxies/'+encodeURIComponent(group),{name:selection});const host='probe'+(++serial)+'.'+domain,start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(q=>q.host===host&&q.type===type);
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(b.readUInt16BE(6)>0,host+' returned no A/AAAA');const expected=selection==='DIRECT'?'DIRECT':selection==='高纯净度AI用'?'AI-v4':videoLabel;assert.ok(events.length,host+' had no observed DoH request');assert.ok(events.every(q=>q.via===expected),JSON.stringify({host,expected,events}));
        // Named business DoT URLs use the IPv4 test resolver even when the
        // selected policy is DIRECT. IPv6 DIRECT URLs are exercised separately.
        if(expected==='DIRECT')assert.ok(events.every(q=>q.resolverAddress==='127.0.0.1'),'Unexpected business DIRECT resolver address');results.push({name,host,type:type===1?'A':'AAAA',group,selection,expected,observed:events});
      }}
      // Exact company tenants stay company-owned, while descendants remain
      // shared. Opposing selector choices prove both DNS precedence paths.
      await api('PUT','/proxies/'+encodeURIComponent('微软生态'),{name:'DIRECT'});
      await api('PUT','/proxies/'+encodeURIComponent('谷歌服务'),{name:'DIRECT'});
      await api('PUT','/proxies/'+encodeURIComponent('公共基础服务'),{name:'高纯净度AI用'});
      for(const host of exactMicrosoft.concat(exactMicrosoft.map(h=>'child.'+h),['storage.googleapis.com','storage.cloud.google.com']))for(const type of [1,28]){
        const expected=exactMicrosoft.includes(host)?'DIRECT':'AI-v4',start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(q=>q.host===host&&q.type===type);
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(q=>q.via===expected),JSON.stringify({host,expected,events}));
        results.push({name:'exact-and-shared-dns-conflict',host,type:type===1?'A':'AAAA',expected,observed:events});
      }
      for(const type of [1,28]){const host='explicit-direct-'+type+'-'+platform+'.shiyi.click',start=observed.length,b=await requestDNS(dnsPort,host,type),events=observed.slice(start).filter(q=>q.host===host&&q.type===type);assert.equal(b.readUInt16BE(2)&15,0);assert.ok(events.length&&events.every(e=>e.via==='DIRECT'&&e.resolverAddress===(hasIPv6?'::1':'127.0.0.1')),'Explicit DIRECT resolver transport');results.push({name:'explicit-direct-resolver-transport',host,type:type===1?'A':'AAAA',transport:hasIPv6?'IPv6':'IPv4',observed:events});}
      // Also switch the master itself, proving the business DNS follows its
      // currently selected node rather than a permanently bound DNS node.
      await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'高纯净度AI用'});await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:videoLabel});
      const host='master-switch-'+platform+'.chatgpt.com',start=observed.length;await requestDNS(dnsPort,host,1);const events=observed.slice(start).filter(q=>q.host===host);assert.ok(events.length&&events.every(q=>q.via===videoLabel));results.push({name:'master-node-switch',host,group:'OpenAI 服务',selection:'高纯净度AI用 -> '+videoLabel,observed:events});
      keepAlive=true;const persistent=[];
      for(const selected of ['AI-v4',videoLabel,'DIRECT','AI-v4']){if(selected==='DIRECT')await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'DIRECT'});else {await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'高纯净度AI用'});await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:selected});}const host='persistent-'+selected.toLowerCase()+'-'+persistent.length+'-'+platform+'.chatgpt.com',start=observed.length;await requestDNS(dnsPort,host,1);const events=observed.slice(start).filter(q=>q.host===host);assert.ok(events.length&&events.every(e=>e.protocol==='DoT'));persistent.push({selected,events});}
      assert.ok(persistent.every(p=>p.events.every(e=>e.via===p.selected)),'Resolver reused a stale node/DIRECT connection');
      await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'Dead'});for(const type of [1,28]){const host='failed-'+type+'-'+platform+'.chatgpt.com',start=observed.length,b=await requestDNS(dnsPort,host,type);assert.ok((b.readUInt16BE(2)&15)!==0||b.readUInt16BE(6)===0,'DNS succeeded despite failed node');assert.equal(observed.slice(start).filter(q=>q.host===host).length,0,'Failed DNS leaked to another/DIRECT resolver');assert.equal((await api('GET','/proxies/'+encodeURIComponent('高纯净度AI用'))).now,'Dead');results.push({name:'node-failure-'+type,host,type:type===1?'A':'AAAA',expected:'FAIL_CLOSED',selectedNodePreserved:true,noUpstreamQuery:true});}
      // New domestic-domain DNS must fail closed on the chosen dead proxy.
      await api('PUT','/proxies/'+encodeURIComponent('国内网站'),{name:'高纯净度AI用'});
      for(const host of ['failed-domestic.weixin.qq.com','failed-domestic.baidu.com'])for(const type of [1,28]){
        const start=observed.length,b=await requestDNS(dnsPort,host,type);
        assert.ok((b.readUInt16BE(2)&15)!==0||b.readUInt16BE(6)===0);
        assert.equal(observed.slice(start).filter(q=>q.host===host).length,0,'Domestic DNS fell back to DIRECT');
        results.push({name:'domestic-protocol-dns-dead-node',host,type:type===1?'A':'AAAA',expected:'FAIL_CLOSED',noUpstreamQuery:true});
      }
      await api('PUT','/proxies/'+encodeURIComponent('国内网站'),{name:'DIRECT'});
      // Exercise the production Fake-IP mode, rather than inferring browser
      // compatibility from the redir-host egress experiment above. Each owned
      // restart clears test caches and never touches the running client.
      const compatibility=[];keepAlive=false;let stage=0;
      const restartFake=async filter=>{
        const stopped=once(child,'exit');child.kill();await stopped;child=undefined;
        dns['enhanced-mode']='fake-ip';dns['fake-ip-filter']=filter;
        const candidate=path.join(home,platform+'-fake-api-'+(++stage)+'.json');fs.writeFileSync(candidate,JSON.stringify(config,null,2));
        child=cp.spawn(core,['-d',home,'-f',candidate],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
        let ready=false;for(let i=0;i<80;i++){try{await api('GET','/version');ready=true;break;}catch{}await sleep(40);}assert.ok(ready,'Fake-IP core not ready');
        await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'AI-v4'});await api('PUT','/proxies/'+encodeURIComponent('高网速视频用'),{name:videoLabel});
      };
      const filtered=fixture.config.dns['fake-ip-filter'];assert.ok(filtered.includes('api.openai.com'));
      await restartFake(filtered.filter(s=>s!=='api.openai.com'));
      for(const type of [1,28]){
        const start=observed.length,b=await requestDNS(dnsPort,'api.openai.com',type),answers=addressAnswers(b,type);
        assert.equal(b.readUInt16BE(2)&15,0);assert.ok(answers.length);
        assert.ok(answers.every(a=>type===1?a[0]===198&&a[1]===18:a.subarray(0,6).equals(Buffer.from('fdfedcba9876','hex'))),'Pre-fix counterexample must return Fake-IP');
        assert.equal(observed.slice(start).filter(q=>q.host==='api.openai.com').length,0);
        compatibility.push({phase:'BEFORE_EXACT_EXCEPTION',type:type===1?'A':'AAAA',responseClass:type===1?'BENCHMARK_FAKE_IP':'IPV6_ULA_CHROMIUM_LOCAL',upstreamQuery:false});
      }
      for(const selection of ['高纯净度AI用','高网速视频用','DIRECT']){
        await restartFake(filtered);await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:selection});
        for(const type of [1,28]){
          const start=observed.length,b=await requestDNS(dnsPort,'api.openai.com',type),answers=addressAnswers(b,type),events=observed.slice(start).filter(q=>q.host==='api.openai.com'&&q.type===type),expected=selection==='DIRECT'?'DIRECT':selection==='高纯净度AI用'?'AI-v4':videoLabel;
          assert.equal(b.readUInt16BE(2)&15,0);assert.ok(answers.length&&answers.every(a=>a.equals(type===1?Buffer.from([1,1,1,1]):Buffer.from('26064700000000000000000000001111','hex'))),'API exception still returned Fake-IP');
          assert.ok(events.length&&events.every(q=>q.via===expected),JSON.stringify({selection,type,events}));
          compatibility.push({phase:'AFTER_EXACT_EXCEPTION',type:type===1?'A':'AAAA',selection,responseClass:'PUBLIC_RESOLVER_ADDRESS',expected,observed:events});
        }
      }
      await restartFake(filtered);await api('PUT','/proxies/'+encodeURIComponent('OpenAI 服务'),{name:'高纯净度AI用'});await api('PUT','/proxies/'+encodeURIComponent('高纯净度AI用'),{name:'Dead'});
      for(const type of [1,28]){
        const start=observed.length,b=await requestDNS(dnsPort,'api.openai.com',type);
        assert.ok((b.readUInt16BE(2)&15)!==0||addressAnswers(b,type).length===0,'API DNS succeeded despite failed node');
        assert.equal(observed.slice(start).filter(q=>q.host==='api.openai.com').length,0,'API real-address exception leaked DNS on failure');
        assert.equal((await api('GET','/proxies/'+encodeURIComponent('高纯净度AI用'))).now,'Dead');
        compatibility.push({phase:'AFTER_EXACT_EXCEPTION_FAILED_NODE',type:type===1?'A':'AAAA',responseClass:'FAIL_CLOSED',upstreamQuery:false,selectedNodePreserved:true});
      }
      report.platforms.push({platform,cases:results.length+4+compatibility.length,inputs,results,persistentResolverSelectorSwitch:{status:'PASS',results:persistent},apiFakeIPCompatibility:{status:'CORE_FAKE_IP_COMPATIBILITY_PASS_BROWSER_RETEST_PENDING',cases:compatibility.length,results:compatibility},ipv4NodeDial:'PASS',ipv6NodeDial:hasIPv6?'PASS':'NOT_RUN_ENVIRONMENT',directIPv6ResolverDial:hasIPv6?'PASS':'NOT_RUN_ENVIRONMENT'});
      console.log('PASS '+platform+': '+(results.length+4+compatibility.length)+' observed DNS/Fake-IP cases; persistent switch and API real-address exception PASS');
    }finally{fs.writeFileSync(path.join(home,platform+'-runtime.log'),logs);const stopped=once(child,'exit');child.kill();await stopped;child=undefined;}
  }
  report.status='CORE_DNS_EGRESS_PASS';
}
main().catch(e=>{report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{if(child&&child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}for(const s of sockets)s.destroy();await Promise.all(ownedServers.map(s=>new Promise(r=>s.close(r))));report.home=captureExperiment(home,'native-dns-egress');report.sourceFiles=['src/windows/v14.3-windows-flclash.js','src/android/v14.3-android-flclash.js','tests/native-dns-egress.cjs','tests/dns-relay-labels.cjs','tests/fixture.cjs','tests/cases.cjs','data/rule-sources.lock.json'].map(file=>({file,sha256:sha(local(file))}));fs.writeFileSync(local('validation/native-dns-egress.json'),JSON.stringify(report,null,2)+'\n');});
