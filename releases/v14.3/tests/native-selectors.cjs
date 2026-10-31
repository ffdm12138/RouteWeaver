'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {once}=require('node:events'),f=require('./fixture.cjs');
const core=process.argv[2],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={version:'14.3',revision:'thunder-repair-r1',status:'RUNNING',scope:'Actual generated selectors with file-provider refresh, hostile nontransport members and raw subscription reload; owned loopback core, no target traffic, DNS or TUN',coreSHA256:f.sha(core),coreVersion:cp.execFileSync(core,['-v'],{encoding:'utf8',windowsHide:true}).trim(),platforms:[]};
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function run(platform,mode){
  const home=f.newExperiment('native-selectors-'+platform+'-'+mode),apiPort=await freePort(),nodePort=await freePort(),secret=crypto.randomBytes(16).toString('hex');
  const node=name=>({name,type:'socks5',server:'127.0.0.1',port:nodePort,udp:true}),memberFile=path.join(home,'provider.json'),file=path.join(home,'isolated.json');
  const hostile=[{name:'ProviderDirect',type:'direct'},{name:'ProviderReject',type:'reject'},{name:'ProviderPass',type:'pass'},{name:'ProviderPassRule',type:'pass-rule'},{name:'ProviderRejectDrop',type:'reject-drop'},node('剩余流量: 10GB')];
  const writeMembers=names=>fs.writeFileSync(memberFile,JSON.stringify({proxies:names.map(node).concat(hostile)},null,2));
  writeMembers(['RemovedNode','RemainingNode']);
  function configFor(names){
    const input={proxies:(mode!=='raw'?['RawNode']:names).map(node),tun:{enable:false,'auto-route':false},profile:{'store-selected':true,'store-fake-ip':false}};
    if(mode!=='raw')input['proxy-providers']={AuditProvider:{type:'file',path:memberFile}};
    if(mode==='override')input['proxy-providers'].OverrideProvider={type:'file',path:memberFile,override:{'override-expr':['.name = "Override-" + .name','.type = "direct"']}};
    const c=f.generate(platform,input);
    Object.assign(c,{'mixed-port':0,port:0,'socks-port':0,'redir-port':0,'tproxy-port':0,'external-controller':'127.0.0.1:'+apiPort,secret,'log-level':'debug',tun:{enable:false},sniffer:{enable:false}});c.dns.enable=false;
    for(const p of Object.values(c['proxy-providers']))p['health-check']={enable:false};
    // Only the unreferenced diagnostic url-test is quieted; every manual
    // selector retains its production proxies/default/filter/use fields.
    c['proxy-groups'].find(g=>g.name==='自动选择').type='select';
    f.installReviewedProviders(c,home);
    for(const p of Object.values(c['rule-providers']))if(p.type!=='inline'){p.type='file';delete p.url;delete p.proxy;delete p.interval;}
    return c;
  }
  fs.writeFileSync(file,JSON.stringify(configFor(['RemovedNode','RemainingNode']),null,2));let logs='';
  let child;const start=()=>{child=cp.spawn(core,['-d',home,'-f',file],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);};start();
  const api=(method,resource,value)=>new Promise((resolve,reject)=>{const body=value?JSON.stringify(value):'',q=http.request({host:'127.0.0.1',port:apiPort,path:resource,method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{let data='';r.on('data',x=>data+=x);r.on('end',()=>r.statusCode>=400?reject(Error(data)):resolve(data?JSON.parse(data):{}));});q.on('error',reject);q.end(body);});
  const state=g=>api('GET','/proxies/'+encodeURIComponent(g)),select=(g,n)=>api('PUT','/proxies/'+encodeURIComponent(g),{name:n}).catch(error=>{error.message+=' [platform='+platform+', mode='+mode+', group='+g+', selected='+n+']';throw error;});
  async function ready(){let ok=false;for(let i=0;i<100;i++){try{const states=await Promise.all(['高纯净度AI用','高网速视频用','国内网站','Steam'].map(state));if(states.every(s=>s.all.includes('RemainingNode'))){ok=true;break;}}catch{}await sleep(40);}assert.ok(ok,'Core not ready: '+logs);}
  const outcomes=[];const record=(name,value)=>outcomes.push({name,...value});
  try{
    await ready();const all=await api('GET','/proxies');
    if(mode==='override'){
      const provider=await api('GET','/providers/proxies/OverrideProvider');
      assert.equal(provider.proxies.length,3);assert.ok(provider.proxies.every(p=>p.type==='Reject'&&p.name.startsWith('@v14-nontransport:')));
      record('custom-direct-overrides-rejected-before-selector',{members:provider.proxies.map(p=>({name:p.name,type:p.type}))});
    }
    for(const group of Object.keys(all.proxies).filter(g=>['高纯净度AI用','高网速视频用','国内网站'].includes(g))){const s=await state(group);assert.equal(s.now,group==='国内网站'?'DIRECT':'REJECT');assert.equal(s.all[0],'REJECT');record('cold-default-'+group,{now:s.now,choices:s.all});}
    const generated=configFor(['RemovedNode','RemainingNode']);
    for(const g of generated['proxy-groups'].filter(g=>g.type==='select'&&g.name!=='自动选择')){
      const s=await state(g.name);assert.ok(!s.all.some(n=>['ProviderDirect','ProviderReject','ProviderPass','ProviderPassRule','ProviderRejectDrop','剩余流量: 10GB'].includes(n)||n.includes('Override-')||n.startsWith('@v14-nontransport:')),g.name);
      const allowed=!['高纯净度AI用','高网速视频用','漏网之鱼'].includes(g.name);
      if(allowed){assert.ok(s.all.includes('DIRECT'));await select(g.name,'DIRECT');assert.equal((await state(g.name)).now,'DIRECT');}
      else {assert.ok(!s.all.includes('DIRECT'));await assert.rejects(select(g.name,'DIRECT'),/proxy not exist/);}
      record('direct-choice-'+g.name,{allowed});
    }
    const names=['高纯净度AI用','高网速视频用','国内网站','Steam'];
    for(const g of names){await select(g,'RemovedNode');assert.equal((await state(g)).now,'RemovedNode');}
    if(mode!=='raw'){writeMembers(['RemainingNode']);await api('PUT','/providers/proxies/AuditProvider');await ready();}
    else {fs.writeFileSync(file,JSON.stringify(configFor(['RemainingNode']),null,2));await api('PUT','/configs?force=true',{path:file});await ready();}
    for(const g of names){const s=await state(g);assert.ok(!s.all.includes('RemovedNode'));assert.equal(s.now,g==='Steam'?'高纯净度AI用':'REJECT');record('removed-selected-'+g,{now:s.now,choices:s.all});}
    for(const g of ['国内网站','Steam']){await select(g,'DIRECT');assert.equal((await state(g)).now,'DIRECT');record('explicit-direct-after-refresh-'+g,{now:'DIRECT'});}
    // Reload must preserve an intentional DIRECT selection; the guard rejects
    // missing nodes, rather than disabling the user's allowed DIRECT policy.
    await api('PUT','/configs?force=true',{path:file});await ready();assert.equal((await state('国内网站')).now,'DIRECT');record('intentional-direct-survives-reload',{now:'DIRECT'});
    for(const g of ['高纯净度AI用','高网速视频用']){await select(g,'RemainingNode');assert.equal((await state(g)).now,'RemainingNode');record('manual-recovery-'+g,{now:'RemainingNode'});}
    report.platforms.push({platform,mode,status:'CORE_MANUAL_SELECTORS_PASS',cases:outcomes.length,results:outcomes});
    console.log('PASS '+platform+' '+mode+': '+outcomes.length+' actual selector observations');
  }finally{
    fs.writeFileSync(path.join(home,'runtime.log'),logs);if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
    const receipt=report.platforms.find(p=>p.platform===platform&&p.mode===mode);if(receipt)receipt.home=f.captureExperiment(home,'native-selectors-'+platform+'-'+mode);
  }
}
async function main(){for(const platform of ['desktop','android'])for(const mode of ['provider','raw','override'])await run(platform,mode);report.status='CORE_MANUAL_SELECTORS_PASS';}
main().catch(e=>{report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);}).finally(()=>{report.sourceFiles=['src/windows/v14.3-windows-flclash.js','src/android/v14.3-android-flclash.js','tests/native-selectors.cjs','tests/fixture.cjs','data/rule-sources.lock.json'].map(file=>({file,sha256:f.sha(f.local(file))}));fs.writeFileSync(f.local('validation/native-selectors.json'),JSON.stringify(report,null,2)+'\n');});
