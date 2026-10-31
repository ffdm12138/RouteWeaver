'use strict';
// Network-free regressions. The same file can run in personal or public source.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'CURRENT_RELEASE.json'),'utf8'));
const variant=JSON.parse(fs.readFileSync(path.join(root,'releases/v14.3-ipv4-only/MANIFEST.json'),'utf8'));
const tests=[],sources={};
const clone=x=>JSON.parse(JSON.stringify(x));
const good=()=>({proxies:[{name:'Synthetic node',type:'socks5',server:'proxy.example.test',port:1080,udp:true}]});
function check(name,fn){try{fn();tests.push({name,status:'PASS'});}catch(e){tests.push({name,status:'FAIL',error:String(e.stack||e).slice(0,1800)});}}
function engine(file){const text=fs.readFileSync(path.join(root,file),'utf8');sources[file]=crypto.createHash('sha256').update(text).digest('hex');const ctx=vm.createContext({console:{log(){}}});vm.runInContext(text,ctx,{filename:file,timeout:3000});return input=>{ctx.auditInput=clone(input);try{return clone(vm.runInContext('main(auditInput)',ctx,{timeout:5000}));}finally{delete ctx.auditInput;}};}
function collisionInput(mode){return {...good(),'x-routeweaver':{'network-mode':mode},'rule-providers':{'v14-domains-private':{type:'inline',behavior:'domain',payload:['+.user-preserved.test']}},sniffer:{'skip-domain':['rule-set:v14-domains-private','+.do-not-sniff.test'],'skip-dst-address':['192.0.2.77/32']}};}
for(const [platform,file]of Object.entries(manifest.entries)){
 if(!file.endsWith('.js'))continue;
 const generate=engine(file);
 for(const mode of ['auto','dual-stack','ipv4-local']){
  check(platform+':'+mode+':minimal-input-and-idempotence',()=>{
   const input={...good(),'x-routeweaver':{'network-mode':mode}},before=JSON.stringify(input),c=generate(input);
   assert.equal(JSON.stringify(input),before,'mutated caller input');assert.equal(c['x-v14-generated'].networkMode,mode);
   assert.equal(c.ipv6,true);assert.equal(c.dns.ipv6,mode!=='ipv4-local');assert.deepEqual(generate(c),c);
   for(const group of ['高纯净度AI用','高网速视频用']){const g=c['proxy-groups'].find(g=>g.name===group);assert.equal(g.type,'select');assert.ok(!g.proxies.includes('DIRECT'));assert.equal(g['empty-fallback'],'REJECT');}
   assert.deepEqual(c.rules.slice(-2),['MATCH,漏网之鱼','MATCH,REJECT']);
   if(platform==='android')assert.ok(!c.tun||c.tun.enable!==true,'script enabled Android VPN');
  });
  check(platform+':'+mode+':api-dns-contract',()=>{
   const c=generate({...good(),tun:{enable:false},'x-routeweaver':{'network-mode':mode}});
   if(mode==='ipv4-local'){assert.ok(!c.dns['fake-ip-filter'].includes('api.openai.com'));assert.equal(c.dns['nameserver-policy']['api.openai.com'],undefined);}
   else {assert.ok(c.dns['fake-ip-filter'].includes('api.openai.com'));const r=c.dns['nameserver-policy']['api.openai.com'];assert.ok(Array.isArray(r)&&r.length>=1,'missing exact API DNS policy');for(const s of r){assert.match(s,/^https:\/\//);assert.match(s,/#OpenAI 服务(?:&|$)/);}}
  });
  check(platform+':'+mode+':user-classifier-preserved',()=>{
   const c=generate(collisionInput(mode));
   assert.deepEqual(c['rule-providers']['v14-domains-private'].payload,['+.user-preserved.test']);
   assert.ok(c.sniffer['skip-domain'].includes('rule-set:v14-domains-private'));
   assert.ok(c.sniffer['skip-domain'].includes('+.do-not-sniff.test'));
   const own=c['x-v14-generated'].embeddedDomainClassifiers.find(x=>x.tag==='private');
   assert.notEqual(own.provider,'v14-domains-private');
   if(mode!=='dual-stack')assert.ok(c.sniffer['skip-domain'].includes('rule-set:'+own.provider));
   assert.deepEqual(generate(c),c,'second generation changed user classifier or generated ownership');
  });
 }
 check(platform+':all-mode-transitions',()=>{
  let c=generate({...good(),tun:{enable:false}});
  for(const mode of ['dual-stack','ipv4-local','auto','dual-stack','auto']){
   c['x-routeweaver']={'network-mode':mode};c=generate(c);
   assert.deepEqual(generate(c),c,'not idempotent after '+mode);
   assert.equal(c['x-v14-generated'].embeddedDomainClassifiers.find(x=>x.tag==='private').provider,'v14-domains-private','generated classifier retained as foreign dependency');
  }
 });
 check(platform+':reject-fixed-inbound-policy',()=>assert.throws(()=>generate({...good(),listeners:[{name:'Bypass',type:'socks',listen:'127.0.0.1',port:12345,proxy:'DIRECT'}]})));
 const generate4=engine(variant.entries[platform].file);
 check(platform+':ipv4-only:minimal-input',()=>{const c=generate4(good());assert.equal(c.ipv6,false);assert.equal(c.dns.ipv6,false);assert.ok(c.rules.includes('IP-CIDR6,::/0,REJECT,no-resolve'));assert.deepEqual(generate4(c),c);});
 for(const address of ['999.1.1.1','256.0.0.1','1.1.1.1:0','1.1.1.1:65536','1.1.1.1:99999','tcp://1.1.1.1:0','https://1.1.1.1/dns-query','::1','localhost'])
  check(platform+':reject-invalid-lan-dns:'+address,()=>assert.throws(()=>generate4({...good(),tun:{enable:false},'x-routeweaver':{'ipv4-lan-dns':[address]}})));
 check(platform+':valid-lan-dns',()=>{const c=generate4({...good(),'x-routeweaver':{'ipv4-lan-dns':['192.168.1.1','tcp://127.0.0.1:5353']}});assert.ok(c.dns['nameserver-policy']['+.lan'].every(x=>x.includes('disable-ipv6=true')));});
}
const fixture=require(path.join(root,'releases/v14.3/tests/fixture.cjs'));
for(const platform of ['desktop','android','clashmi','clash-verge']){
 const f=fixture.load(platform);
 for(const [name,flow,expected]of [
  ['ip-literal-cf',{ip:'1.1.1.1',port:443,protocol:'TCP'},'漏网之鱼'],
  ['cf-domain',{host:'www.cloudflare.com',port:443,protocol:'TCP'},'公共基础服务'],
  ['turnstile',{host:'challenges.cloudflare.com',port:443,protocol:'TCP'},'公共基础服务'],
  ['chatgpt',{host:'chatgpt.com',port:443,protocol:'TCP'},'OpenAI 服务'],
  ['cf-doh-domain',{host:'one.one.one.one',port:443,protocol:'TCP'},'REJECT'],
  ['unknown-udp',{ip:'8.8.4.4',port:50000,protocol:'UDP'},'漏网之鱼'],
  ['known-google-udp',{host:'www.google.com',port:443,protocol:'UDP'},'谷歌服务']])
  check(platform+':routing:'+name,()=>{const r=fixture.route(f,flow);assert.equal(r.group,expected);if(flow.protocol==='UDP'&&expected!=='REJECT')assert.equal(fixture.route(f,flow,{udpSupported:false}).policy,'REJECT');});
}
const result={revision:'architecture-audit-r1',executedAt:new Date().toISOString(),scope:'OFFLINE_SOURCE_REGRESSION_NOT_NATIVE_OR_DEVICE',flavor:manifest.vpsDirectRevision?'personal':'public',status:tests.some(t=>t.status==='FAIL')?'FAIL':'PASS',passed:tests.filter(t=>t.status==='PASS').length,failed:tests.filter(t=>t.status==='FAIL').length,sources,tests};
const at=process.argv.indexOf('--output'),output=at>=0?path.resolve(process.argv[at+1]):path.join(root,'releases/v14.3/validation/architecture-audit/regressions.json');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,passed:result.passed,failed:result.failed,failures:tests.filter(t=>t.status==='FAIL').map(t=>({name:t.name,error:t.error.split('\n').slice(0,2).join(' ')}))}));
if(result.failed)process.exitCode=1;
