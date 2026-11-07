'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),rr=path.join(root,'releases/v14.3');
const f=require(path.join(rr,'tests/fixture.cjs')),idx=require(path.join(rr,'tests/domain-index.cjs'));
const release=JSON.parse(fs.readFileSync(path.join(root,'CURRENT_RELEASE.json')));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const observations={
 'OpenAI 服务':['api.openai.com','auth.openai.com','chatgpt.com','ws.chatgpt.com','oaistatic.com','oaiusercontent.com','oaistatsig.com','cdn.openaimerge.com','openaifoundation.org','www.openaifoundation.org'],
 'Anthropic 服务':['anthropic.com','api.anthropic.com','statsig.anthropic.com','claude.ai','claude.com','claudeusercontent.com','claudemcpclient.com','claudemcpcontent.com'],
 '公共基础服务':['ct.sendgrid.net','intercom.io','intercomcdn.com','cdn.workos.com','forwarder.workos.com','frontend-apps-multi-region.workos.com','setup.workos.com','images.workoscdn.com','workos.imgix.net','js.stripe.com','challenges.cloudflare.com','o207216.ingest.sentry.io','o33249.ingest.sentry.io','rum.browser-intake-datadoghq.com'],
 '苹果国际':['humb.apple.com']
};
let checks=0;const failures=[],sources={};
for(const entries of [release.entries,release.variants['ipv4-only'].entries])for(const [client,file]of Object.entries(entries)){
 const p=path.join(root,file),s=fs.readFileSync(p,'utf8');sources[file]=sha(p);let config,rules,platform=client;
 if(file.endsWith('.js')){config=JSON.parse(JSON.stringify(vm.runInNewContext(s+'\nmain({proxies:[{name:"Synthetic",type:"socks5",server:"127.0.0.1",port:1080,udp:true}]})',{console:{log(){}}})));rules=config.rules;}
 else{platform='shadowrocket';const sec=n=>s.split('['+n+']')[1].split(/\r?\n\[/)[0].split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));const pairs=rows=>rows.map(x=>{const at=x.indexOf('=');return[x.slice(0,at).trim(),x.slice(at+1).trim()];});config={general:Object.fromEntries(pairs(sec('General'))),hosts:pairs(sec('Host'))};rules=sec('Rule');}
 const providers=new Map();if(config['rule-providers'])for(const[name,v]of Object.entries(config['rule-providers']))providers.set(name,v.type!=='inline'?[]:v.behavior==='domain'?v.payload.map(x=>x.startsWith('+.')?'DOMAIN-SUFFIX,'+x.slice(2):'DOMAIN,'+x):v.payload);
 else for(const row of rules)if(row.startsWith('RULE-SET,'))providers.set(f.split(row)[1],[]);
 const model={platform,config,rules,sources:providers},route=idx.indexRoute(model),dns=idx.indexDNS(model);
 for(const [group,hosts]of Object.entries(observations))for(const host of hosts){checks++;try{assert.equal(route(host,'TCP').group,group);assert.equal(route(host,'UDP').group,group);assert.deepEqual(dns(host).groups,[group]);}catch(e){failures.push({file,host,expected:group,error:e.message});}}
 for(const host of ['crixet.com','unrelated.azureedge.net','unrelated.webpubsub.azure.com']){checks++;try{assert.notEqual(route(host).group,'OpenAI 服务');}catch(e){failures.push({file,host,error:e.message});}}
}
const result={revision:'company-audit-r1',status:failures.length?'FAIL':'PASS',checks,failed:failures.length,scope:'OFFLINE_ALL_REMOTE_PROVIDERS_EMPTY_NOT_DEVICE_ACCEPTANCE',sources,testSHA256:sha(__filename),observations,failures};
const at=process.argv.indexOf('--output');if(at>=0){const out=path.resolve(process.argv[at+1]);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,checks,failed:failures.length,failures:failures.slice(0,3)}));if(failures.length)process.exitCode=1;
