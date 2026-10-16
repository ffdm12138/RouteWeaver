'use strict';
// Keep a self-contained native DNS table; remove the duplicated full CN rule inventory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),local=n=>path.join(root,n),read=n=>JSON.parse(fs.readFileSync(local(n),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prefix='validation/inputs/v14.2-baseline/',baseline=read(prefix+'manifest.json');
const sourceFile=prefix+'src/ios/v14.2-shadowrocket.conf',oldText=fs.readFileSync(local(sourceFile),'utf8');
assert.equal(sha(local(sourceFile)),baseline.files.find(e=>e.file==='src/ios/v14.2-shadowrocket.conf').sha256);
const old=require('../validation/inputs/v14.2-baseline/tests/fixture.cjs'),index=require('../tests/domain-index.cjs'),before=old.load('shadowrocket');
const beforeRoute=index.indexRoute(before),beforeDNS=index.indexDNS(before);
const lock=read(prefix+'data/rule-sources.lock.json'),oldManifest=read(prefix+'metadata/shadowrocket-sources.json');
const source=fs.readFileSync(local('src/android/v14.3-android.js'),'utf8'),ctx=vm.createContext({console:{log(){}}});vm.runInContext(source,ctx);
const data=JSON.parse(vm.runInContext('JSON.stringify({settings:V14,domestic:V14_DOMESTIC_SEEDS,stunNames:V14.stunHostPatterns})',ctx));
const policy=read('data/rules/embedded-policy.json');assert.equal(policy.domesticProtocolRevision,'domestic-protocol-r1');
function section(name){return oldText.split('['+name+']')[1].split(/\r?\n\[/)[0].split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));}
const split=require('../tests/fixture.cjs').split;
const sources=oldManifest.ruleSets.map(p=>{
 const e=lock.sources.find(s=>s.url===p.url);assert.ok(e,p.url);for(const item of [{file:e.file,sha256:e.sha256},e.classifier])assert.equal(sha(local(prefix+item.file)),item.sha256);
 return {id:e.id,url:e.url,file:prefix+e.file,sha256:e.sha256,classifier:{file:prefix+e.classifier.file,sha256:e.classifier.sha256},uses:p.uses};
});
const cnSource=sources.find(s=>s.id==='sr-06'),cnRows=new Set(fs.readFileSync(local(cnSource.classifier.file),'utf8').split(/\r?\n/));
const critical=new Set(data.domestic.concat(policy.embedded.cn.payloadText.split('\n').map(s=>s.slice(2)),['cn']).map(h=>'DOMAIN-SUFFIX,'+h));
const all=section('Rule'),kept=[],domestic=[],geographic=[];let removed=0;
for(const rule of all){
 const a=split(rule),tail=a.at(-1)==='no-resolve'?-2:-1,group=a.at(tail),match=a.slice(0,tail).join(',');
 if(group==='国内网站'&&cnRows.has(match)&&!critical.has(match)){removed++;continue;}
 if(group==='国内网站'){
  const e=a[0]==='RULE-SET'?sources.find(s=>s.url===a[1]):null;
  if(a[0].startsWith('DOMAIN')||e?.uses.some(u=>u.kind==='domain'))domestic.push(rule);else geographic.push(rule);
 }else kept.push(rule);
}
assert.ok(removed>100000,'Full duplicate domestic table was not removed');
const guard=kept.findIndex(r=>r==='AND,((PROTOCOL,UDP),(NOT,((PROTOCOL,TCP)))),漏网之鱼');assert.ok(guard>=0);
const udpStun=[];for(const port of data.settings.stunPorts)udpStun.push('AND,((PROTOCOL,UDP),(DST-PORT,'+port+')),漏网之鱼');
for(const host of data.stunNames)udpStun.push('AND,((PROTOCOL,UDP),(DOMAIN-WILDCARD,'+host+')),漏网之鱼');
const rules=[...kept.slice(0,guard),...udpStun,...domestic,kept[guard],...geographic,...kept.slice(guard+1)];
assert.equal(rules.at(-1),'FINAL,漏网之鱼');

