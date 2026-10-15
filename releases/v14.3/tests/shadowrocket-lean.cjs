'use strict';
// Finite native-config model, independent of the generator's row deletion logic.
// This is not Shadowrocket parser, DNS or VPN acceptance.
const fs=require('node:fs'),assert=require('node:assert/strict'),f=require('./fixture.cjs'),index=require('./domain-index.cjs'),contract=require('./domestic-contract.cjs');
const old=require('../validation/inputs/v14.2-baseline/tests/fixture.cjs'),before=old.load('shadowrocket');
const manifest=JSON.parse(fs.readFileSync(f.local('metadata/shadowrocket-lean.json'),'utf8'));
const raw=fs.readFileSync(f.local(manifest.file),'utf8');
const section=name=>raw.split('['+name+']')[1].split(/\r?\n\[/)[0].split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
const sources=new Map(manifest.sources.map(e=>{assert.equal(f.sha(f.local(e.file)),e.sha256);assert.equal(f.sha(f.local(e.classifier.file)),e.classifier.sha256);return [e.url,fs.readFileSync(f.local(e.classifier.file),'utf8').split(/\r?\n/).filter(Boolean)];}));
const pairs=rows=>rows.map(s=>{const at=s.indexOf('=');return [s.slice(0,at).trim(),s.slice(at+1).trim()];});
const current={platform:'shadowrocket',rules:section('Rule'),sources,config:{general:Object.fromEntries(pairs(section('General'))),hosts:pairs(section('Host'))}};
const dnsIndexes=new WeakMap();
function dns(model,host){
 let lookup=dnsIndexes.get(model);if(!lookup){lookup={exact:new Map(),suffix:new Map(),wild:[]};for(const row of model.config.hosts){const [key,value]=row;if(!value.startsWith('server:'))continue;
  if(!key.includes('*'))lookup.exact.set(key,row);else if(/^\*\.[^*]+$/.test(key))lookup.suffix.set(key.slice(2),row);else lookup.wild.push({row,regex:new RegExp('^'+key.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$','i')});
 }dnsIndexes.set(model,lookup);}
 const matched=lookup.exact.has(host)?[lookup.exact.get(host)]:[],labels=host.split('.');for(let i=1;i<labels.length;i++){const row=lookup.suffix.get(labels.slice(i).join('.'));if(row)matched.push(row);}for(const entry of lookup.wild)if(entry.regex.test(host))matched.push(entry.row);
 matched.sort((a,b)=>(b[0]===host?1e6:b[0].length)-(a[0]===host?1e6:a[0].length));
 const entry=matched[0],servers=(entry?entry[1].slice(7):model.config.general['dns-server']).split(',');
 return {key:entry?.[0]||'default',groups:[...new Set(servers.map(s=>decodeURIComponent(s.split('#proxy=')[1]?.split('&')[0]||'DIRECT')))]};
}
const oldRoute=index.indexRoute(before),route=index.indexRoute(current),hosts=new Set(),businessDNSHosts=new Set();
for(const row of [...before.rules,...[...sources.values()].flat()]){const [kind,host]=f.split(row);if(['DOMAIN','DOMAIN-SUFFIX'].includes(kind)){hosts.add(host);if(kind==='DOMAIN-SUFFIX')hosts.add('lean-audit.'+host);}}
for(const [key,value]of before.config.hosts)if(value.startsWith('server:')){businessDNSHosts.add(key.replace(/\*/g,'lean-audit'));}
const report={version:'14.3',date:'2026-10-13',revision:manifest.revision,domesticProtocolRevision:manifest.domesticProtocolRevision,status:'RUNNING',checks:[],failures:[],metrics:{routingHosts:hosts.size,tcp:0,udp:0,businessDNS:0,criticalDomesticDNS:0,coldRouting:0,protectedFlows:0},sourceFiles:[],scope:'Finite domain/selector/Host model and SHA verification only; native parsing, DNS order/remote resolution and iOS VPN NOT_RUN',nativeAcceptance:'NOT_RUN',deviceAcceptance:'NOT_RUN',clientDeployment:false};
function check(name,body){try{body();report.checks.push({name,status:'PASS'});}catch(e){report.failures.push({name,error:e.stack});report.checks.push({name,status:'FAIL'});}}
check('size-groups-fixed-sources-and-general-settings',()=>{
 assert.equal(f.sha(f.local(manifest.file)),manifest.sha256);assert.equal(Buffer.byteLength(raw),manifest.bytes);assert.ok(manifest.bytes<1800000&&manifest.bytes<manifest.before.bytes*0.3);
 assert.equal(manifest.groups.length,26);assert.equal(sources.size,15);assert.equal(section('Proxy Group').length,26);assert.deepEqual(current.config.general,before.config.general);
 for(const url of sources.keys())assert.match(url,/\/[a-f0-9]{40}\//);
 assert.equal(current.rules.filter(r=>r.startsWith('RULE-SET,')).length,manifest.sources.reduce((n,s)=>n+s.uses.length,0));
});
check('all-reviewed-domain-TCP-preserved-and-ordinary-UDP-follows-domestic',()=>{
 const mismatches=[];for(const host of hosts){const a=oldRoute(host),b=route(host);if(a.group!==b.group&&mismatches.length<12)mismatches.push({host,before:a.group,after:b.group});report.metrics.tcp++;
  const oldUDP=oldRoute(host,'UDP'),expected=contract.known(host,oldRoute)?'国内网站':oldUDP.group,actual=route(host,'UDP');if(expected!==actual.group&&mismatches.length<12)mismatches.push({host,protocol:'UDP',expected,actual:actual.group});report.metrics.udp++;
 }assert.deepEqual(mismatches,[]);
});
check('business-Host-DNS-preserved-except-authorized-domestic-keys',()=>{
 const mismatches=[];for(const host of businessDNSHosts){const a=dns(before,host),b=dns(current,host);if(JSON.stringify(a.groups)!==JSON.stringify(b.groups)&&!contract.known(host,oldRoute)&&mismatches.length<12)mismatches.push({host,before:a,after:b});report.metrics.businessDNS++;}assert.deepEqual(mismatches,[]);
});
const cold={...current,sources:new Map([...sources.keys()].map(k=>[k,[]]))};
check('critical-domestic-WeChat-selector-and-DNS-affinity',()=>{
 for(const host of ['baidu.com','szfile.weixin.qq.com','szextshort.weixin.qq.com','wxapp.tc.qq.com','qlogo.cn','mmbiz.qpic.cn']){
  assert.deepEqual(dns(current,host).groups,['国内网站'],host);report.metrics.criticalDomesticDNS++;
  for(const protocol of ['TCP','UDP'])for(const selection of ['DIRECT','高纯净度AI用','高网速视频用']){
   assert.equal(f.route(current,{host,protocol,port:443},{selections:{'国内网站':selection}}).policy,selection,host);
   assert.equal(f.route(cold,{host,protocol,port:443},{selections:{'国内网站':selection}}).policy,selection,host);report.metrics.coldRouting++;
  }
  assert.equal(f.route(current,{host,protocol:'UDP',port:443},{udpSupported:false,selections:{'国内网站':'高纯净度AI用'}}).policy,'REJECT',host);
 }
});
check('unknown-IP-STUN-company-priority-and-no-UDP-DIRECT-fallback',()=>{
 for(const flow of [{ip:'203.0.113.7',protocol:'UDP',port:443},{ip:'2001:db8::7',protocol:'UDP',port:443},{host:'relay.stun.audit.cn',protocol:'UDP',port:443},{host:'ordinary.audit.cn',protocol:'UDP',port:3478},{host:'unreviewed.protocol-audit.net',protocol:'UDP',port:49000}]){
  assert.equal(f.route(current,flow).group,'漏网之鱼');assert.equal(f.route(current,flow,{udpSupported:false}).policy,'REJECT');report.metrics.protectedFlows++;
 }
 for(const host of ['stun.audit.cn','relay.stun.audit.cn','relay.turn.audit.cn'])assert.deepEqual(dns(current,host).groups,['漏网之鱼'],host);
 for(const host of ['stun.l.google.com','turn.livekit.cloud','account.apple.com','microsoft.com']){
  assert.equal(route(host,'UDP').group,oldRoute(host,'UDP').group);assert.deepEqual(dns(current,host).groups,dns(before,host).groups,host);report.metrics.protectedFlows++;
 }
});
report.sourceFiles=['tests/shadowrocket-lean.cjs','tests/domestic-contract.cjs','tests/fixture.cjs','tests/domain-index.cjs','tools/build-shadowrocket-lean.cjs','metadata/shadowrocket-lean.json',manifest.file,...manifest.inputs.map(e=>e.file),...manifest.sources.flatMap(e=>[e.file,e.classifier.file])].filter((e,i,a)=>a.indexOf(e)===i).map(file=>({file,sha256:f.sha(f.local(file))}));
report.status=report.failures.length?'FAIL':'SHADOWROCKET_LEAN_STATIC_PASS_NATIVE_PENDING';
fs.writeFileSync(f.local('validation/shadowrocket-lean.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks.length,metrics:report.metrics,failures:report.failures.map(e=>({name:e.name,error:e.error.split('\n').slice(0,14).join(' ')})),nativeAcceptance:'NOT_RUN'}));
if(report.failures.length)process.exitCode=1;
