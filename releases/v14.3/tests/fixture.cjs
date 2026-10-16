"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net');
const root=path.dirname(__dirname), sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const local=name=>{const result=path.resolve(root,name);assert.ok(result.startsWith(root+path.sep),'Escaped path');return result;};
const projectRoot=path.resolve(root,'../..');
const workRoot=fs.existsSync(path.join(projectRoot,'CURRENT_RELEASE.json'))&&path.dirname(root)===path.join(projectRoot,'releases')
  ?path.join(projectRoot,'.work','core','v14.3'):local('.work');
function newExperiment(kind){assert.match(kind,/^[a-z-]+$/);fs.mkdirSync(workRoot,{recursive:true});return fs.mkdtempSync(path.join(workRoot,kind+'-'));}
function captureExperiment(home,kind){
  assert.match(kind,/^[a-z-]+$/);const target=local('validation/experiments/'+kind);fs.mkdirSync(target,{recursive:true});
  for(const entry of fs.readdirSync(home,{withFileTypes:true}))if(entry.isFile()&&['.json','.log'].includes(path.extname(entry.name)))fs.copyFileSync(path.join(home,entry.name),path.join(target,entry.name));
  return path.relative(root,target).replaceAll('\\','/');
}
function generate(platform,input) {
  const file=local(platform==='desktop'?'src/windows/v14.3.js':platform==='clash-verge'?'src/clash-verge/v14.3-clash-verge.js':platform==='clashmi'?'src/ios/v14.3-clashmi-domestic-protocol-r1.js':'src/android/v14.3-android.js');
  const context=vm.createContext({console:{log(){}}});vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file,timeout:3000});
  return JSON.parse(JSON.stringify(context.main(input||{proxies:[{name:'Audit node',type:'ss',server:'2001:db8::10',port:443,cipher:'aes-128-gcm',password:'test-only',udp:true}],
    tun:{enable:false,'auto-route':false},ipv6:true,dns:{ipv6:true,'fake-ip-range6':'fdfe:dcba:9876::1/64'}})));
}
function split(text){const fields=[];let depth=0,start=0;for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;else if(text[i]===')')depth--;else if(text[i]===','&&depth===0){fields.push(text.slice(start,i));start=i+1;}}assert.equal(depth,0,text);fields.push(text.slice(start));return fields;}
function number(address){const family=net.isIP(address);if(family===4)return {bits:32,value:address.split('.').reduce((n,v)=>(n<<8n)|BigInt(v),0n)};
  assert.equal(family,6,address);if(address.includes('.')){const cut=address.lastIndexOf(':'),tail=number(address.slice(cut+1)).value;address=address.slice(0,cut+1)+(tail>>16n).toString(16)+':'+(tail&65535n).toString(16);}
  const [a,b]=address.split('::'),left=a?a.split(':'):[],right=b?b.split(':'):[];const parts=address.includes('::')?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  assert.equal(parts.length,8);return {bits:128,value:parts.reduce((n,v)=>(n<<16n)|BigInt('0x'+v),0n)};}
