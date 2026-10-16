'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pairs=[
 ['windows','src/windows/v14.3.js','src/windows/v14.3-ipv4-local.js'],
 ['android','src/android/v14.3-android.js','src/android/v14.3-android-ipv4-local.js'],
 ['clashmi','src/ios/v14.3-clashmi-domestic-protocol-r1.js','src/ios/v14.3-clashmi-ipv4-local.js'],
 ['macosFlClash','src/macos/v14.3-macos-flclash.js','src/macos/v14.3-macos-flclash-ipv4-local.js'],
 ['macosClashMi','src/macos/v14.3-macos-clashmi.js','src/macos/v14.3-macos-clashmi-ipv4-local.js']
];
const adapter=read('tools/ipv4-local-adapter.js').replaceAll('\r\n','\n'),outputs=[];
for(const [platform,source,file]of pairs){const text=read(source);assert.equal(text.split('function main(input)').length,2);outputs.push({platform,source,file,text:'// IPv4-local compatibility entry; choose explicitly for a network without local IPv6 egress.\n'+text.replace('function main(input)','function v14NetworkModeBase(input)')+'\n'+adapter});}
// Shadowrocket has no equivalent for the per-upstream Mihomo filtering and
// tested TLS recovery. Keep only its native IPv4 preference; never advertise
// an equivalent fallback or reject remote IPv6 targets to imitate it.
const source='src/ios/v14.3-shadowrocket.conf',text=read(source);
const sr=text.replace(/^prefer-ipv6\s*=.*$/m,'prefer-ipv6 = false');
outputs.push({platform:'shadowrocket',source,file:'src/ios/v14.3-shadowrocket-ipv4-local.conf',text:'# Limited IPv4 preference only; NOT equivalent to Mihomo IPv4-local recovery. Native acceptance pending.\n'+sr});
const inputs=['tools/build-network-compat.cjs','tools/ipv4-local-adapter.js',...pairs.map(p=>p[1]),source];
const manifest={revision:'ipv6-fallback-r2',repairRevision:'http-recovery-r1',date:'2026-10-16',status:'SOURCE_MODELS_NATIVE_DEVICE_PENDING',defaultMode:'dual-stack',compatibilityMode:'ipv4-local',automaticPhysicalNetworkDetection:false,inputs:inputs.map(file=>({file,sha256:sha(read(file))})),entries:outputs.map(({text,...item})=>({...item,sha256:sha(text),bytes:Buffer.byteLength(text)})),shadowrocketLimit:'Native IPv4 preference only; no claim of equivalent Mihomo upstream filters, HTTP/TLS/QUIC recovery or node ip-version defaults; no added IPv6 reject rules',deviceAcceptance:'NOT_RUN'};
for(const o of outputs){if(process.argv.includes('--check'))assert.equal(read(o.file),o.text,o.file);else fs.writeFileSync(path.join(root,o.file),o.text);}
const file='metadata/network-compat.json',json=JSON.stringify(manifest,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(read(file),json);else fs.writeFileSync(path.join(root,file),json);
console.log(JSON.stringify({status:'NETWORK_COMPAT_GENERATION_PASS',entries:outputs.length}));
