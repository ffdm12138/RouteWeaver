'use strict';
// Synthetic input only. Real engines, fresh contexts; no client or node access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict'),readline=require('node:readline');
const root=path.resolve(__dirname,'..'),project=path.resolve(root,'../..');
assert.ok(process.argv[2],'Provide the built routeweaver-engine-check executable');
const binary=path.resolve(process.argv[2]),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.ok(fs.existsSync(binary),'Engine runner does not exist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'metadata/network-compat.json'),'utf8'));
const node=(name='Lab',extra={})=>({name,type:'socks5',server:'node.example.test',port:1080,udp:true,...extra});
const good=()=>({proxies:[node()],tun:{enable:false,'auto-route':false}});
const cases=[
 ['minimal',good()],
 ['serialized-object',JSON.stringify(good())],
 ['provider-only',{'proxy-providers':{Lab:{type:'http',url:'https://provider.example.test/synthetic','health-check':{enable:false}}},tun:{enable:false}}],
 ['mixed-and-inline-provider',{...good(),'proxy-providers':{Lab:{type:'inline',payload:[node('Member')]}}}],
 ['explicit-node-families',{...good(),proxies:[node('Four',{'ip-version':'ipv4'}),node('Six',{'ip-version':'ipv6'}),node('Literal6',{server:'2001:db8::42'}),node('Literal4',{server:'192.0.2.42'})]}],
 ['unicode-and-quoted-node',{...good(),proxies:[node('测试 🚀 \' " \\ 节点')]}],
 ['preserve-input-fields',{...good(),profile:{'store-selected':true},'x-synthetic':{nested:[1,'quoted " text',null]}}],
 ['sniffer-and-LAN-exclusions',{...good(),sniffer:{'skip-domain':['+.keep.example.test'],'skip-dst-address':['192.0.2.0/24']}}],
 ['inherited-TUN-foreign-fields',{...good(),tun:{enable:false,'auto-route':false,'file-descriptor':123,'strict-route':false,'route-exclude-address':['192.0.2.0/24']}}],
 ['provider-explicit-expression',{...good(),'proxy-providers':{Lab:{type:'inline',payload:[node('Member')],override:{'override-expr':['del(.["ip-version"])']}}}}],
 ['duplicate-node-rejected',{...good(),proxies:[node('Duplicate'),node('Duplicate')]}],
 ['reserved-node-rejected',{...good(),proxies:[node('DIRECT')]}],
 ['cyclic-dialer-rejected',{...good(),proxies:[node('A',{'dialer-proxy':'B'}),node('B',{'dialer-proxy':'A'})]}],
 ['missing-provider-rejected',{...good(),'proxy-groups':[{name:'Referenced',type:'select',use:['missing']}]}],
 ['invalid-root-null',null],['invalid-root-array',[]],['invalid-root-string','invalid'],
 ['invalid-network-mode',{...good(),'x-routeweaver':{'network-mode':'unsupported'}}]
];
const programs=[];
for(const entry of manifest.entries.filter(e=>e.file.endsWith('.js'))){
 const source=fs.readFileSync(path.join(root,entry.file),'utf8');
 for(const mode of ['dual-stack','ipv4-local'])for(const [label,original]of cases){
  const prepared=label==='serialized-object'?JSON.stringify({...JSON.parse(original),'x-routeweaver':{'network-mode':mode}}):original;
  const input=prepared&&typeof prepared==='object'&&!Array.isArray(prepared)?{...prepared,'x-routeweaver':{'network-mode':mode,...prepared['x-routeweaver']}}:prepared;
  const code='var console={log:function(){},info:function(){},error:function(){},warn:function(){},debug:function(){}};\n'+source+'\n;'+
    '(function(){try{const input='+JSON.stringify(input)+';const out=main(input,"synthetic profile");const copy=JSON.parse(JSON.stringify(out));const twice=main(copy,"synthetic profile");return JSON.stringify({ok:true,value:out,idempotent:JSON.stringify(out)===JSON.stringify(twice)});}catch(e){return JSON.stringify({ok:false,error:String(e.message||e)});}})()';
  const expected=JSON.parse(vm.runInNewContext(code,{}, {timeout:5000}));
  if(expected.ok)assert.equal(expected.idempotent,true,entry.platform+':'+label+':'+mode);
  programs.push({id:entry.platform+':'+mode+':'+label,code,expected});
 }
}
async function run(engine){
 const child=cp.spawn(binary,[engine],{stdio:['pipe','pipe','pipe'],windowsHide:true}),lines=readline.createInterface({input:child.stdout});
 let count=0,stderr='',failure;child.stderr.setEncoding('utf8');child.stderr.on('data',s=>stderr+=s);
 const timer=setTimeout(()=>{failure=Error(engine+' exceeded batch deadline');child.kill();},300000);
 const rows=[];
 const consume=(async()=>{for await(const line of lines){const envelope=JSON.parse(line),test=programs[count++];assert.ok(test,'Extra engine output');assert.equal(envelope.ok,true,engine+':'+test.id+':'+envelope.error);const actual=JSON.parse(envelope.result);assert.deepEqual(actual,test.expected,engine+':'+test.id);rows.push({id:test.id,status:actual.ok?'PASS':'EXPECTED_REJECTION_MATCH',resultSHA256:sha(JSON.stringify(actual))});}})();
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 try{
  for(const test of programs){if(!child.stdin.write(JSON.stringify({code:test.code})+'\n'))await new Promise((resolve,reject)=>{const drained=()=>{child.stdin.removeListener('error',failed);resolve();},failed=error=>{child.stdin.removeListener('drain',drained);reject(error);};child.stdin.once('drain',drained);child.stdin.once('error',failed);});}
  child.stdin.end();await consume;const code=await exit;if(failure)throw failure;assert.equal(code,0,stderr);assert.equal(count,programs.length);return {engine,version:engine==='quickjs'?'rquickjs 0.12.0':'Boa 0.22.0',cases:rows};
 }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
}
(async()=>{
 const runs=[];for(const engine of ['quickjs','boa'])runs.push(await run(engine));
 const files=[...new Set([...manifest.entries.filter(e=>e.file.endsWith('.js')).map(e=>e.file),'tests/engine-parity.cjs','tests/engines/Cargo.toml','tests/engines/Cargo.lock','tests/engines/src/main.rs'])];
 const report={status:'REAL_ENGINE_PARITY_PASS',date:'2026-10-16',scope:'Synthetic Node versus real QuickJS and Boa, object/error parity and repeated application. Not client import, JavaScriptCore, TUN/VPN or application acceptance.',engines:runs,entryFiles:manifest.entries.filter(e=>e.file.endsWith('.js')).length,inputCases:cases.length,networkModes:2,observations:runs.reduce((n,r)=>n+r.cases.length,0),runnerSHA256:sha(fs.readFileSync(binary)),sourceFiles:files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),deviceAcceptance:'NOT_RUN'};
 fs.writeFileSync(path.join(root,'validation/engine-parity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,entries:report.entryFiles,observations:report.observations}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
