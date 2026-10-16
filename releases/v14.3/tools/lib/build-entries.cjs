'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function build(root,check){
 const read=n=>fs.readFileSync(path.join(root,n),'utf8'),sha=n=>hash(fs.readFileSync(path.join(root,n)));
 const generated=require('./compile-entries.cjs').compile(root),{policy,vps,entries,inputs}=generated;
 const metadata=[];
 for(const entry of entries){
  const ctx=vm.createContext({console:{log(){}}});vm.runInContext(entry.code,ctx,{timeout:3000});
  const config=JSON.parse(JSON.stringify(ctx.main({proxies:[{name:'Build-only node',type:'socks5',server:'192.0.2.1',port:1080,udp:true}]})));
  assert.ok(config&&typeof config==='object'&&!Array.isArray(config));assert.equal(config['x-v14-generated'].version,'14.3');
  assert.equal(config.ipv6,true);assert.ok(Buffer.byteLength(entry.code)<=131072,entry.file+' script budget');assert.ok(Buffer.byteLength(JSON.stringify(config))<=196608);
  metadata.push({platform:entry.platform,...(entry.client?{client:entry.client}:{}),file:entry.file,sha256:hash(entry.code),bytes:Buffer.byteLength(entry.code),generatedConfigBytes:Buffer.byteLength(JSON.stringify(config)),inlineRows:Object.values(config['rule-providers']).filter(p=>p.type==='inline').reduce((n,p)=>n+p.payload.length,0),remoteSources:config['x-v14-generated'].ruleSources.length});
 }
 const sourceInputs=[...new Set(['tools/build-balanced.cjs','tools/build-macos.cjs','tools/build-clash-verge.cjs','tools/build-network-compat.cjs','tools/lib/build-entries.cjs',...inputs,'tools/validate-azure-async.cjs','tools/validate-cdn-regex.cjs','data/rule-sources.lock.json','data/rules/azure-async-review.json','data/rules/cdn-regex-review.json','metadata/clashmi-compatibility.json'])].map(file=>({file,sha256:sha(file)}));
 const balanced={version:'14.3',date:'2026-10-16',revision:'balanced-r1',runtimeRevision:'shared-runtime-r1',entryRevision:'single-entry-r1',status:'GENERATED_DEVICE_PENDING',limits:policy.selected.limits,
  entries:metadata.filter(e=>['windows','android','clashmi'].includes(e.platform)),...(vps?{vpsDirectRevision:vps.revision}:{}),domesticProtocolRevision:'domestic-protocol-r1',
  baselineManifest:{file:policy.baseline+'manifest.json',sha256:sha(policy.baseline+'manifest.json')},policy:{file:'data/rules/embedded-policy.json',sha256:hash(policy.selectedText)},
  inputs:sourceInputs,clientDeployment:false,appJavaScriptCore:'NOT_RUN',iOSMemory:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
 const mac={version:'14.3',date:'2026-10-16',revision:'macos-r1',runtimeRevision:'shared-runtime-r1',entryRevision:'single-entry-r1',domesticProtocolRevision:'domestic-protocol-r1',status:'MACOS_GENERATED_DEVICE_PENDING',
  entries:metadata.filter(e=>e.platform.startsWith('macos')),scope:'Thin Darwin/NetworkExtension adapters, shared business/DNS/UDP and in-file network mode selection',
  inputs:sourceInputs,clientDeployment:false,flclashMacApp:'NOT_RUN',clashmiMacApp:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
 const verge={revision:'clash-verge-r1',entryRevision:'single-entry-r1',reviewedClientVersion:'2.5.8',reviewedClientCommit:'4337bd85758d54d7b9044b2da3c9ac1176eae1f3',status:'CLASH_VERGE_GENERATED_DEVICE_PENDING',date:'2026-10-16',inputs:sourceInputs,entries:metadata.filter(e=>e.platform==='clashVerge'),nativeClientAcceptance:'NOT_RUN',scope:'Windows Clash Verge Rev; final app-owned settings require independent checks'};
 const sr='src/ios/v14.3-shadowrocket.conf';
 const network={revision:'ipv6-fallback-r2',repairRevision:'http-recovery-r1',entryRevision:'single-entry-r1',date:'2026-10-16',status:'SOURCE_MODELS_NATIVE_DEVICE_PENDING',defaultMode:'dual-stack',compatibilityMode:'ipv4-local',automaticPhysicalNetworkDetection:false,
  option:{field:'x-routeweaver.network-mode',defaultConstant:'ROUTEWEAVER_DEFAULT_NETWORK_MODE',choices:['dual-stack','ipv4-local']},
  inputs:sourceInputs,entries:[...metadata.map(e=>({platform:e.platform,source:e.file,file:e.file,sha256:e.sha256,bytes:e.bytes,modes:['dual-stack','ipv4-local']})),{platform:'shadowrocket',source:sr,file:sr,sha256:sha(sr),bytes:Buffer.byteLength(read(sr)),modes:['native-ipv4-prefer']}],
  shadowrocketLimit:'One native conf with IPv4 preference and IPv6 retained; no equivalent Mihomo upstream filters, hostname recovery or custom core patch',deviceAcceptance:'NOT_RUN'};
 const outputs=[...entries.map(e=>[e.file,e.code]),['data/rules/embedded-policy.json',policy.selectedText],...Object.entries({'metadata/balanced-sources.json':balanced,'metadata/macos-sources.json':mac,'metadata/clash-verge-sources.json':verge,'metadata/network-compat.json':network}).map(([file,value])=>[file,JSON.stringify(value,null,2)+'\n'])];
 for(const [file,code]of outputs){if(check)assert.equal(read(file),code,file);else{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),code);}}
 return {status:'SHARED_SINGLE_ENTRY_GENERATION_PASS',javascriptEntries:entries.length,nativeEntries:1,runtimeRevision:'shared-runtime-r1',mode:'one-file-per-client'};
}
module.exports={build};
