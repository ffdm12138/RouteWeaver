'use strict';
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const f=require('./macos-fixture.cjs'),base=require('./fixture.cjs'),index=require('./domain-index.cjs'),cases=require('./cases.cjs').cases;
const report={version:'14.3',date:'2026-10-14',revision:'macos-r1',domesticProtocolRevision:'domestic-protocol-r1',status:'RUNNING',scope:'Exact routing/DNS/selector/provider equivalence to current Windows/iOS entries, finite complete domains, upgrade/idempotence and platform guards; Mac apps/TUN NOT_RUN',checks:[],failures:[],platforms:[],sourceFiles:[],clientDeployment:false,deviceAcceptance:'NOT_RUN'};
function check(name,fn){try{fn();report.checks.push(name);}catch(e){report.failures.push({name,error:e.stack});}}
check('deterministic-generation-size-and-source-binding',()=>{
  cp.execFileSync(process.execPath,[f.local('tools/build-macos.cjs'),'--check'],{cwd:f.root,windowsHide:true});
  const manifest=JSON.parse(fs.readFileSync(f.local('metadata/macos-sources.json'),'utf8'));
  for(const e of [...manifest.inputs,...manifest.entries])assert.equal(f.sha(f.local(e.file)),e.sha256,e.file);
  for(const e of manifest.entries){const code=fs.readFileSync(f.local(e.file),'utf8');assert.ok(e.bytes<=131072&&e.generatedConfigBytes<=196608);assert.ok(!/\brequire\s*\(|\bfetch\s*\(|\bsetInterval\s*\(/.test(code));new vm.Script(code);}
});
for(const platform of Object.keys(f.entries)){
  const reference=base.load(platform==='macos-flclash'?'desktop':'clashmi'),model=f.load(platform),metrics={platform,fullInventoryHosts:0,normalRouting:0,normalDNS:0,existingCases:0};
  check(platform+':exact-business-DNS-UDP-selectors-and-fixed-provider-equivalence',()=>{
    const current=structuredClone(model.config),before=structuredClone(reference.config);
    for(const c of [current,before]){delete c.tun;delete c['x-v14-generated'];}
    assert.deepEqual(current,before);
    assert.equal(model.config['proxy-groups'].length,26);
    for(const name of ['高纯净度AI用','高网速视频用']){const group=model.config['proxy-groups'].find(g=>g.name===name);assert.equal(group.type,'select');assert.ok(!group.proxies.includes('DIRECT'));assert.equal(group['default-selected'],'REJECT');}
  });
  check(platform+':complete-reviewed-domain-inventory-and-existing-failure-cases',()=>{
    const hosts=new Set(['api.openai.com','gemini.google.com','szfile.weixin.qq.com','mmbiz.qpic.cn','crixet.com','51drv.com','stun.audit.cn','unknown.audit.net']);
    for(const rows of reference.sources.values())for(const row of rows){const[k,h]=f.split(row);if(k==='DOMAIN'||k==='DOMAIN-SUFFIX'){hosts.add(h);hosts.add('mac-probe.'+h);}}
    const a=index.indexRoute(reference),b=index.indexRoute(model),ad=index.indexDNS(reference),bd=index.indexDNS(model);
    const observed=x=>JSON.parse(JSON.stringify(x));
    for(const host of hosts){assert.deepEqual(observed(b(host)),observed(a(host)),host);assert.deepEqual(observed(bd(host)),observed(ad(host)),host);metrics.normalRouting++;metrics.normalDNS++;}
    metrics.fullInventoryHosts=hosts.size;
    for(const test of cases){assert.deepEqual(f.route(model,test.flow,test.options),base.route(reference,test.flow,test.options),test.name);if(test.flow.host)assert.deepEqual(f.dnsPolicyFor(model,test.flow.host),base.dnsPolicyFor(reference,test.flow.host),test.name);metrics.existingCases++;}
  });
  check(platform+':cold-and-partial-provider-business-equivalence',()=>{
    for(const mode of ['empty','partial']){const sources=new Map(model.sources);for(const name of sources.keys())if(name.startsWith('v12r-domain-')&&(mode==='empty'||!name.endsWith('-cn')))sources.set(name,[]);
      const mac={...model,sources},ref={...reference,sources};
      for(const test of cases){assert.deepEqual(f.route(mac,test.flow,test.options),base.route(ref,test.flow,test.options),test.name);if(test.flow.host)assert.deepEqual(f.dnsPolicyFor(mac,test.flow.host),base.dnsPolicyFor(ref,test.flow.host),test.name);}
    }
  });
  check(platform+':three-pass-idempotence-and-existing-release-upgrades',()=>{
    const now=f.generate(platform);assert.deepEqual(f.generate(platform,now),now);assert.deepEqual(f.generate(platform,f.generate(platform,now)),now);
    const previous=base.generate(platform==='macos-flclash'?'desktop':'clashmi');assert.deepEqual(f.generate(platform,previous),now);
    for(const name of ['desktop','desktop13','android','android13']){const input=JSON.parse(fs.readFileSync(f.local('tests/fixtures/upgrade-'+name+'.json'),'utf8'));const once=f.generate(platform,input);assert.deepEqual(f.generate(platform,once),once,name);}
  });
  check(platform+':client-specific-tunnel-object-bridge-and-input-immutability',()=>{
    const input={proxies:[{name:'Mac synthetic node',type:'socks5',server:'192.0.2.1',port:1080,udp:true}],tun:{enable:false,'auto-route':false,device:'Mihomo','file-descriptor':123,'auto-redirect':true,'include-package':['test.synthetic.app'],'route-exclude-address':['fc00::/7']},extension:{tun:{excludeLocalNetworks:true}},'interface-name':'Ethernet','routing-mark':123,android:true};
    const frozen=structuredClone(input),config=f.generate(platform,input);assert.deepEqual(input,frozen);
    assert.equal(config.ipv6,true);assert.equal(config.dns.ipv6,true);assert.deepEqual(config.tun['route-address'],['0.0.0.0/0','::/0']);assert.ok(config.tun['dns-hijack'].includes('any:53')&&config.tun['dns-hijack'].includes('tcp://any:53'));assert.ok(!config.extension&&!config['routing-mark']);
    if(platform==='macos-flclash'){assert.equal(config.tun.enable,false);assert.equal(config.tun['auto-route'],false);assert.equal(config.tun['auto-detect-interface'],true);assert.ok(!config.tun.device&&!config.tun['file-descriptor']&&!config.tun['include-package']&&!config.android);const valid=f.generate(platform,{...input,tun:{enable:true,'auto-route':true,device:'utun23',stack:'mixed'},'interface-name':'en0'});assert.equal(valid.tun.device,'utun23');assert.equal(valid['interface-name'],'en0');assert.equal(valid.tun.enable,true);}
    else{assert.equal(config.tun.enable,true);assert.equal(config.tun.stack,'gvisor');assert.equal(config.tun.mtu,1280);assert.equal(config.tun['auto-detect-interface'],false);assert.ok(!config.tun.device&&!config.tun['file-descriptor']);assert.equal(config['x-v14-generated'].platform,'clashmi-macos');assert.deepEqual(f.generate(platform,JSON.stringify(input)),config);}
    assert.deepEqual(f.generate(platform,config),config);
  });
  report.platforms.push(metrics);console.log(JSON.stringify(metrics));
}
const manifest=JSON.parse(fs.readFileSync(f.local('metadata/macos-sources.json'),'utf8'));
report.sourceFiles=[...new Set(['tests/macos-static.cjs','tests/macos-fixture.cjs','tests/fixture.cjs','tests/domain-index.cjs','tests/cases.cjs','data/rule-sources.lock.json','metadata/macos-sources.json',...manifest.inputs.map(e=>e.file),...manifest.entries.map(e=>e.file)])].map(file=>({file,sha256:f.sha(f.local(file))}));
report.status=report.failures.length?'FAIL':'MACOS_STATIC_PASS';fs.writeFileSync(f.local('validation/macos-static.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures}));if(report.failures.length)process.exitCode=1;
