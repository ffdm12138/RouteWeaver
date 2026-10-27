'use strict';
// Run owned loopback cores against actual generated configs for all three JS clients.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),f=require('./fixture.cjs');
assert.ok(process.argv[2]&&process.argv[3],'Provide Mihomo and OpenSSL');
const core=path.resolve(process.argv[2]),openssl=path.resolve(process.argv[3]),home=f.newExperiment('balanced-core'),validation=path.join(home,'validation');fs.mkdirSync(validation);
fs.writeFileSync(path.join(home,'fixture.cjs'),`'use strict';
const fs=require('node:fs'),path=require('node:path'),base=require(${JSON.stringify(f.local('tests/fixture.cjs'))});
module.exports={...base,local:n=>n.startsWith('validation')?path.join(__dirname,n):base.local(n),newExperiment:kind=>fs.mkdtempSync(path.join(__dirname,kind+'-')),captureExperiment:(p,kind)=>base.captureExperiment(p,'balanced-'+kind)};
`);
for(const file of ['cases.cjs','dns-relay-labels.cjs','native-controller.cjs'])fs.copyFileSync(f.local('tests/'+file),path.join(home,file));
const kinds=['routing','dns-egress','selectors','inbound-guard'];
for(const kind of kinds){let source=fs.readFileSync(f.local('tests/native-'+kind+'.cjs'),'utf8');assert.equal(source.split("['desktop','android']").length,2);source=source.replace("['desktop','android']","['desktop','android','clashmi']");
 if(kind==='dns-egress'&&process.argv.includes('--current-contract')){
  const start=source.indexOf("      await restartFake(filtered.filter(s=>s!=='api.openai.com'));"),end=source.indexOf("      for(const selection of ['高纯净度AI用','高网速视频用','DIRECT'])",start);
  assert.ok(start>=0&&end>start);
  source=source.slice(0,start)+"      report.historicalPreFixFakeIPv6Counterexample='NOT_RUN_CURRENT_CONTRACT; prior FAILED attempt preserved in archive';\n"+source.slice(end);
 }
 fs.writeFileSync(path.join(home,'native-'+kind+'.cjs'),source);
}
const report={version:'14.3',date:'2026-10-12',revision:'balanced-r1',status:'RUNNING',scope:'Source, production config parse and owned loopback Mihomo routing/DNS/selectors/inbounds; execution disables TUN; native iOS JS/VPN/public IPv6 and memory NOT_RUN',coreSHA256:f.sha(core),coreVersion:cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim(),clientDeployment:false,runs:[],sourceFiles:[]};
if(process.argv.includes('--current-contract')){report.date='2026-10-13';report.domesticProtocolRevision='domestic-protocol-r1';report.historicalPreFixCounterexample='NOT_RUN; prior failed evidence preserved';report.scope+='; current API public A/AAAA still tested; IPv6 node/transport observations counted only when preflight passes';}
if(process.argv.includes('--resume')){
  const previousFile='validation/network-review/openssl-config-attempt.json',previous=JSON.parse(fs.readFileSync(f.local(previousFile),'utf8'));
  assert.equal(previous.coreSHA256,report.coreSHA256);
  for(const e of previous.sourceFiles.filter(e=>/^(src|data)\//.test(e.file)))assert.equal(f.sha(f.local(e.file)),e.sha256);
  for(const run of previous.runs){for(const e of run.receipt.sourceFiles)assert.equal(f.sha(f.local(e.file)),e.sha256,'Cannot reuse changed passing experiment: '+e.file);report.runs.push(run);}
  report.reusedIdenticalSourceStages={file:previousFile,sha256:f.sha(f.local(previousFile)),kinds:previous.runs.map(r=>r.kind)};
}
const expectedStatus={routing:'CORE_ROUTING_PASS','dns-egress':'CORE_DNS_EGRESS_PASS',selectors:'CORE_MANUAL_SELECTORS_PASS','inbound-guard':'CORE_INBOUND_GUARD_PASS'};
try{
  for(const kind of kinds){
    if(report.runs.some(r=>r.kind===kind))continue;
    const args=[path.join(home,'native-'+kind+'.cjs'),core,...(kind==='dns-egress'?[openssl]:[])];
    const run=cp.spawnSync(process.execPath,args,{cwd:f.root,encoding:'utf8',windowsHide:true,timeout:300000});
    fs.writeFileSync(path.join(home,kind+'-run.log'),(run.stdout||'')+(run.stderr||''));console.log((run.stdout||'').trim());
    assert.equal(run.status,0,run.stderr||run.error?.message);
    const receipt=JSON.parse(fs.readFileSync(path.join(validation,'native-'+kind+'.json'),'utf8'));
    assert.equal(receipt.status,expectedStatus[kind]);report.runs.push({kind,receipt});
  }
  report.status='BALANCED_LOCAL_CORE_PASS';
}
catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e.message);}
report.sourceFiles=['src/windows/v14.3.js','src/android/v14.3-android.js','src/ios/v14.3-clashmi-domestic-protocol-r1.js','data/rules/embedded-policy.json','data/rule-sources.lock.json','tests/native-core.cjs','tests/fixture.cjs','tests/cases.cjs','tests/dns-relay-labels.cjs','tests/native-controller.cjs',...kinds.map(k=>'tests/native-'+k+'.cjs')].map(file=>({file,sha256:f.sha(f.local(file))}));
report.harnesses=['fixture.cjs','cases.cjs','dns-relay-labels.cjs','native-controller.cjs',...kinds.map(k=>'native-'+k+'.cjs')].map(file=>({file,sha256:f.sha(path.join(home,file)),source:fs.readFileSync(path.join(home,file),'utf8')}));
fs.writeFileSync(path.join(home,'proof.json'),JSON.stringify(report,null,2)+'\n');report.home=f.captureExperiment(home,'balanced-core');fs.writeFileSync(f.local('validation/native-core.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,runs:report.runs.map(r=>({kind:r.kind,cases:r.receipt.platforms.map(p=>({platform:p.platform,cases:p.cases}))})),error:report.error}));
