'use strict';
// Add Mac entries to the unchanged, byte-bound domestic-protocol-r1 release.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),local=n=>path.join(root,n),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),sha=n=>hash(fs.readFileSync(local(n)));
cp.execFileSync(process.execPath,[local('tools/build-balanced.cjs'),'--check'],{cwd:root,windowsHide:true});
const original=JSON.parse(fs.readFileSync(local('metadata/balanced-sources.json'),'utf8'));
for(const e of original.entries)assert.equal(sha(e.file),e.sha256,e.file);
function replaceOnce(code,needle,value){assert.equal(code.split(needle).length,2,'Base changed: '+needle);return code.replace(needle,value);}
let desktop=fs.readFileSync(local('src/windows/v14.3.js'),'utf8');
desktop=replaceOnce(desktop,'function main(input)','function v14MacOSBase(input)');
desktop=replaceOnce(desktop,'priorMarker.platform === "desktop"','["desktop", "macos-flclash"].includes(priorMarker.platform)');
desktop=replaceOnce(desktop,'// Mihomo V14.3 desktop — 2026-10-12; balanced-r1.','// Mihomo V14.3 macOS / FlClash — 2026-10-14; domestic-protocol-r1 / macos-r1.');
const commentStart=desktop.indexOf('  // FlClash 0.8.99 exposes no strict-route field');
const commentEnd=desktop.indexOf('  config.tun["strict-route"] = true;',commentStart);
assert.ok(commentStart>=0&&commentEnd>commentStart);
desktop=desktop.slice(0,commentStart)+'  // Retain the desktop strict-route setting; Darwin capture requires device QA.\n'+desktop.slice(commentEnd);
const flclash=desktop.trimEnd()+'\n\n'+fs.readFileSync(local('tools/macos-flclash-adapter.js'),'utf8').replaceAll('\r\n','\n');
// Clash Mi uses the shared Apple NetworkExtension path on both iOS and macOS.
// Keep its known object bridge and all routing/DNS/UDP literals byte-equivalent.
let clashmi=fs.readFileSync(local('src/ios/v14.3-clashmi.js'),'utf8');
clashmi=replaceOnce(clashmi,'// Clash Mi V14.3 balanced-r1: main(config) returns an OBJECT.','// Clash Mi macOS V14.3: main(config) returns an OBJECT; macos-r1.');
clashmi=replaceOnce(clashmi,'marker.platform = "clashmi-ios"','marker.platform = "clashmi-macos"');
clashmi=replaceOnce(clashmi,'marker.platformRevision = "domestic-protocol-r1"','marker.platformRevision = "macos-r1"');
clashmi=replaceOnce(clashmi,'iOS VPN memory limit, remote provider cache and long-run acceptance','macOS NetworkExtension, remote provider cache and long-run acceptance');
clashmi=clashmi.replaceAll('iOS','macOS');
const outputs=[{client:'FlClash',file:'src/macos/v14.3-macos-flclash.js',code:flclash},{client:'Clash Mi',file:'src/macos/v14.3-macos-clashmi.js',code:clashmi}];
const entries=[];
for(const o of outputs){
  const ctx=vm.createContext({console:{log(){}}});vm.runInContext(o.code,ctx,{filename:o.file,timeout:3000});
  const value=ctx.main({proxies:[{name:'Build-only node',type:'socks5',server:'192.0.2.1',port:1080,udp:true}]});
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
  const config=JSON.parse(JSON.stringify(value));
  assert.equal(config['x-v14-generated'].domesticProtocolRevision,'domestic-protocol-r1');
  assert.ok(Buffer.byteLength(o.code)<=131072);assert.ok(Buffer.byteLength(JSON.stringify(config))<=196608);
  entries.push({client:o.client,file:o.file,sha256:hash(o.code),bytes:Buffer.byteLength(o.code),generatedConfigBytes:Buffer.byteLength(JSON.stringify(config)),inlineRows:Object.values(config['rule-providers']).filter(p=>p.type==='inline').reduce((n,p)=>n+p.payload.length,0),remoteSources:config['x-v14-generated'].ruleSources.length});
}
const manifest={version:'14.3',date:'2026-10-14',revision:'macos-r1',domesticProtocolRevision:'domestic-protocol-r1',status:'MACOS_GENERATED_DEVICE_PENDING',entries,
  scope:'FlClash Darwin utun adapter and Clash Mi Apple NetworkExtension adapter; business rules, DNS, UDP, selectors and pinned sources inherited unchanged',
  inputs:['tools/build-macos.cjs','tools/macos-flclash-adapter.js','metadata/balanced-sources.json','metadata/clashmi-compatibility.json','src/windows/v14.3.js','src/ios/v14.3-clashmi.js'].map(file=>({file,sha256:sha(file)})),
  officialReferences:[{url:'https://raw.githubusercontent.com/MetaCubeX/mihomo/v1.19.31/listener/sing_tun/server.go',finding:'CalculateInterfaceName selects a free utun index on Darwin; file-descriptor path gets the actual native tunnel name'},
    {url:'https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/local_services/vpn_service.dart',finding:'macOS uses Apple VPN service and application-level include_all_networks/enforce_routes settings'},
    {url:'https://github.com/KaringX/clashmi/blob/f897cbddffb59a4d7f4b667c3659e5d77a15fea7/lib/app/modules/clash_setting_manager.dart',finding:'Apple platforms use gvisor/mips; final TUN patch comes from application settings'},
    {url:'https://wiki.metacubex.one/config/inbound/tun/',finding:'macOS needs utun; LAN DNS hijacking and physical-device capture need separate verification'}],
  clientDeployment:false,flclashMacApp:'NOT_RUN',clashmiMacApp:'NOT_RUN',deviceAcceptance:'NOT_RUN'};
const text=JSON.stringify(manifest,null,2)+'\n';
if(process.argv.includes('--check')){for(const o of outputs)assert.equal(fs.readFileSync(local(o.file),'utf8'),o.code);assert.equal(fs.readFileSync(local('metadata/macos-sources.json'),'utf8'),text);}
else{for(const o of outputs){fs.mkdirSync(path.dirname(local(o.file)),{recursive:true});fs.writeFileSync(local(o.file),o.code);}fs.writeFileSync(local('metadata/macos-sources.json'),text);}
console.log(JSON.stringify({status:'MACOS_GENERATION_PASS',entries}));
