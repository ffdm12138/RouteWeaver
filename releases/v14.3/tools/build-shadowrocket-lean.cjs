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
const source=fs.readFileSync(local('src/android/v14.3-android-flclash.js'),'utf8'),ctx=vm.createContext({console:{log(){}}});vm.runInContext(source,ctx);
const data=JSON.parse(vm.runInContext('JSON.stringify({settings:V14,domestic:V14_DOMESTIC_SEEDS,stunNames:V14.stunHostPatterns,selectorDefaults:V14_SELECTOR_DEFAULTS})',ctx));
const businessFile='data/rules/business-services.json';
const displayPriority=read(businessFile).groupDisplayPriority;
const policy=read('data/rules/embedded-policy.json');assert.equal(policy.domesticProtocolRevision,'domestic-protocol-r1');
const additionalGroups=['YouTube','Google Drive'];
const splitServices=policy.services.filter(service=>[...additionalGroups,'高网速视频用'].includes(service.name));
assert.equal(splitServices.length,3);
const dedicatedGoogleServices=splitServices.filter(service=>additionalGroups.includes(service.name));
const matchesSuffix=(host,suffix)=>host===suffix||host.endsWith('.'+suffix);
const isDedicatedGoogleDomain=(host,exact)=>dedicatedGoogleServices.some(service=>
 service.seeds.some(suffix=>matchesSuffix(host,suffix))||(exact&&service.exact?.includes(host)));
const googleExceptions=policy.services.find(service=>service.name==='谷歌服务').exact
 .filter(host=>isDedicatedGoogleDomain(host,true));
const authorizedSuffixes=new Set(policy.authorizedDomesticSuffixes);
const isDomestic=host=>host==='cn'||authorizedSuffixes.has(host)||beforeRoute(host).group==='国内网站';
const wechatFile='data/rules/wechat-media.json',wechatDomains=read(wechatFile);
const wechatPatterns=wechatDomains.flatMap(domain=>[domain,'*.'+domain]);
const tailscale=require('./lib/tailscale-policy.cjs').loadTailscalePolicy(root);
const tailscaleIP=network=>(network.includes(':')?'IP-CIDR6,':'IP-CIDR,')+network+',DIRECT,no-resolve';
const tailscaleRules=[tailscale.publicDomain,tailscale.tailnetDomain].map(domain=>'DOMAIN-SUFFIX,'+domain+',DIRECT')
 .concat(tailscale.publicNetworks.map(tailscaleIP));
function section(name){return oldText.split('['+name+']')[1].split(/\r?\n\[/)[0].split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));}
const split=require('../tests/fixture.cjs').split;
const sources=oldManifest.ruleSets.map(p=>{
 const e=lock.sources.find(s=>s.url===p.url);assert.ok(e,p.url);for(const item of [{file:e.file,sha256:e.sha256},e.classifier])assert.equal(sha(local(prefix+item.file)),item.sha256);
 return {id:e.id,url:e.url,file:prefix+e.file,sha256:e.sha256,classifier:{file:prefix+e.classifier.file,sha256:e.classifier.sha256},uses:p.uses};
});
const cnSource=sources.find(s=>s.id==='sr-06'),cnRows=new Set(fs.readFileSync(local(cnSource.classifier.file),'utf8').split(/\r?\n/));
const critical=new Set(data.domestic.concat(['cn']).map(h=>'DOMAIN-SUFFIX,'+h).concat(
 policy.embedded.cn.payloadText.split('\n').map(s=>s.startsWith('+.')?'DOMAIN-SUFFIX,'+s.slice(2):'DOMAIN,'+s)));