const hosts=new Map(section('Host').map(row=>{const at=row.indexOf('=');return [row.slice(0,at).trim(),row.slice(at+1).trim()];}));
const defaultDNS=before.config.general['dns-server'];
const valueFor=group=>'server:'+data.settings.bootstrapDns.slice(0,0).concat(['https://dns.alidns.com/dns-query','https://doh.pub/dns-query']).map(u=>group==='DIRECT'?u:u+'#proxy='+encodeURIComponent(group)).join(',');
const put=(key,value)=>{if(!hosts.has(key))hosts.set(key,value);};
// Preserve local/private and resolver-name policies before the new .cn DNS declaration.
for(const rows of [policy.embedded.private.payloadText.split('\n'),policy.embedded['category-doh'].payloadText.split('\n')])for(const row of rows){
 const [kind,host]=split(row);if(!['DOMAIN','DOMAIN-SUFFIX'].includes(kind))continue;
 put(host,'server:'+beforeDNS(host).servers.join(','));
 if(kind==='DOMAIN-SUFFIX')put('*.'+host,'server:'+beforeDNS('dns-scope-probe.'+host).servers.join(','));
}
for(const host of data.stunNames)put(host,valueFor('漏网之鱼'));
const domesticDNSKeys=[];
for(const match of critical){
 const host=match.slice('DOMAIN-SUFFIX,'.length);
 if(beforeRoute(host).group!=='国内网站'&&host!=='cn')continue;
 for(const key of [host,'*.'+host]){put(key,valueFor('国内网站'));domesticDNSKeys.push(key);}
 // Keep generic named STUN on the fallback, without taking company-owned roots.
 if(host!=='cn')for(const name of ['stun','turn'])for(const key of [name+'.'+host,'*.'+name+'.'+host,name+'.*.'+host,'*.'+name+'.*.'+host])put(key,valueFor('漏网之鱼'));
}
const nonFinite=[...hosts.keys()].filter(k=>k.includes('*')&&!/^\*\.[^*]+$/.test(k));
const protectedTails=nonFinite.map(k=>k.split('.').filter(x=>!x.includes('*')).join('.')).filter(Boolean);
const outputHosts=[];const eliminated=[];
for(const [key,value]of hosts){
 if(!value.startsWith('server:')||key.includes('*')&&!/^\*\.[^*]+$/.test(key)){outputHosts.push([key,value]);continue;}
 const name=key.startsWith('*.')?key.slice(2):key;
 if(protectedTails.some(t=>name===t||name.endsWith('.'+t))){outputHosts.push([key,value]);continue;}
 const labels=name.split('.');let inherited=defaultDNS,parent='default';
 for(let i=1;i<labels.length;i++){const candidate='*.'+labels.slice(i).join('.');if(hosts.get(candidate)?.startsWith('server:')){inherited=hosts.get(candidate).slice(7);parent=candidate;break;}}
 if(value.slice(7)===inherited)eliminated.push({key,parent});else outputHosts.push([key,value]);
}
const header=['# V14.3 Shadowrocket — 2026-10-13; shadowrocket-lean-r1 / domestic-protocol-r1',
 '# 自包含业务 DNS；完整国内规则远程拉取固定审核提交；不是 V14.2 全量内嵌副本。',
 '# 先保留节点订阅，再导入配置，路由选择“配置”，两个公共组手动选节点。',
 '# 已审核国内域名普通 TCP/UDP 跟随国内组；未知 IP UDP 和通用 STUN 保持代理/拒绝。',
 '# 业务与关键国内 Host DNS 显式跟组；其余国内 DNS 依赖原生 DIRECT DNS / 所选节点远端解析。',
 '# Shadowrocket 原生编译、完整国内 DNS 切换和 iOS VPN 接管仍待实机验收。'];
header.push('# auto-local-family-r1: Mihomo native extension is unavailable in this conf; IPv6 stays enabled with native IPv4 preference.');
const output=header.join('\n')+'\n\n[General]\n'+section('General').join('\n')+'\n\n[Proxy Group]\n'+section('Proxy Group').join('\n')+'\n\n[Rule]\n'+rules.join('\n')+'\n\n[Host]\n'+outputHosts.map(([k,v])=>k+' = '+v).join('\n')+'\n';
assert.ok(Buffer.byteLength(output)<1800000,'Self-contained DNS budget exceeded');
const file='src/ios/v14.3-shadowrocket.conf';
const contractPath=fs.existsSync(path.resolve(root,'../../CURRENT_RELEASE.json'))?path.resolve(root,'../../docs/需求.md'):local('docs/需求.md');
const manifest={version:'14.3',date:'2026-10-13',revision:'shadowrocket-lean-r1',domesticProtocolRevision:'domestic-protocol-r1',
 status:'GENERATED_NATIVE_ACCEPTANCE_PENDING',file,sha256:crypto.createHash('sha256').update(output).digest('hex'),bytes:Buffer.byteLength(output),
 before:{file:sourceFile,sha256:sha(local(sourceFile)),bytes:Buffer.byteLength(oldText)},
 rules:{before:all.length,after:rules.length,removedDuplicateCNRows:removed,criticalDomesticRules:[...critical]},
 dns:{beforeHostRows:before.config.hosts.length,afterHostRows:outputHosts.length,removedRedundantRows:eliminated.length,
  redundantRowCertificates:eliminated,domesticLiteralKeys:domesticDNSKeys,
  fullBusinessTable:'RETAINED',fullDomesticDNS:'NATIVE_DIRECT_OR_SELECTED_PROXY_REMOTE_RESOLUTION_REQUIRES_DEVICE_ACCEPTANCE',
  standaloneDomesticDNSAffinity:'NOT_NATIVE_VERIFIED'},
 groups:section('Proxy Group').map(r=>r.split(' = ')[0]),sources,
 sourceContract:{file:'docs/需求.md',sha256:sha(contractPath)},
 inputs:['tools/build-shadowrocket-lean.cjs','src/android/v14.3-android.js','data/rules/embedded-policy.json',prefix+'manifest.json',prefix+'metadata/shadowrocket-sources.json',prefix+'data/rule-sources.lock.json'].map(file=>({file,sha256:sha(local(file))})),
 clientDeployment:false,nativeCompilation:'NOT_RUN',nativeDNSAffinity:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
const text=JSON.stringify(manifest,null,2)+'\n';
if(process.argv.includes('--check')){assert.equal(fs.readFileSync(local(file),'utf8'),output);assert.equal(fs.readFileSync(local('metadata/shadowrocket-lean.json'),'utf8'),text);}
else {fs.writeFileSync(local(file),output);fs.writeFileSync(local('metadata/shadowrocket-lean.json'),text);}
console.log(JSON.stringify({status:'SHADOWROCKET_LEAN_GENERATION_PASS',bytes:manifest.bytes,beforeBytes:manifest.before.bytes,rules:manifest.rules,dnsRows:manifest.dns.afterHostRows,remoteSources:sources.length,nativeAcceptance:'NOT_RUN'}));
