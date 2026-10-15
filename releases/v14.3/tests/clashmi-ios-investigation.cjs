'use strict';
// Reuse the existing real-core DNS/UDP experiments for the reported iOS entry.
// Only owned loopback processes run; this does not execute iOS or replace a client.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),f=require('./fixture.cjs');
assert.ok(process.argv[2]&&process.argv[3],'Provide Mihomo and OpenSSL');
const core=path.resolve(process.argv[2]),openssl=path.resolve(process.argv[3]),home=f.newExperiment('clashmi-investigation');
fs.mkdirSync(path.join(home,'validation'));
const fixture=`'use strict';
const fs=require('node:fs'),path=require('node:path'),base=require(${JSON.stringify(f.local('tests/fixture.cjs'))});
module.exports={...base,local:n=>n.startsWith('validation/')?path.join(__dirname,n):base.local(n),newExperiment:kind=>fs.mkdtempSync(path.join(__dirname,kind+'-')),captureExperiment:p=>path.relative(base.root,p).replaceAll('\\\\','/')};
`;
fs.writeFileSync(path.join(home,'fixture.cjs'),fixture);
for(const file of ['cases.cjs','dns-relay-labels.cjs'])fs.copyFileSync(f.local('tests/'+file),path.join(home,file));
const kinds=['routing','dns-egress'],report={version:'14.3',date:'2026-10-13',status:'RUNNING',
  scope:'Current Clash Mi JS in owned Windows Mihomo TCP/UDP/DNS A/AAAA and failure tests; TUN is parsed then disabled for execution; iOS JS/final patch/NetworkExtension/public leakage NOT_RUN',
  coreVersion:cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim(),coreSHA256:f.sha(core),
  sourceFiles:[],runs:[],harnesses:[],clientDeployment:false,deviceAcceptance:'NOT_RUN'};
try{
  const config=f.generate('clashmi');
  assert.equal(config['proxy-groups'].length,26);
  assert.equal(config.mode,'rule');assert.equal(config.ipv6,true);
  assert.deepEqual(config.tun['route-address'],['0.0.0.0/0','::/0']);
  assert.deepEqual(config.tun['dns-hijack'],['any:53','tcp://any:53']);
  report.generatedGroups=config['proxy-groups'].map(g=>g.name);
  for(const kind of kinds){
    const original=fs.readFileSync(f.local('tests/native-'+kind+'.cjs'),'utf8');
    assert.equal(original.split("['desktop','android']").length,2);
    const source=original.replace("['desktop','android']","['clashmi']");
    const file=path.join(home,'native-'+kind+'.cjs');fs.writeFileSync(file,source);
    report.harnesses.push({file:path.basename(file),sha256:f.sha(file),source});
    const args=[file,core,...(kind==='dns-egress'?[openssl]:[])];
    const run=cp.spawnSync(process.execPath,args,{cwd:f.root,encoding:'utf8',windowsHide:true,timeout:300000});
    fs.writeFileSync(path.join(home,kind+'-run.log'),(run.stdout||'')+(run.stderr||''));
    console.log((run.stdout||'').trim());
    assert.equal(run.status,0,run.stderr||run.error?.message);
    const receipt=JSON.parse(fs.readFileSync(path.join(home,'validation/native-'+kind+'.json'),'utf8'));
    assert.equal(receipt.status,kind==='routing'?'CORE_ROUTING_PASS':'CORE_DNS_EGRESS_PASS');
    for(const entry of receipt.sourceFiles)assert.equal(f.sha(f.local(entry.file)),entry.sha256);
    report.runs.push({kind,receipt});
  }
  report.status='CLASHMI_OWNED_LOOPBACK_PASS_DEVICE_PENDING';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;console.error(error.message);}
report.sourceFiles=['src/ios/v14.3-clashmi.js','src/ios/v14.3-clashmi-balanced-r1.js','tests/clashmi-ios-investigation.cjs','tests/fixture.cjs','tests/cases.cjs','tests/dns-relay-labels.cjs',...kinds.map(k=>'tests/native-'+k+'.cjs'),'data/rule-sources.lock.json','data/rules/embedded-policy.json'].map(file=>({file,sha256:f.sha(f.local(file))}));
report.home=path.relative(f.root,home).replaceAll('\\','/');
fs.writeFileSync(path.join(home,'proof.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(f.local('validation/clashmi-ios-investigation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,groups:report.generatedGroups?.length,runs:report.runs.map(r=>({kind:r.kind,cases:r.receipt.platforms.reduce((n,p)=>n+p.cases,0)})),deviceAcceptance:'NOT_RUN',error:report.error}));
