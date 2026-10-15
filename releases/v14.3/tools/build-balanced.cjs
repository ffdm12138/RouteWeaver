'use strict';
// Generate small standalone entries from byte-bound V14.2 routing code.
// Only reviewed literals and safety guards are inline; complete tables are HTTP providers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),local=n=>path.join(root,n),read=n=>JSON.parse(fs.readFileSync(local(n),'utf8'));
const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(local(n))).digest('hex');
const baseline='validation/inputs/v14.2-baseline/',before=read(baseline+'manifest.json'),lock=read('data/rule-sources.lock.json');
for(const e of before.files)assert.equal(sha(baseline+e.file),e.sha256,'Changed frozen baseline: '+e.file);
const reviewed=read(baseline+'data/rules/embedded-domains.json'),business=read('data/rules/business-services.json'),fullCore=read('data/rules/company-core.json');
const safety=read('data/rules/safety-classifiers.json');
const compatibility=read('metadata/clashmi-compatibility.json');
assert.equal(compatibility.status,'OFFICIAL_SOURCE_REVIEWED_DEVICE_NOT_RUN');
for(const e of compatibility.snapshots)assert.equal(sha(e.file),e.sha256,'Changed official Clash Mi bridge snapshot: '+e.file);
require('./validate-azure-async.cjs')(root,fullCore,business);
require('./validate-cdn-regex.cjs')(root,business);
for(const s of lock.sources){assert.match(s.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);assert.equal(sha(s.file),s.sha256);assert.equal(sha(s.classifier.file),s.classifier.sha256);}
const baselineFixture=require('../validation/inputs/v14.2-baseline/tests/fixture.cjs'),baselineModel=baselineFixture.load('android');
const enhancements={
  'Netflix':['nflxext.com','nflxso.net','nflximg.com','netflix.net'],
  'Spotify':['spotifycdn.com','spotifycdn.net','spotify.net'],
  'Telegram':['cdn-telegram.org','telegram.me','tdesktop.com','telegram-cdn.org'],
  'Discord':['discord.media','discordapp.io','discordcdn.com'],
  'TikTok':['tiktokd.net'],
  'Twitter':['tweetdeck.com'],
  'Meta 服务':['wa.me'],
  'Steam':['steam-chat.com'],
  'Epic Games':['fortnite.com','unrealengine.com'],
  '苹果国际':['apple-dns.cn'],
  '哔哩国际':['b23.tv']
};
const services=JSON.parse(JSON.stringify(business.services)),decisions=[];
services.find(s=>s.name==='微软生态').sets.push('linkedin');
// Upstream OpenAI includes unverified third parties and a broad Azure tenant regex.
// The complete approved OpenAI ownership table is already small and stays inline.
services.find(s=>s.name==='OpenAI 服务').sets=[];
for(const s of services)for(const host of enhancements[s.name]||[]){
  const actual=baselineFixture.route(baselineModel,{host,protocol:'TCP',port:443}).group;
  if(actual===s.name){if(!s.seeds.includes(host))s.seeds.push(host);decisions.push({group:s.name,domain:host,decision:'KEEP_REVIEWED_PARENT'});}
  else decisions.push({group:s.name,domain:host,decision:'OMIT_NOT_IN_REVIEWED_GROUP',actual});
}
const domesticCandidates=['baidu.com','bdstatic.com','bdimg.com','qq.com','qpic.cn','gtimg.com','weixin.qq.com','taobao.com','tmall.com','alicdn.com','alipay.com','jd.com','360buyimg.com','weibo.com','weibo.cn','sina.com.cn','zhihu.com','zhimg.com','163.com','126.com','127.net','netease.com','douban.com','doubanio.com','amap.com','autonavi.com','meituan.com','dianping.com','ele.me','ctrip.com','qunar.com','csdn.net','gitee.com','mi.com','xiaomi.com','10010.com','10086.cn','10086.com','189.cn','iqiyi.com','youku.com','pinduoduo.com','pddpic.com','suning.com','360.cn','360.com','sogou.com','sohu.com','bcebos.com','xiaohongshu.com','xhscdn.com'];
const domestic=[];
for(const host of domesticCandidates){const actual=baselineFixture.route(baselineModel,{host,protocol:'TCP',port:443}).group;if(actual==='国内网站'){domestic.push(host);decisions.push({group:'国内网站',domain:host,decision:'KEEP_REVIEWED_PARENT'});}else decisions.push({group:'国内网站',domain:host,decision:'OMIT_NOT_IN_REVIEWED_GROUP',actual});}
const core={};
for(const [group,rows]of Object.entries(fullCore.groups)){
  if(['OpenAI 服务','Anthropic 服务','公共基础服务'].includes(group)){core[group]=rows.slice();continue;}
  const service=services.find(s=>s.name===group),parents=new Set(service.seeds);
  // Exact third-party tenants preserve the reviewed exception boundaries.
  // Country-domain and acquired-brand inventories stay in the remote full table.
  core[group]=rows.filter(r=>{const[k,h]=r.split(',');return k==='DOMAIN'||k==='DOMAIN-REGEX'||k==='DOMAIN-SUFFIX'&&parents.has(h);});
}
const embedded={
  private:{behavior:'classical',payloadText:reviewed.groups.private.payload.join('\n')},
  'category-doh':{behavior:'classical',payloadText:reviewed.groups['category-doh'].payload.join('\n')},
  cn:{behavior:'domain',payloadText:domestic.map(h=>'+.'+h).join('\n')}
};
const pins=Object.fromEntries(lock.sources.map(s=>[s.url.replace(/\/[a-f0-9]{40}\//,'/meta/'),s.url]));
const selected={version:'14.3',date:'2026-10-12',revision:'balanced-r1',scope:'Reviewed service parent domains, exact CDN/auth/Voice tenants, small private/DoH safety tables and bounded domestic parents; complete domain/IP inventories remain remote',
  domesticProtocolRevision:'domestic-protocol-r1',domesticProtocolAuthorization:'User selected reviewed domestic domain TCP/UDP/DNS following the domestic selector on 2026-10-13; unknown public IP UDP and generic STUN remain protected',
  core,services,embedded,decisions,limits:{maxScriptBytes:131072,maxGeneratedConfigBytes:196608},
  inputs:['data/rules/company-core.json','data/rules/business-services.json','data/rules/domestic-direct.json','data/rules/safety-classifiers.json','data/rule-sources.lock.json',baseline+'manifest.json'].map(file=>({file,sha256:sha(file)}))};
const selectedText=JSON.stringify(selected,null,2)+'\n';
function replaceOnce(code,needle,value){assert.equal(code.split(needle).length,2,'Routing base changed: '+needle.slice(0,100));return code.replace(needle,value);}
function constant(code,name,value,end){const pattern=new RegExp('const '+name+' = [\\s\\S]*?\\r?\\n?\\'+end+';');assert.ok(pattern.test(code),name);return code.replace(pattern,()=> 'const '+name+' = '+JSON.stringify(value,null,2)+';');}
const outputs=[];
for(const [platform,input,output]of [['desktop','src/windows/v14.2.js','src/windows/v14.3.js'],['android','src/android/v14.2-android.js','src/android/v14.3-android.js']]){
  let code=fs.readFileSync(local(baseline+input),'utf8').replaceAll('\r\n','\n');
  code=constant(code,'V14_REVIEWED_DOMAINS',embedded,'}');
  code=constant(code,'V14_COMPANY_CORE',core,'}');
  code=constant(code,'V14_SERVICES',services,']');
  code=constant(code,'V14_DIRECT_RULE_PINS',pins,'}');
  code=replaceOnce(code,'version: "14.2"','version: "14.3"');
  code=replaceOnce(code,'const mrs = kind === "ip" || tag === "cn";','const mrs = kind === "ip" || ["cn", "google", "microsoft"].includes(tag);');
  code=replaceOnce(code,'add("RULE-SET," + embeddedDomainSet(tag), policy);','if (V14_REVIEWED_DOMAINS[tag]) add("RULE-SET," + embeddedDomainSet(tag), policy);');
  code=replaceOnce(code,'else for (const tag of service.sets) addDomainSet(tag, policy);','for (const tag of service.sets) addDomainSet(tag, policy);');
  code=replaceOnce(code,'for (const service of V14_SERVICES) if (!coreNames.has(service.name))','for (const service of V14_SERVICES)');
  code=replaceOnce(code,'dnsPolicy["rule-set:" + embeddedDomainSet(tag)] = v14DnsFor(groupName(service.name));','if (V14_REVIEWED_DOMAINS[tag]) dnsPolicy["rule-set:" + embeddedDomainSet(tag)] = v14DnsFor(groupName(service.name));');
  code=replaceOnce(code,'auditRepairRevision: "embedded-domain-r1"','auditRepairRevision: "balanced-r1"');
  code=require('./domestic-protocol.cjs')(code,replaceOnce);
  code=code.replace('hybrid-live-meta-no-local-geo','critical-inline-pinned-full-remote-no-local-geo');
  code=code.replace('// FlClash / Mihomo V14.2 '+(platform==='desktop'?'desktop':'android')+' — 2026-10-10','// Mihomo V14.3 '+platform+' — 2026-10-12; balanced-r1.');
  code='// Small standalone overwrite: critical parents and safety guards inline; complete reviewed rules are remote.\n'+code;
  outputs.push({file:output,code});
}
let mobile=outputs.find(o=>o.file.includes('android')).code;
mobile=replaceOnce(mobile,'function main(input)','function v14ClashMiBase(input)');
let adapter=fs.readFileSync(local('tools/clashmi-adapter.js'),'utf8').replaceAll('\r\n','\n');
adapter=adapter.replace('marker.platformRevision = "clashmi-object-r2"','marker.platformRevision = "domestic-protocol-r1"');
adapter=adapter.replace('iOS 50 MiB VPN memory limit and full embedded-classifier long-run acceptance','iOS VPN memory limit, remote provider cache and long-run acceptance');
const mobileCode='// Clash Mi V14.3 balanced-r1: main(config) returns an OBJECT.\n'+mobile.trimEnd()+'\n\n'+adapter;
outputs.push({file:'src/ios/v14.3-clashmi.js',code:mobileCode},{file:'src/ios/v14.3-clashmi-domestic-protocol-r1.js',code:mobileCode});
const generated=[];
for(const o of outputs){
  assert.ok(Buffer.byteLength(o.code)<=selected.limits.maxScriptBytes,'Script budget exceeded: '+o.file);
  const ctx=vm.createContext({console:{log(){}}});vm.runInContext(o.code,ctx,{timeout:3000});
  const config=JSON.parse(JSON.stringify(ctx.main({proxies:[{name:'Build-only node',type:'socks5',server:'192.0.2.1',port:1080,udp:true}]})));
  assert.equal(typeof config,'object');assert.equal(config['x-v14-generated'].version,'14.3');
  const runtimeNames=config['x-v14-generated'].ruleSources.map(s=>s.name);
  assert.deepEqual(runtimeNames.slice().sort(),lock.sources.filter(s=>s.id!=='v12r-domain-category-doh'||runtimeNames.includes(s.id)).map(s=>s.id).sort(),'Missing full runtime classifier');
  assert.ok(Buffer.byteLength(JSON.stringify(config))<=selected.limits.maxGeneratedConfigBytes,'Generated config budget exceeded');
  generated.push({file:o.file,sha256:crypto.createHash('sha256').update(o.code).digest('hex'),bytes:Buffer.byteLength(o.code),generatedConfigBytes:Buffer.byteLength(JSON.stringify(config)),inlineRows:Object.values(config['rule-providers']).filter(p=>p.type==='inline').reduce((n,p)=>n+p.payload.length,0),remoteSources:config['x-v14-generated'].ruleSources.length});
}
const manifest={version:'14.3',date:'2026-10-12',revision:'balanced-r1',status:'GENERATED_DEVICE_PENDING',limits:selected.limits,entries:generated,
  domesticProtocolRevision:'domestic-protocol-r1',
  baselineManifest:{file:baseline+'manifest.json',sha256:sha(baseline+'manifest.json')},policy:{file:'data/rules/embedded-policy.json',sha256:crypto.createHash('sha256').update(selectedText).digest('hex')},
  inputs:['tools/build-balanced.cjs','tools/domestic-protocol.cjs','tools/clashmi-adapter.js','tools/validate-azure-async.cjs','tools/validate-cdn-regex.cjs','data/rule-sources.lock.json','data/rules/azure-async-review.json','data/rules/cdn-regex-review.json','metadata/clashmi-compatibility.json'].map(file=>({file,sha256:sha(file)})),
  clientDeployment:false,appJavaScriptCore:'NOT_RUN',iOSMemory:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
if(process.argv.includes('--check')){assert.equal(fs.readFileSync(local('data/rules/embedded-policy.json'),'utf8'),selectedText);for(const o of outputs)assert.equal(fs.readFileSync(local(o.file),'utf8'),o.code);assert.equal(fs.readFileSync(local('metadata/balanced-sources.json'),'utf8'),JSON.stringify(manifest,null,2)+'\n');}
else{fs.writeFileSync(local('data/rules/embedded-policy.json'),selectedText);for(const o of outputs)fs.writeFileSync(local(o.file),o.code);fs.writeFileSync(local('metadata/balanced-sources.json'),JSON.stringify(manifest,null,2)+'\n');}
console.log(JSON.stringify({status:'BALANCED_GENERATION_PASS',entries:generated}));