const cidrs=new Map();function cidrMatch(address,cidr){if(!address)return false;if(!cidrs.has(cidr)){const [base,mask]=cidr.split('/');cidrs.set(cidr,{...number(base),mask:Number(mask)});}const range=cidrs.get(cidr),ip=number(address);return range.bits===ip.bits&&(ip.value>>BigInt(ip.bits-range.mask))===(range.value>>BigInt(ip.bits-range.mask));}
function rows(file){return fs.readFileSync(file,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));}
function load(platform){const lock=JSON.parse(fs.readFileSync(local('data/rule-sources.lock.json'),'utf8')),sources=new Map(),inputs=[];
  if(platform!=='shadowrocket'){const config=generate(platform);for(const [name,p]of Object.entries(config['rule-providers'])){
    if(p.type==='inline'){sources.set(name,p.behavior==='domain'?p.payload.map(r=>r.startsWith('+.')?'DOMAIN-SUFFIX,'+r.slice(2):'DOMAIN,'+r):p.payload);continue;}const entry=lock.sources.find(s=>s.id===name&&s.url===p.url);assert.ok(entry,'Unbound provider '+name);assert.equal(sha(local(entry.classifier.file)),entry.classifier.sha256);
    sources.set(name,rows(local(entry.classifier.file)).map(s=>s.includes(',')?s:p.behavior==='domain'?(s.startsWith('+.')?'DOMAIN-SUFFIX,'+s.slice(2):s.includes('*')?'DOMAIN-WILDCARD,'+s:'DOMAIN,'+s):'IP-CIDR,'+s));inputs.push(entry);}
    return {platform,config,rules:config.rules,sources,inputs};}
  const text=fs.readFileSync(local('src/ios/v14.2-shadowrocket.conf'),'utf8'),manifest=JSON.parse(fs.readFileSync(local('metadata/shadowrocket-sources.json'),'utf8'));
  const section=name=>text.split('['+name+']')[1].split(/\n\[/)[0].split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  for(const p of manifest.ruleSets){const entry=lock.sources.find(s=>s.url===p.url&&s.platforms.includes('shadowrocket'));assert.ok(entry,p.url);assert.equal(sha(local(entry.classifier.file)),entry.classifier.sha256);sources.set(p.url,rows(local(entry.classifier.file)));inputs.push(entry);}
  const general=Object.fromEntries(section('General').filter(s=>s.includes('=')).map(s=>{const at=s.indexOf('=');return [s.slice(0,at).trim(),s.slice(at+1).trim()];}));
  const hosts=section('Host').map(s=>{const at=s.indexOf('=');return [s.slice(0,at).trim(),s.slice(at+1).trim()];});
  return {platform,config:{general,hosts},rules:section('Rule'),sources,inputs,manifest};}
function installReviewedProviders(config,home){const lock=JSON.parse(fs.readFileSync(local('data/rule-sources.lock.json'),'utf8')),inputs=[];
  for(const [name,p]of Object.entries(config['rule-providers'])){if(p.type==='inline')continue;const entry=lock.sources.find(s=>s.id===name&&s.url===p.url);assert.ok(entry,name);assert.equal(sha(local(entry.file)),entry.sha256);
    const target=path.resolve(home,p.path);assert.ok(target.startsWith(home+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(local(entry.file),target);inputs.push({name,file:entry.file,sha256:entry.sha256});}
  return inputs;}
const providerIndexes=new WeakMap();
function providerMatch(rows,flow,fixture){
  let index=providerIndexes.get(rows);
  if(!index||index.length!==rows.length){const exact=new Set(),suffix=new Set(),other=[];for(const row of rows){const [kind,value]=split(row);if(kind==='DOMAIN')exact.add(value.toLowerCase());else if(kind==='DOMAIN-SUFFIX')suffix.add(value.toLowerCase());else other.push(row);}index={length:rows.length,exact,suffix,other};providerIndexes.set(rows,index);}
  const host=(flow.host||'').toLowerCase();if(index.exact.has(host))return true;
  const labels=host.split('.');for(let i=0;i<labels.length;i++)if(index.suffix.has(labels.slice(i).join('.')))return true;
  return index.other.some(row=>matches(row,flow,fixture));
}
function matches(rule,flow,fixture){const [type,value]=split(rule),host=(flow.host||'').toLowerCase();
  if(type==='DOMAIN')return host===value.toLowerCase();if(type==='DOMAIN-SUFFIX')return host===value.toLowerCase()||host.endsWith('.'+value.toLowerCase());if(type==='DOMAIN-KEYWORD')return host.includes(value.toLowerCase());
  if(type==='DOMAIN-WILDCARD'||type==='USER-AGENT'){const pattern=value.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.');return new RegExp('^'+pattern+'$','i').test(type==='USER-AGENT'?flow.userAgent||'':host);}
  if(type==='DOMAIN-REGEX')return new RegExp(value.replace(/^\(\?i\)/,''),value.startsWith('(?i)')?'i':'').test(host);
  if(type==='IP-CIDR'||type==='IP-CIDR6')return cidrMatch(flow.ip,value);if(type==='IP-ASN')return flow.asn===Number(value);
  if(type==='DST-PORT')return value.split('/').some(p=>{const[a,b=a]=p.split('-').map(Number);return flow.port>=a&&flow.port<=b;});
  if(type==='NETWORK'||type==='PROTOCOL')return (flow.protocol||'TCP').toLowerCase()===value.toLowerCase();if(type==='IN-TYPE')return (flow.inType||'SOCKS').toLowerCase()===value.toLowerCase();
  if(type==='RULE-SET'){assert.ok(fixture.sources.has(value),value);return providerMatch(fixture.sources.get(value),flow,fixture);}if(type==='MATCH'||type==='FINAL')return true;
  assert.ok(['AND','OR','NOT'].includes(type),rule);const children=split(value.slice(1,-1)).map(s=>s.slice(1,-1));if(type==='AND')return children.every(s=>matches(s,flow,fixture));if(type==='OR')return children.some(s=>matches(s,flow,fixture));return !matches(children[0],flow,fixture);}
const routeIndexes=new WeakMap();
function routeCandidates(fixture,flow){
  if(fixture.rules.length<5000)return fixture.rules.entries();
  let idx=routeIndexes.get(fixture.rules);
  if(!idx||idx.length!==fixture.rules.length){const exact=new Map(),suffix=new Map(),other=[],add=(map,k,v)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(v);};for(const [i,row]of fixture.rules.entries()){const [kind,name]=split(row);if(kind==='DOMAIN')add(exact,name.toLowerCase(),[i,row]);else if(kind==='DOMAIN-SUFFIX')add(suffix,name.toLowerCase(),[i,row]);else other.push([i,row]);}idx={length:fixture.rules.length,exact,suffix,other};routeIndexes.set(fixture.rules,idx);}
  const host=(flow.host||'').toLowerCase(),found=[...idx.exact.get(host)||[]],labels=host.split('.');for(let i=0;i<labels.length;i++)found.push(...idx.suffix.get(labels.slice(i).join('.'))||[]);return found.concat(idx.other).sort((a,b)=>a[0]-b[0]);
}
function routeWithCandidates(fixture,flow,options,candidates){for(const[index,rule]of candidates){if(!matches(rule,flow,fixture))continue;const fields=split(rule),group=fields.at(-1)==='no-resolve'?fields.at(-2):fields.at(-1),policy=options.selections?.[group]||(group==='国内网站'?'DIRECT':group);
  if(flow.protocol==='UDP'&&options.udpSupported===false&&!['DIRECT','REJECT'].includes(policy)){if(fixture.platform==='shadowrocket')return {policy:'REJECT',group,index,rule};continue;}return {policy,group,index,rule};}throw Error('No matching rule');}
function route(fixture,flow,options={}){return routeWithCandidates(fixture,flow,options,routeCandidates(fixture,flow));}
function routeSlow(fixture,flow,options={}){return routeWithCandidates(fixture,flow,options,fixture.rules.entries());}
function dnsPatternMatches(key,host){key=key.toLowerCase();host=host.toLowerCase();if(key.startsWith('+.'))return host===key.slice(2)||host.endsWith(key.slice(1));if(key.startsWith('.'))return host.endsWith(key)&&host!==key.slice(1);if(key.startsWith('*.'))return host.endsWith(key.slice(1));if(key.includes('*'))return new RegExp('^'+key.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$').test(host);return key===host;}
function dnsPolicyFor(fixture,host){
  if(fixture.platform==='shadowrocket'){const choices=fixture.config.hosts.filter(([k,v])=>v.startsWith('server:')&&dnsPatternMatches(k,host));choices.sort((a,b)=>(b[0]===host?1e6:b[0].length)-(a[0]===host?1e6:a[0].length));
    const selected=choices[0],servers=(selected?selected[1].slice(7):fixture.config.general['dns-server']).split(',');return {key:selected?.[0]||'default',servers,groups:[...new Set(servers.map(s=>decodeURIComponent(s.split('#proxy=')[1]?.split('&')[0]||'DIRECT')))]};}
  const entries=Object.entries(fixture.config.dns['nameserver-policy']),literals=entries.filter(([key])=>!key.startsWith('rule-set:')&&dnsPatternMatches(key,host));literals.sort((a,b)=>(b[0]===host?1e6:b[0].length)-(a[0]===host?1e6:a[0].length));
  const selected=literals[0]||entries.find(([key])=>key.startsWith('rule-set:')&&matches('RULE-SET,'+key.slice(9),{host},fixture)),servers=selected?selected[1]:fixture.config.dns.nameserver;
  return {key:selected?.[0]||'default',servers,groups:[...new Set(servers.map(s=>s==='system'?s:decodeURIComponent(s.slice(s.lastIndexOf('#')+1).split('&')[0])))]};}
module.exports={root,local,sha,generate,load,split,number,matches,route,routeSlow,dnsPolicyFor,installReviewedProviders,newExperiment,captureExperiment};
