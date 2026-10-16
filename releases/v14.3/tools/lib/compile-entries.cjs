'use strict';
// Build-time compiler: reviewed policy -> shared functions -> client adapter -> network mode.
// Generated scripts perform no filesystem access and require no package at runtime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {render}=require('./render-runtime.cjs');
function replaceOnce(code,needle,value){assert.equal(code.split(needle).length,2,'Client adapter anchor: '+needle);return code.replace(needle,value);}
function renameMain(code,name){assert.equal((code.match(/^function main\(input(?:, profileName)?\)/gm)||[]).length,1);return code.replace('function main(','function '+name+'(');}
function networkModes(raw,adapter,acceptSerializedInput=false,autoAdapter=""){
 const base=renameMain(raw,'v14NetworkModeBase');
 const compat=renameMain(adapter,'v14IPv4LocalMain');
 return '// One current entry; set the default below, or use x-routeweaver.network-mode in the input. Auto requires the matching native core; JS alone cannot inspect physical egress.\n'+
  'const ROUTEWEAVER_DEFAULT_NETWORK_MODE = "auto";\n'+base.trimEnd()+'\n\n'+compat.trimEnd()+'\n\n'+autoAdapter.trimEnd()+`\n
function main(input, profileName) {
${acceptSerializedInput?'  if (typeof input === "string") { try { input = JSON.parse(input); } catch (_) { v14Fail("Clash Mi JSON 输入无效。"); } }\n':''}  if (!v14Object(input)) v14Fail("覆写输入必须是配置对象。");
  const options = v14Object(input["x-routeweaver"]) ? input["x-routeweaver"] : {};
  const prior = v14Object(input["x-v14-generated"]) ? input["x-v14-generated"] : {};
  const mode = options["network-mode"] ||
    (prior.version === V14.version && ["auto", "dual-stack", "ipv4-local"].includes(prior.networkMode) ? prior.networkMode : ROUTEWEAVER_DEFAULT_NETWORK_MODE);
  if (!["auto", "dual-stack", "ipv4-local"].includes(mode)) v14Fail("network-mode 仅支持 auto、dual-stack 或 ipv4-local。");
  if (mode === "auto") return v14AutoLocalMain(input, profileName);
  const config = mode === "ipv4-local" ? v14IPv4LocalMain(input, profileName) : v14NetworkModeBase(input, profileName);
  delete config["routeweaver-local-family"];
  return config;
}
`;
}
function compile(root){
 const read=n=>fs.readFileSync(path.join(root,n),'utf8');
 const policy=require('./reviewed-policy.cjs')(root),{core,services,embedded,pins}=policy;
 const directFile='data/rules/manual-direct-ip.json';
 const vps=fs.existsSync(path.join(root,directFile))?JSON.parse(read(directFile)):null;
 if(vps)assert.equal(vps.rule,'IP-CIDR,'+vps.address+',DIRECT,no-resolve');
 const values={CORE:JSON.stringify(core,null,2),SERVICES:JSON.stringify(services,null,2),EMBEDDED:JSON.stringify(embedded,null,2),PINS:JSON.stringify(pins,null,2),
  DIRECT_RULE_INITIALIZER:vps?'  // Explicit user-authorized IPv4 exception, all protocols/ports, before all other rules.\n  const rules = ['+JSON.stringify(vps.rule)+', "DOMAIN,v14-runtime-check.invalid,REJECT"], emitted = new Set(['+JSON.stringify('IP-CIDR,'+vps.address+',no-resolve')+']);':'  const rules = ["DOMAIN,v14-runtime-check.invalid,REJECT"], emitted = new Set();',
  DIRECT_RULE_MARKER:vps?', vpsDirectRevision: '+JSON.stringify(vps.revision):''};
 const inputs=['tools/lib/compile-entries.cjs','tools/lib/render-runtime.cjs','tools/lib/reviewed-policy.cjs','tools/clashmi-adapter.js','tools/macos-flclash-adapter.js','tools/clash-verge-adapter.js','tools/ipv4-local-adapter.js','tools/auto-local-adapter.js','data/client-capabilities.json',...(vps?[directFile]:[])];
 const shared={};
 for(const platform of ['desktop','android']){
  const file='runtime/platforms/'+platform+'/layout.json',layout=JSON.parse(read(file));inputs.push(file,layout.preamble);
  let code=render(read(layout.preamble),values);
  for(const part of layout.functions){inputs.push(part.file);code+=render(part.before,values)+render(read(part.file),values);}
  shared[platform]=code+layout.trailing;
 }
 let bridge=read('tools/clashmi-adapter.js').replaceAll('\r\n','\n');
 bridge=bridge.replace('marker.platformRevision = "clashmi-object-r2"','marker.platformRevision = "domestic-protocol-r1"');
 bridge=bridge.replace('iOS 50 MiB VPN memory limit and full embedded-classifier long-run acceptance','iOS VPN memory limit, remote provider cache and long-run acceptance');
 const ios='// Clash Mi V14.3 balanced-r1: main(config) returns an OBJECT.\n'+renameMain(shared.android,'v14ClashMiBase').trimEnd()+'\n\n'+bridge;
 let darwin=renameMain(shared.desktop,'v14MacOSBase');
 darwin=replaceOnce(darwin,'priorMarker.platform === "desktop"','["desktop", "macos-flclash"].includes(priorMarker.platform)');
 darwin=replaceOnce(darwin,'// Mihomo V14.3 desktop — 2026-10-12; balanced-r1.','// Mihomo V14.3 macOS / FlClash — 2026-10-14; domestic-protocol-r1 / macos-r1.');
 const start=darwin.indexOf('  // FlClash 0.8.99 exposes no strict-route field'),end=darwin.indexOf('  config.tun["strict-route"] = true;',start);
 assert.ok(start>=0&&end>start);darwin=darwin.slice(0,start)+'  // Retain the desktop strict-route setting; Darwin capture requires device QA.\n'+darwin.slice(end);
 const macFlClash=darwin.trimEnd()+'\n\n'+read('tools/macos-flclash-adapter.js').replaceAll('\r\n','\n');
 let macClashMi=replaceOnce(ios,'// Clash Mi V14.3 balanced-r1: main(config) returns an OBJECT.','// Clash Mi macOS V14.3: main(config) returns an OBJECT; macos-r1.');
 macClashMi=replaceOnce(macClashMi,'marker.platform = "clashmi-ios"','marker.platform = "clashmi-macos"');
 macClashMi=replaceOnce(macClashMi,'marker.platformRevision = "domestic-protocol-r1"','marker.platformRevision = "macos-r1"');
 macClashMi=replaceOnce(macClashMi,'iOS VPN memory limit, remote provider cache and long-run acceptance','macOS NetworkExtension, remote provider cache and long-run acceptance').replaceAll('iOS','macOS');
 const verge='// Clash Verge Rev Windows adapter; main(config, profileName) returns a config object.\n'+renameMain(shared.desktop,'v14VergeBase').trimEnd()+'\n\n'+read('tools/clash-verge-adapter.js').replaceAll('\r\n','\n');
 const optional=read('tools/ipv4-local-adapter.js').replaceAll('\r\n','\n');
 const entries=[
  {platform:'windows',file:'src/windows/v14.3.js',raw:shared.desktop},
  {platform:'android',file:'src/android/v14.3-android.js',raw:shared.android},
  {platform:'clashmi',file:'src/ios/v14.3-clashmi-domestic-protocol-r1.js',raw:ios},
  {platform:'macosFlClash',client:'FlClash',file:'src/macos/v14.3-macos-flclash.js',raw:macFlClash},
  {platform:'macosClashMi',client:'Clash Mi',file:'src/macos/v14.3-macos-clashmi.js',raw:macClashMi},
  {platform:'clashVerge',file:'src/clash-verge/v14.3-clash-verge.js',raw:verge}
 ].map(entry=>({...entry,code:networkModes(entry.raw,optional,['clashmi','macosClashMi'].includes(entry.platform),read('tools/auto-local-adapter.js'))}));
 return {policy,vps,entries,inputs:[...new Set(inputs)]};
}
module.exports={compile,networkModes,renameMain};
