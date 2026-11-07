'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),release=JSON.parse(fs.readFileSync(path.join(root,'CURRENT_RELEASE.json')));
const index=require(path.join(root,'releases/v14.3/tests/domain-index.cjs'));
const refAt=process.argv.indexOf('--source-ref'),ref=refAt>=0?process.argv[refAt+1]:null;
const sources={},checks=[],failures=[];const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const entries of [release.entries,release.variants['ipv4-only'].entries])for(const file of Object.values(entries).filter(p=>p.endsWith('.js'))){
 const p=path.join(root,file),code=ref?require('child_process').execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}):fs.readFileSync(p,'utf8');sources[file]=crypto.createHash('sha256').update(code).digest('hex');
 for(const mode of ['auto','dual-stack','ipv4-local']){
  const config=JSON.parse(JSON.stringify(vm.runInNewContext(code+'\nmain({proxies:[{name:"Synthetic",type:"socks5",server:"127.0.0.1",port:1080,udp:true}],"x-routeweaver":{"network-mode":'+JSON.stringify(mode)+'}})',{console:{log(){}}})));
  const providers=new Map(Object.entries(config['rule-providers']).map(([name,v])=>[name,v.type!=='inline'?[]:v.behavior==='domain'?v.payload.map(x=>x.startsWith('+.')?'DOMAIN-SUFFIX,'+x.slice(2):'DOMAIN,'+x):v.payload]));
  const model={platform:'desktop',config,sources:providers};
  const actual=index.indexDNS(model)('api.openai.com');
  if(mode==='ipv4-local'||file.includes('v14.3-ipv4-only/')){
   assert.equal(config.dns['nameserver-policy']['api.openai.com'],undefined);assert.deepEqual(actual.groups,['OpenAI 服务']);checks.push(file+':'+mode+':fake-ip-preserved');continue;
  }
  try{
  assert.equal(actual.key,'api.openai.com');assert.ok(actual.servers.every(s=>s.startsWith('https://')&&s.includes('#OpenAI 服务')));
  // Reproduce the former insertion-order bug: the earlier company trie wins.
  const policy=config.dns['nameserver-policy'],value=policy['api.openai.com'];delete policy['api.openai.com'];policy['api.openai.com']=value;
  assert.ok(index.indexDNS(model)('api.openai.com').servers.every(s=>s.startsWith('tls://')));
  checks.push(file+':'+mode);
  }catch(error){failures.push({file,mode,key:actual.key,servers:actual.servers,error:error.message});}
 }
}
const result={revision:'domestic-resilience-r1',status:failures.length?'FAIL':'PASS',checks:checks.length+failures.length,failed:failures.length,failures,sourceRef:ref,sources,testSHA256:sha(__filename),modelSHA256:sha(path.join(root,'releases/v14.3/tests/domain-index.cjs')),scope:'Ordered Mihomo policy segments; positive and old-order counterexample. Native transport evidence is separate.'};
const at=process.argv.indexOf('--output');if(at>=0)fs.writeFileSync(path.resolve(process.argv[at+1]),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:result.checks,failed:failures.length}));if(failures.length)process.exitCode=1;
