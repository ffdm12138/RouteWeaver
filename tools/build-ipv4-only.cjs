'use strict';
// Separate additive release. Never writes to the existing auto/dual-stack entry.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),target='releases/v14.3-ipv4-only';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=file=>fs.readFileSync(path.join(root,file));
const current=JSON.parse(read('CURRENT_RELEASE.json'));
const check=process.argv.includes('--check');
const runtime=read('tools/ipv4-only-runtime.js').toString('utf8').replaceAll('\r\n','\n');
const inputs=['CURRENT_RELEASE.json','tools/build-ipv4-only.cjs','tools/ipv4-only-runtime.js'];
const entries={};
function emit(file,bytes){
  const dest=path.join(root,file);
  if(check)assert.ok(fs.existsSync(dest)&&read(file).equals(Buffer.from(bytes)),file+' is stale');
  else{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
}
for(const [platform,source]of Object.entries(current.entries)){
  const bytes=read(source),text=bytes.toString('utf8');inputs.push(source);
  const name=path.basename(source).replace(/\.(js|conf)$/,'-ipv4-only.$1'),file=target+'/src/'+path.basename(path.dirname(source))+'/'+name;
  let code;
  if(source.endsWith('.js')){
    assert.equal((text.match(/^function main\(input, profileName\)/gm)||[]).length,1);
    const auto=text.indexOf('// Auto requires a native core implementing auto-local-family-r1.');
    assert.ok(auto>0&&text.indexOf('function main(input, profileName)',auto)>auto,'Network adapter layout changed');
    code='// RouteWeaver IPv4-only standalone entry; ipv4-only-r1.\n'+text.slice(0,auto).replace('const ROUTEWEAVER_DEFAULT_NETWORK_MODE = "auto";','')+
      '\nfunction rw4BaseMain(input, profileName) { return v14IPv4LocalMain(input, profileName); }\n'+
      '\nconst RW4_ACCEPT_SERIALIZED = '+['clashmi','macosClashMi'].includes(platform)+';\n'+runtime;
  }else{
    assert.match(text,/^ipv6 = true$/m);
    code='# IPv4-only variant; node DNS IPv6 MUST also be disabled in Shadowrocket.\n'+
      '# This conf cannot enforce the node transport family; use IPv4-literal nodes.\n'+
      text.replace(/^# auto-local-family-r1:.*\r?\n/m,'').replace(/^ipv6 = true$/m,'ipv6 = false')
        .replace('[Rule]\r\n','[Rule]\r\nIP-CIDR6,::/0,REJECT,no-resolve\r\n').replace('[Rule]\n','[Rule]\nIP-CIDR6,::/0,REJECT,no-resolve\n');
  }
  if(source.endsWith('.js')){
    // Keep readable source inputs intact; omit full-line comments only in the
    // standalone import so every client remains within the 128 KiB budget.
    code='// RouteWeaver IPv4-only standalone entry; ipv4-only-r1.\n'+code.replace(/^[\t ]*\/\/[^\r\n]*(?:\r?\n|$)/gm,'');
    assert.ok(Buffer.byteLength(code)<=131072,file+' exceeds 128 KiB');
  }
  emit(file,code);
  entries[platform]={file,sha256:sha(code),bytes:Buffer.byteLength(code),source,sourceSHA256:sha(bytes),
    status:platform==='shadowrocket'?'CONFIG_ONLY_NODE_IPV4_PINNING_AND_DEVICE_CHECK_REQUIRED':'GENERATED_NATIVE_REPLAY_DEVICE_PENDING'};
}
// Do not bind the entire mutable root manifest. Bind its entry map, and the
// actual immutable source bytes, so adding this variant never invalidates rc.6.
const sourceInputs=inputs.filter(file=>file!=='CURRENT_RELEASE.json').map(file=>({file,sha256:sha(read(file))}));
const manifest={version:'14.3-ipv4-only',revision:'ipv4-only-r1',date:'2026-10-17',
  flavor:current.vpsDirectRevision?'personal':'public',baseVersion:current.version,
  requestedScope:'IPv4 local DIRECT and local connection to proxies; proxy onward family unconstrained',
  entryMapSHA256:sha(JSON.stringify(current.entries)),entries,inputs:sourceInputs,
  systemDNS:'SYSTEM_DNS_MUST_BE_IPV4_OR_CONFIGURE_x-routeweaver.ipv4-lan-dns',
  deviceAcceptance:'NOT_RUN',clientDeployment:false,originalEntriesModified:false};
emit(target+'/MANIFEST.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'IPV4_ONLY_GENERATION_PASS',flavor:manifest.flavor,entries:Object.keys(entries).length,check}));
