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
// Shadowrocket has no IN-TYPE equivalent: its optional mode rejects real
// IPv6 destinations globally. Do not claim Mihomo-only node options apply.
const source='src/ios/v14.3-shadowrocket.conf',text=read(source),lines=text.split(/\r?\n/);
let at=lines.indexOf('[Rule]');assert.ok(at>=0);
const gate=['# IPv4-local: explicit failure for public literal IPv6; native device acceptance pending.',
 'IP-CIDR6,2000::/3,REJECT,no-resolve','IP-CIDR6,64:ff9b::/96,REJECT,no-resolve'];
// Preserve a leading personal IPv4 exception when present.
at++;while(at<lines.length&&(!lines[at]||lines[at].startsWith('#')))at++;
if(lines[at]&&/^IP-CIDR,[0-9.]+\/32,DIRECT,no-resolve$/.test(lines[at]))at++;
lines.splice(at,0,...gate);
const sr=lines.join('\n').replace(/^prefer-ipv6\s*=.*$/m,'prefer-ipv6 = false');
outputs.push({platform:'shadowrocket',source,file:'src/ios/v14.3-shadowrocket-ipv4-local.conf',text:'# Optional IPv4-local mode. Keep IPv6 VPN capture enabled; real public IPv6 destinations are rejected.\n'+sr});
const inputs=['tools/build-network-compat.cjs','tools/ipv4-local-adapter.js',...pairs.map(p=>p[1]),source];
const manifest={revision:'ipv6-fallback-r1',date:'2026-10-16',status:'SOURCE_MODELS_NATIVE_DEVICE_PENDING',defaultMode:'dual-stack',compatibilityMode:'ipv4-local',automaticPhysicalNetworkDetection:false,inputs:inputs.map(file=>({file,sha256:sha(read(file))})),entries:outputs.map(({text,...item})=>({...item,sha256:sha(text),bytes:Buffer.byteLength(text)})),shadowrocketLimit:'Native rules model only; no IN-TYPE, no claim of Mihomo ip-version defaults, remote literal IPv6 blocked in this optional mode',deviceAcceptance:'NOT_RUN'};
for(const o of outputs){if(process.argv.includes('--check'))assert.equal(read(o.file),o.text,o.file);else fs.writeFileSync(path.join(root,o.file),o.text);}
const file='metadata/network-compat.json',json=JSON.stringify(manifest,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(read(file),json);else fs.writeFileSync(path.join(root,file),json);
console.log(JSON.stringify({status:'NETWORK_COMPAT_GENERATION_PASS',entries:outputs.length}));
