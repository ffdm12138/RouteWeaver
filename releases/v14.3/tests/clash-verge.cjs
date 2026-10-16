'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),f=require('./fixture.cjs');
const rows=[],source='src/clash-verge/v14.3-clash-verge.js';
const run=input=>{const ctx=vm.createContext({console:{log(){}}});vm.runInContext(fs.readFileSync(f.local(source),'utf8'),ctx);return JSON.parse(JSON.stringify(ctx.main(input,'synthetic profile')));};
const input=()=>({proxies:[{name:'Lab',type:'socks5',server:'node.example.test',port:1080,udp:true}],tun:{enable:false,'auto-route':false}});
function check(name,fn){fn();rows.push({name,status:'PASS'});}
for(const mode of ['dual-stack','ipv4-local']){
 check(mode+':business-DNS-groups-and-rules-equal-Windows',()=>{const raw={...input(),'x-routeweaver':{'network-mode':mode}},actual=run(raw),before=f.generate('desktop',raw);for(const c of [actual,before]){delete c['x-v14-generated'];delete c.tun;}assert.deepEqual(actual,before);});
 check(mode+':three-pass-idempotence',()=>{const first=run({...input(),'x-routeweaver':{'network-mode':mode}});assert.deepEqual(run(first),first);assert.deepEqual(run(run(first)),first);});
 check(mode+':strict-route-and-dual-stack-with-app-switches-retained',()=>{const c=run({...input(),'x-routeweaver':{'network-mode':mode}});assert.equal(c.ipv6,true);assert.equal(c.tun['strict-route'],true);assert.deepEqual(c.tun['route-address'],['0.0.0.0/0','::/0']);assert.equal(c.tun.enable,false);assert.equal(c.tun['auto-route'],false);});
}
check('foreign-privileged-TUN-fields-removed',()=>{const x=input();x.tun['file-descriptor']=123;x.tun['auto-redirect']=true;const y=run(x);assert.ok(!('file-descriptor' in y.tun));assert.ok(!('auto-redirect' in y.tun));});
check('one-entry-can-explicitly-switch-back-to-dual-stack',()=>{const a=run({...input(),'x-routeweaver':{'network-mode':'ipv4-local'}});a['x-routeweaver']['network-mode']='dual-stack';const b=run(a);assert.equal(b.dns.ipv6,true);assert.equal(b['x-v14-generated'].networkMode,'dual-stack');assert.ok(b.dns['fake-ip-range6']);});
check('mode-selection-does-not-change-business-egress',()=>{const a=run(input()),b=run({...input(),'x-routeweaver':{'network-mode':'ipv4-local'}});assert.deepEqual(a.rules,b.rules);assert.deepEqual(a['proxy-groups'],b['proxy-groups']);});
check('source-registry-is-hash-bound',()=>{const manifest=JSON.parse(fs.readFileSync(f.local('metadata/clash-verge-sources.json'),'utf8'));for(const e of [...manifest.inputs,...manifest.entries])assert.equal(f.sha(f.local(e.file)),e.sha256,e.file);});
const report={status:'CLASH_VERGE_STATIC_PASS',date:'2026-10-16',checks:rows,sourceFiles:[source,'tests/clash-verge.cjs','tests/fixture.cjs','metadata/clash-verge-sources.json'].map(file=>({file,sha256:f.sha(f.local(file))})),nativeClientAcceptance:'NOT_RUN',scope:'Actual single Verge script; Windows business/DNS/UDP parity, mode switching, idempotence, TUN boundary. App final merge and native capture separate.'};
fs.writeFileSync(f.local('validation/clash-verge-static.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:rows.length}));