const all=section('Rule'),kept=[],domestic=[],geographic=[];let removed=0;
for(const rule of all){
 const a=split(rule),tail=a.at(-1)==='no-resolve'?-2:-1,group=a.at(tail),match=a.slice(0,tail).join(',');
 if(group==='谷歌服务'&&['DOMAIN','DOMAIN-SUFFIX'].includes(a[0])&&
    isDedicatedGoogleDomain(a[1],a[0]==='DOMAIN')&&!googleExceptions.includes(a[1]))continue;
 if(group==='国内网站'&&cnRows.has(match)&&!critical.has(match)){removed++;continue;}
 if(group==='国内网站'){
  const e=a[0]==='RULE-SET'?sources.find(s=>s.url===a[1]):null;
  if(a[0].startsWith('DOMAIN')||e?.uses.some(u=>u.kind==='domain'))domestic.push(rule);else geographic.push(rule);
 }else kept.push(rule);
}
assert.ok(removed>100000,'Full duplicate domestic table was not removed');
// Exact shared-CDN hosts may have existed only under a broad remote parent.
// Add the reviewed critical rows explicitly instead of relying on old literals.
const existingDomestic=new Set(domestic);
for(const match of critical){
 const host=split(match)[1];
 if(!isDomestic(host))continue;
 const rule=match+',国内网站';if(!existingDomestic.has(rule))domestic.push(rule);
}
const companySupplement=read('data/rules/company-supplement.json');
kept.unshift(...companySupplement.additions.map(a=>a.row+','+a.group));
const firstGoogleRule=kept.findIndex(rule=>split(rule).at(-1)==='谷歌服务');
assert.ok(firstGoogleRule>=0,'Missing Shadowrocket Google rules');
kept.splice(firstGoogleRule,0,...googleExceptions.map(host=>'DOMAIN,'+host+',谷歌服务'),
 ...splitServices.flatMap(service=>[
  ...(service.exact||[]).map(host=>'DOMAIN,'+host+','+service.name),
  ...service.seeds.map(host=>'DOMAIN-SUFFIX,'+host+','+service.name),
 ]));
const tailnetStart=kept.indexOf(tailscaleIP(tailscale.tailnetNetworks[0]));
assert.ok(tailnetStart>=0,'Missing Shadowrocket private address anchor');
kept.splice(tailnetStart,1,...tailscale.tailnetNetworks.map(tailscaleIP));
const guard=kept.findIndex(r=>r==='AND,((PROTOCOL,UDP),(NOT,((PROTOCOL,TCP)))),漏网之鱼');assert.ok(guard>=0);
const udpStun=[];for(const port of data.settings.stunPorts)udpStun.push('AND,((PROTOCOL,UDP),(DST-PORT,'+port+')),漏网之鱼');
for(const host of data.stunNames)udpStun.push('AND,((PROTOCOL,UDP),(DOMAIN-WILDCARD,'+host+')),漏网之鱼');
const wechatRules=wechatDomains.map(domain=>'DOMAIN-SUFFIX,'+domain+',DIRECT');
const uncompressedRules=[...tailscaleRules,...kept.slice(0,guard),...udpStun,...wechatRules,...domestic,kept[guard],...geographic,...kept.slice(guard+1)];
// Remove only rows already dominated by an earlier literal suffix with the
// identical group. No provider, wildcard or cross-group precedence is inferred.
const priorSuffixes=new Map(), redundantRules=[];
const rules=uncompressedRules.filter(row=>{
 const [kind,host,group]=split(row);if(!['DOMAIN','DOMAIN-SUFFIX'].includes(kind))return true;
 const labels=host.split('.');
 if(labels.some((_,i)=>priorSuffixes.get(labels.slice(i).join('.'))===group)){redundantRules.push(row);return false;}
 if(kind==='DOMAIN-SUFFIX'&&!priorSuffixes.has(host))priorSuffixes.set(host,group);
 return true;
});
assert.equal(rules.at(-1),'FINAL,漏网之鱼');

