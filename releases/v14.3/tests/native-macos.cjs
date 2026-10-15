'use strict';
// Reuse the maintained real-core harnesses with the two actual Mac entries.
// Only owned loopback processes run; TUN execution and Mac apps remain NOT_RUN.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),f=require('./macos-fixture.cjs');
assert.ok(process.argv[2]&&process.argv[3],'Provide Mihomo and OpenSSL');
const core=path.resolve(process.argv[2]),openssl=path.resolve(process.argv[3]),home=f.newExperiment('macos-core');
fs.mkdirSync(path.join(home,'validation'));
fs.writeFileSync(path.join(home,'fixture.cjs'),`'use strict';
const fs=require('node:fs'),path=require('node:path'),base=require(${JSON.stringify(f.local('tests/macos-fixture.cjs'))});
module.exports={...base,local:n=>n.startsWith('validation/')?path.join(__dirname,n):base.local(n),newExperiment:kind=>fs.mkdtempSync(path.join(__dirname,kind+'-')),captureExperiment:(p,kind)=>base.captureExperiment(p,'macos-'+kind)};
`);
for(const file of ['cases.cjs','dns-relay-labels.cjs'])fs.copyFileSync(f.local('tests/'+file),path.join(home,file));
const kinds=['routing','dns-egress','selectors','inbound-guard'],statuses={routing:'CORE_ROUTING_PASS','dns-egress':'CORE_DNS_EGRESS_PASS',selectors:'CORE_MANUAL_SELECTORS_PASS','inbound-guard':'CORE_INBOUND_GUARD_PASS'};
for(const kind of kinds){
  let source=fs.readFileSync(f.local('tests/native-'+kind+'.cjs'),'utf8');assert.equal(source.split("['desktop','android']").length,2);
  source=source.replace("['desktop','android']","['macos-flclash','macos-clashmi']");
  if(kind==='dns-egress'){
    const start=source.indexOf("      await restartFake(filtered.filter(s=>s!=='api.openai.com'));"),end=source.indexOf("      for(const selection of ['高纯净度AI用','高网速视频用','DIRECT'])",start);
    assert.ok(start>=0&&end>start);source=source.slice(0,start)+"      report.historicalPreFixFakeIPv6Counterexample='NOT_RUN_CURRENT_CONTRACT; prior failed evidence preserved';\n"+source.slice(end);
  }
  fs.writeFileSync(path.join(home,'native-'+kind+'.cjs'),source);
}
const sourceNames=['tests/native-macos.cjs','tests/macos-fixture.cjs','tests/fixture.cjs','tests/cases.cjs','tests/dns-relay-labels.cjs','data/rule-sources.lock.json','data/rules/embedded-policy.json',...Object.values(f.entries),...kinds.map(k=>'tests/native-'+k+'.cjs')];
const report={version:'14.3',date:'2026-10-14',revision:'macos-r1',domesticProtocolRevision:'domestic-protocol-r1',status:'RUNNING',
  scope:'Actual two Mac JS outputs parsed and executed by owned Windows Mihomo loopback: TCP/UDP, A/AAAA DNS, selectors, node failure and inbound guards. TUN execution, FlClash/Clash Mi macOS final merge, NetworkExtension and public IPv6 NOT_RUN.',
  coreSHA256:f.sha(core),coreVersion:cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim(),runs:[],harnesses:[],sourceFiles:sourceNames.map(file=>({file,sha256:f.sha(f.local(file))})),clientDeployment:false,deviceAcceptance:'NOT_RUN'};
try{
  for(const kind of kinds){
    const run=cp.spawnSync(process.execPath,[path.join(home,'native-'+kind+'.cjs'),core,...(kind==='dns-egress'?[openssl]:[])],{cwd:f.root,encoding:'utf8',windowsHide:true,timeout:300000});
    fs.writeFileSync(path.join(home,kind+'-run.log'),(run.stdout||'')+(run.stderr||''));console.log((run.stdout||'').trim());
    assert.equal(run.status,0,run.stderr||run.error?.message);
    const receipt=JSON.parse(fs.readFileSync(path.join(home,'validation/native-'+kind+'.json'),'utf8'));assert.equal(receipt.status,statuses[kind]);
    assert.deepEqual([...new Set(receipt.platforms.map(p=>p.platform))],['macos-flclash','macos-clashmi']);report.runs.push({kind,receipt});
  }
  report.status='MACOS_LOCAL_CORE_PASS_DEVICE_PENDING';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e.message);}
report.harnesses=['fixture.cjs','cases.cjs','dns-relay-labels.cjs',...kinds.map(k=>'native-'+k+'.cjs')].map(file=>({file,sha256:f.sha(path.join(home,file)),source:fs.readFileSync(path.join(home,file),'utf8')}));
report.home=f.captureExperiment(home,'macos-core');fs.writeFileSync(f.local('validation/macos-core.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,runs:report.runs.map(r=>({kind:r.kind,cases:r.receipt.platforms.map(p=>({platform:p.platform,cases:p.cases}))})),deviceAcceptance:'NOT_RUN',error:report.error}));
