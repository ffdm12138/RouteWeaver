'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),readline=require('node:readline');
const root=path.resolve(__dirname,'..'),release=path.join(root,'releases/v14.3-ipv4-only');
const manifest=JSON.parse(fs.readFileSync(path.join(release,'MANIFEST.json'))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const good=()=>({proxies:[{name:'Domain',type:'socks5',server:'node.example.test',port:1080,udp:true},{name:'Explicit6',type:'socks5',server:'node.example.test',port:1080,'ip-version':'ipv6'},{name:'Literal6',type:'socks5',server:'2001:db8::1',port:1080,udp:true}],tun:{enable:false,'auto-route':false}});
const cases=[['minimal',good()],['inherited-auto',{...good(),'x-routeweaver':{'network-mode':'auto'}}],['inherited-dual',{...good(),'x-routeweaver':{'network-mode':'dual-stack'}}],
 ['inline-provider',{...good(),'proxy-providers':{Lab:{type:'inline',payload:[{name:'Member',type:'socks5',server:'member.test',port:1080,'ip-version':'ipv6'}],override:{'ip-version':'ipv6','override-expr':['.["ip-version"] = "ipv6"']}}}}],
 ['remote-provider',{...good(),'proxy-providers':{Lab:{type:'http',url:'https://provider.example.test/synthetic',override:{'override-expr':['del(.["ip-version"])']}}}}],
 ['hosts',{...good(),hosts:{'both.test':['192.0.2.1','2001:db8::1'],'six.test':'2001:db8::2','alias.test':'six.test','+.v6.test':['2001:db8::3']}}],
 ['LAN-dns',{...good(),'x-routeweaver':{'ipv4-lan-dns':['192.168.1.1','tcp://192.168.1.2:53']}}],
 ['serialized',JSON.stringify(good())],['null',null],['array',[]],['string','invalid']];
const programs=[],checks=[];
function generate(code,input){const ctx=vm.createContext({console:{log(){}}});vm.runInContext(code,ctx,{timeout:5000});return JSON.parse(JSON.stringify(ctx.main(input,'synthetic profile')));}
function check(name,fn){fn();checks.push({name,status:'PASS'});}
for(const [platform,entry]of Object.entries(manifest.entries)){
 const bytes=fs.readFileSync(path.join(root,entry.file));assert.equal(sha(bytes),entry.sha256);
 assert.equal(sha(fs.readFileSync(path.join(root,entry.source))),entry.sourceSHA256);
 const source=bytes.toString('utf8');
 if(!entry.file.endsWith('.js')){
  check(platform+':native-conf',()=>{assert.match(source,/^ipv6 = false\r?$/m);assert.match(source,/^prefer-ipv6 = false\r?$/m);assert.match(source,/^IP-CIDR6,::\/0,REJECT,no-resolve\r?$/m);const old=fs.readFileSync(path.join(root,entry.source),'utf8').split('[Rule]')[1];assert.equal(source.split('[Rule]')[1].replace(/\r?\nIP-CIDR6,::\/0,REJECT,no-resolve/,''),old);});
  continue;
 }
 for(const [label,input]of cases){
  const program='var console={log:function(){}};\n'+source+'\n(function(){try{const a=main('+JSON.stringify(input)+',"synthetic profile");const b=main(JSON.parse(JSON.stringify(a)),"synthetic profile");return JSON.stringify({ok:true,value:a,idempotent:JSON.stringify(a)===JSON.stringify(b)});}catch(e){return JSON.stringify({ok:false,error:String(e.message||e)});}})()';
  const expected=JSON.parse(vm.runInNewContext(program,{}, {timeout:5000}));programs.push({id:platform+':'+label,code:program,expected});
  check(platform+':'+label,()=>{
   const valid=!['null','array','string'].includes(label)&&(label!=='serialized'||['clashmi','macosClashMi'].includes(platform));assert.equal(expected.ok,valid,expected.error);
   if(!valid)return;assert.equal(expected.idempotent,true,platform+':'+label+' not idempotent');
   const c=expected.value;assert.equal(c.ipv6,false);assert.equal(c.dns.ipv6,false);assert.equal(c.dns['use-system-hosts'],false);assert.ok(!c.dns['fake-ip-range6']);assert.ok(!c['routeweaver-local-family']);assert.equal(c['x-v14-generated'].networkMode,'ipv4-only');assert.ok(!c['x-v14-generated'].automaticNetworkCapability);
   for(const node of c.proxies)assert.equal(node['ip-version'],'ipv4');
   for(const p of Object.values(c['proxy-providers'])){assert.equal(p.override['ip-version'],'ipv4');assert.equal(p.override['override-expr'].at(-1),'.["ip-version"] = "ipv4"');for(const n of p.payload||[])assert.equal(n['ip-version'],'ipv4');}
   for(const key of ['nameserver','direct-nameserver','default-nameserver','proxy-server-nameserver'])for(const s of c.dns[key])assert.ok(s.includes('disable-ipv6=true')&&s.includes('disable-qtype-65=true'));
   assert.ok(c.rules.includes('IP-CIDR6,::/0,REJECT,no-resolve'));assert.equal(c.rules.filter(s=>s==='IP-CIDR6,::/0,REJECT,no-resolve').length,1);
   const raw=typeof input==='string'?JSON.parse(input):input;
   const baseline=generate(fs.readFileSync(path.join(root,entry.source),'utf8'),{...raw,'x-routeweaver':{...raw['x-routeweaver'],'network-mode':'ipv4-local'}});
   assert.deepEqual(c['proxy-groups'],baseline['proxy-groups']);assert.deepEqual(c['rule-providers'],baseline['rule-providers']);assert.deepEqual(c['x-v14-generated'].ruleSources,baseline['x-v14-generated'].ruleSources);
   assert.deepEqual(c.rules.filter(s=>s!=='IP-CIDR6,::/0,REJECT,no-resolve'&&!['DOMAIN,six.test,REJECT','DOMAIN,alias.test,REJECT','DOMAIN-SUFFIX,v6.test,REJECT'].includes(s)),baseline.rules);
   if(label==='hosts'){assert.deepEqual(c.hosts['both.test'],['192.0.2.1']);assert.ok(c.rules.includes('DOMAIN,six.test,REJECT'));assert.ok(c.rules.includes('DOMAIN,alias.test,REJECT'));}
   if(label==='LAN-dns')assert.ok(!Object.values(c.dns['nameserver-policy']).flat().includes('system'));
  });
 }
}
async function engine(binary,name){
 const child=cp.spawn(binary,[name],{stdio:['pipe','pipe','pipe'],windowsHide:true}),lines=readline.createInterface({input:child.stdout});let count=0,errors='';child.stderr.on('data',s=>errors+=s);
 const consume=(async()=>{for await(const line of lines){const envelope=JSON.parse(line),test=programs[count++];assert.equal(envelope.ok,true,envelope.error);assert.deepEqual(JSON.parse(envelope.result),test.expected,name+':'+test.id);}})();
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 const timer=setTimeout(()=>child.kill(),180000);
 try{for(const test of programs)if(!child.stdin.write(JSON.stringify({code:test.code})+'\n'))await new Promise(resolve=>child.stdin.once('drain',resolve));child.stdin.end();const code=await ended;await consume;assert.equal(code,0,errors);assert.equal(count,programs.length);return {engine:name,cases:count,status:'PASS'};}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
}
(async()=>{
 const binary=process.argv[2],engines=[];if(binary)for(const name of ['quickjs','boa'])engines.push(await engine(path.resolve(binary),name));
 const result={status:'IPV4_ONLY_STATIC_BUSINESS_PARITY_PASS',flavor:manifest.flavor,checks:checks.length,engines,...(binary?{engineRunnerSHA256:sha(fs.readFileSync(path.resolve(binary)))}:{}),manifestSHA256:sha(fs.readFileSync(path.join(release,'MANIFEST.json'))),harnessSHA256:sha(fs.readFileSync(__filename)),cases:checks,deviceAcceptance:'NOT_RUN'};
 fs.mkdirSync(path.join(release,'validation'),{recursive:true});fs.writeFileSync(path.join(release,'validation/static.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,flavor:result.flavor,checks:checks.length,engines}));
})().catch(error=>{console.error(error);process.exitCode=1;});