const hosts=new Map(section('Host').map(row=>{const at=row.indexOf('=');return [row.slice(0,at).trim(),row.slice(at+1).trim()];}));
const defaultDNS=before.config.general['dns-server'];
const valueFor=group=>'server:'+data.settings.bootstrapDns.slice(0,0).concat(['https://dns.alidns.com/dns-query','https://doh.pub/dns-query']).map(u=>group==='DIRECT'?u:u+'#proxy='+encodeURIComponent(group)).join(',');
const stunDNS='server:https://dns.alidns.com/dns-query#proxy='+encodeURIComponent('漏网之鱼');
const put=(key,value)=>{if(!hosts.has(key))hosts.set(key,value);};
for(const domain of [tailscale.publicDomain,'*.'+tailscale.publicDomain])hosts.set(domain,valueFor('DIRECT'));
for(const domain of [tailscale.tailnetDomain,'*.'+tailscale.tailnetDomain])hosts.set(domain,'server:system');
// Preserve local/private and resolver-name policies before the new .cn DNS declaration.
for(const rows of [policy.embedded.private.payloadText.split('\n'),policy.embedded['category-doh'].payloadText.split('\n')])for(const row of rows){
 const [kind,host]=split(row);if(!['DOMAIN','DOMAIN-SUFFIX'].includes(kind))continue;
 put(host,'server:'+beforeDNS(host).servers.join(','));
 if(kind==='DOMAIN-SUFFIX')put('*.'+host,'server:'+beforeDNS('dns-scope-probe.'+host).servers.join(','));
}
for(const host of data.stunNames)put(host,valueFor('漏网之鱼'));
for(const a of companySupplement.additions){const [kind,host]=split(a.row);put(host,valueFor(a.group));if(kind==='DOMAIN-SUFFIX')put('*.'+host,valueFor(a.group));}
for(const service of splitServices){
 const servers=valueFor(service.name);
 for(const key of hosts.keys()){
  if(service.seeds.some(suffix=>matchesSuffix(key.replace(/^\*\./,''),suffix)))hosts.set(key,servers);
 }
 for(const host of service.exact||[])hosts.set(host,servers);
 for(const host of service.seeds){hosts.set(host,servers);hosts.set('*.'+host,servers);}
}
for(const host of googleExceptions)hosts.set(host,valueFor('谷歌服务'));
const domesticDNSKeys=[];
for(const match of critical){
 const [kind,host]=split(match);
 if(!isDomestic(host))continue;
 for(const key of kind==='DOMAIN'?[host]:[host,'*.'+host]){put(key,valueFor('国内网站'));domesticDNSKeys.push(key);}
 // Keep generic named STUN on the fallback, without taking company-owned roots.
 if(host!=='cn'&&kind==='DOMAIN-SUFFIX')for(const name of ['stun','turn'])for(const key of [name+'.'+host,'*.'+name+'.'+host,name+'.*.'+host,'*.'+name+'.*.'+host])put(key,stunDNS);
}
for(const pattern of wechatPatterns)hosts.set(pattern,valueFor('DIRECT'));
for(const domain of wechatDomains)for(const label of ['stun','turn'])
 for(const key of [label+'.'+domain,'*.'+label+'.'+domain,label+'.*.'+domain,'*.'+label+'.*.'+domain])put(key,stunDNS);
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
const header=['# RouteWeaver v14.3 Shadowrocket',
 '# 保留订阅，选择「配置」路由和公共组节点。'];
const general=section('General').map(row=>row
 .replace(/^direct-dns-server = .+$/, 'direct-dns-server = system')
 .replace(/^dns-direct-system = false$/, 'dns-direct-system = true'))
 .concat('always-real-ip = '+wechatPatterns.join(','));
