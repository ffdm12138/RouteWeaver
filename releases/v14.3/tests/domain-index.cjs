'use strict';
// Finite domain-only audit index. Cross-checked against fixture routeSlow/DNS.
const f=require('./fixture.cjs');
function indexRoute(fixture){
 const exact=new Map(),suffix=new Map(),other=[];let order=0;
 const add=(map,k,v)=>{if(!map.has(k))map.set(k,[]);const rows=map.get(k);if(!rows.some(r=>r.group===v.group))rows.push(v);};
 function emit(row,group,outer){const [kind,value]=f.split(row),r={order:order++,group,rule:outer,member:row};if(kind==='RULE-SET'){for(const member of fixture.sources.get(value))emit(member,group,outer);return;}if(kind==='DOMAIN')add(exact,value.toLowerCase(),r);else if(kind==='DOMAIN-SUFFIX')add(suffix,value.toLowerCase(),r);else if(!['IP-CIDR','IP-CIDR6','IP-ASN','USER-AGENT'].includes(kind)){const regex=kind==='DOMAIN-REGEX'?new RegExp(value.replace(/^\(\?i\)/,''),value.startsWith('(?i)')?'i':''):null;other.push({...r,test:regex?flow=>regex.test(flow.host):flow=>f.matches(row,flow,fixture)});}}
 for(const row of fixture.rules){const a=f.split(row),offset=a.at(-1)==='no-resolve'?-2:-1;emit(a.slice(0,offset).join(','),a.at(offset),row);}
 return (host,protocol='TCP',udpSupported=true)=>{const flow={host,port:443,protocol},allowed=r=>protocol!=='UDP'||udpSupported||fixture.platform==='shadowrocket'||['DIRECT','REJECT','国内网站'].includes(r.group);let best;
  const consider=r=>{if(allowed(r)&&(!best||r.order<best.order))best=r;};for(const r of exact.get(host)||[])consider(r);const labels=host.split('.');for(let i=0;i<labels.length;i++)for(const r of suffix.get(labels.slice(i).join('.'))||[])consider(r);
  for(const r of other){if(best&&r.order>=best.order)break;if(allowed(r)&&r.test(flow))consider(r);}if(protocol==='UDP'&&!udpSupported&&fixture.platform==='shadowrocket'&&!['DIRECT','REJECT'].includes(best.group))best={...best,group:'REJECT'};
  return {...best,policy:best.group==='国内网站'?'DIRECT':best.group};};
}
function rowIndex(rows,fixture){const exact=new Set(),suffix=new Set(),other=[];for(const row of rows){const [kind,value]=f.split(row);if(kind==='DOMAIN')exact.add(value.toLowerCase());else if(kind==='DOMAIN-SUFFIX')suffix.add(value.toLowerCase());else if(!['IP-CIDR','IP-CIDR6','IP-ASN','USER-AGENT'].includes(kind))other.push(row);}return host=>{if(exact.has(host))return true;const labels=host.split('.');for(let i=0;i<labels.length;i++)if(suffix.has(labels.slice(i).join('.')))return true;return other.some(row=>f.matches(row,{host},fixture));};}
function indexDNS(fixture){
 const ios=fixture.platform==='shadowrocket';
 const entries=ios?fixture.config.hosts.filter(([k,v])=>v.startsWith('server:')).map(([k,v])=>[k,v.slice(7).split(',')]):Object.entries(fixture.config.dns['nameserver-policy']);
 // Mihomo uses ordered policy segments. A provider flushes the preceding
 // literal trie; a later exact name does not override that earlier segment.
 const segments=[];let literals=[];
 const flush=()=>{if(literals.length){segments.push({literals});literals=[];}};
 for(const [i,[key,servers]]of entries.entries()){
  if(key.startsWith('rule-set:')){flush();segments.push({key,servers,match:rowIndex(fixture.sources.get(key.slice(9)),fixture)});}
  else literals.push({key,servers,i});
 }
 flush();
 for(const segment of segments){
  if(!segment.literals)continue;
  segment.exact=new Map();segment.suffix=new Map();segment.wild=new Map();
  const add=(map,key,r)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(r);};
  for(const r of segment.literals){
   const key=r.key.toLowerCase();r.score=key.length;
   if(key.startsWith('+.'))add(segment.suffix,key.slice(2),{...r,apex:true});
   else if(/^\*\.[^*]+$/.test(key))add(segment.suffix,key.slice(2),{...r,apex:false});
   else if(key.startsWith('.'))add(segment.suffix,key.slice(1),{...r,apex:false});
   else if(key.includes('*')){
    const tail=key.slice(key.lastIndexOf('*')+1),bucket=tail.startsWith('.')?tail.slice(1):'';
    add(segment.wild,bucket,{...r,re:new RegExp('^'+key.split('*').map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i')});
   }else add(segment.exact,key,{...r,score:1e6});
  }
 }
 return host=>{
  host=host.toLowerCase();let selected;
  for(const segment of segments){
   if(segment.match){if(segment.match(host)){selected=segment;break;}}
   else{
    const choices=[...segment.exact.get(host)||[]],labels=host.split('.');
    for(let i=0;i<labels.length;i++){
     const tail=labels.slice(i).join('.');
     for(const r of segment.suffix.get(tail)||[])if(i>0||r.apex)choices.push(r);
     for(const r of segment.wild.get(tail)||[])if(r.re.test(host))choices.push(r);
    }
    for(const r of segment.wild.get('')||[])if(r.re.test(host))choices.push(r);
    choices.sort((a,b)=>b.score-a.score||a.i-b.i);
    if(choices.length){selected=choices[0];break;}
   }
  }
  const servers=selected?selected.servers:ios?fixture.config.general['dns-server'].split(','):fixture.config.dns.nameserver;
  return {key:selected?.key||'default',servers,groups:[...new Set(servers.map(s=>ios?decodeURIComponent(s.split('#proxy=')[1]?.split('&')[0]||'DIRECT'):s==='system'?s:decodeURIComponent(s.slice(s.lastIndexOf('#')+1).split('&')[0])))]};
 };
}
module.exports={indexRoute,indexDNS};