const manualLabels=new Map([['DIRECT','直连 direct'],['REJECT','拒绝 reject']]);
const groupRows=section('Proxy Group').map(row=>row.replace(/\(\?i\)\^\(\?!\(\?:([^)]*)\)\$\)/,(_,names)=>{
 let reserved=names.split('|').concat(additionalGroups,...manualLabels.values());
 for(const suffix of ['服务','国际']){
  const matching=reserved.filter(name=>name.endsWith(suffix));
  reserved=reserved.filter(name=>!name.endsWith(suffix));
  reserved.push('(?:'+matching.map(name=>name.slice(0,-suffix.length)).join('|')+')'+suffix);
 }
 return '(?i)^(?!(?:'+reserved.join('|')+')$)';
}));
const googleGroupIndex=groupRows.findIndex(row=>row.startsWith('谷歌服务 = '));
const videoSelector=groupRows.find(row=>row.startsWith('Netflix = '));
assert.ok(googleGroupIndex>=0&&videoSelector,'Missing Shadowrocket selector template');
const driveSelector=groupRows[googleGroupIndex].replace(/^谷歌服务 /,'Google Drive ');
groupRows.splice(googleGroupIndex+1,0,videoSelector.replace(/^Netflix /,'YouTube '),driveSelector);
const groups=groupRows.map(row=>{
 const [name,options]=row.split(' = ',2);
 const publicGroup=name==='高纯净度AI用'||name==='高网速视频用';
 if(!publicGroup&&!Object.hasOwn(data.selectorDefaults,name))return row;
 const fields=split(options);
 const preferred=publicGroup?'REJECT':data.selectorDefaults[name];
 const selection=fields.findIndex(field=>field.startsWith('policy-select-name='));
 assert.ok(fields[0]==='select'&&fields.indexOf(preferred)>0&&selection>0,name);
 fields[selection]='policy-select-name='+(manualLabels.get(preferred)||preferred);
 if(publicGroup){
  assert.equal(fields[1],'REJECT',name);
  fields.splice(2,0,'DIRECT');
  return name+' = '+fields.map(field=>manualLabels.get(field)||field).join(',');
 }
 const ai=fields.indexOf('高纯净度AI用'),video=fields.indexOf('高网速视频用');
 assert.ok(ai>0&&video>0,name);
 if(video<ai)[fields[ai],fields[video]]=[fields[video],fields[ai]];
 if(!fields.includes('DIRECT'))fields.splice(Math.max(ai,video)+1,0,'DIRECT');
 if(!fields.includes('REJECT')){
  const position=preferred==='DIRECT'?1:fields.indexOf('DIRECT')+1;
  fields.splice(position,0,'REJECT');
 }
 return name+' = '+fields.map(field=>manualLabels.get(field)||field).join(',');
});
for(const [target,label] of manualLabels)groups.push(label+' = select,'+target+',hidden=1');
const displayRank=new Map(displayPriority.map((name,index)=>[name,index]));
const rank=row=>displayRank.get(row.split(' = ',1)[0])??displayRank.size;
groups.sort((a,b)=>rank(a)-rank(b));
const output=header.join('\n')+'\n\n[General]\n'+general.join('\n')+'\n\n[Proxy Group]\n'+groups.join('\n')+'\n\n[Rule]\n'+rules.join('\n')+'\n\n[Host]\n'+outputHosts.map(([k,v])=>k+' = '+v).join('\n')+'\n';
// Include the dedicated Drive DNS rows and translated selector name filters.
assert.ok(Buffer.byteLength(output)<1804000,'Self-contained DNS budget exceeded');
const file='src/ios/v14.3-shadowrocket.conf';
const contractPath=fs.existsSync(path.resolve(root,'../../CURRENT_RELEASE.json'))?path.resolve(root,'../../docs/需求.md'):local('docs/需求.md');
const manifest={version:'14.3',date:'2026-10-13',revision:'shadowrocket-lean-r1',domesticProtocolRevision:'domestic-protocol-r1',
 status:'GENERATED_NATIVE_ACCEPTANCE_PENDING',file,sha256:crypto.createHash('sha256').update(output).digest('hex'),bytes:Buffer.byteLength(output),
 tailscaleDerpSource:tailscale.source,
 before:{file:sourceFile,sha256:sha(local(sourceFile)),bytes:Buffer.byteLength(oldText)},
 rules:{before:all.length,after:rules.length,removedDuplicateCNRows:removed,removedDominatedLiteralRows:redundantRules,criticalDomesticRules:[...critical]},
 dns:{beforeHostRows:before.config.hosts.length,afterHostRows:outputHosts.length,removedRedundantRows:eliminated.length,
  redundantRowCertificates:eliminated,domesticLiteralKeys:domesticDNSKeys,
  fullBusinessTable:'RETAINED',fullDomesticDNS:'NATIVE_DIRECT_OR_SELECTED_PROXY_REMOTE_RESOLUTION_REQUIRES_DEVICE_ACCEPTANCE',
  standaloneDomesticDNSAffinity:'NOT_NATIVE_VERIFIED'},
 groups:groups.map(r=>r.split(' = ')[0]),sources,
 sourceContract:{file:'docs/需求.md',sha256:sha(contractPath)},
 inputs:['tools/build-shadowrocket-lean.cjs','tools/lib/tailscale-policy.cjs',tailscale.source.file,wechatFile,businessFile,'src/android/v14.3-android-flclash.js','data/rules/embedded-policy.json',prefix+'manifest.json',prefix+'metadata/shadowrocket-sources.json',prefix+'data/rule-sources.lock.json'].map(file=>({file,sha256:sha(local(file))})),
 clientDeployment:false,nativeCompilation:'NOT_RUN',nativeDNSAffinity:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
const text=JSON.stringify(manifest,null,2)+'\n';
if(process.argv.includes('--check')){assert.equal(fs.readFileSync(local(file),'utf8'),output);assert.equal(fs.readFileSync(local('metadata/shadowrocket-lean.json'),'utf8'),text);}
else {fs.writeFileSync(local(file),output);fs.writeFileSync(local('metadata/shadowrocket-lean.json'),text);}
console.log(JSON.stringify({status:'SHADOWROCKET_LEAN_GENERATION_PASS',bytes:manifest.bytes,beforeBytes:manifest.before.bytes,rules:{before:all.length,after:rules.length,removedDominated:redundantRules.length},dnsRows:manifest.dns.afterHostRows,remoteSources:sources.length,nativeAcceptance:'NOT_RUN'}));
