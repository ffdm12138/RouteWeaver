'use strict';
// Reviewed policy data only. Runtime source is maintained in runtime/, never patched from a historical release.
module.exports=function(root){
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const local=n=>path.join(root,n),read=n=>JSON.parse(fs.readFileSync(local(n),'utf8'));
const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(local(n))).digest('hex');
const baseline='validation/inputs/v14.2-baseline/',before=read(baseline+'manifest.json'),lock=read('data/rule-sources.lock.json');
for(const e of before.files)assert.equal(sha(baseline+e.file),e.sha256,'Changed frozen baseline: '+e.file);
const reviewed=read(baseline+'data/rules/embedded-domains.json'),business=read('data/rules/business-services.json'),fullCore=read('data/rules/company-core.json');
const safety=read('data/rules/safety-classifiers.json');
const compatibility=read('metadata/clashmi-compatibility.json');
assert.equal(compatibility.status,'OFFICIAL_SOURCE_REVIEWED_DEVICE_NOT_RUN');
for(const e of compatibility.snapshots)assert.equal(sha(e.file),e.sha256,'Changed official Clash Mi bridge snapshot: '+e.file);
require('../validate-azure-async.cjs')(root,fullCore,business);
require('../validate-cdn-regex.cjs')(root,business);
for(const s of lock.sources){assert.match(s.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);assert.equal(sha(s.file),s.sha256);assert.equal(sha(s.classifier.file),s.classifier.sha256);}
const baselineFixture=require(path.join(root,'validation/inputs/v14.2-baseline/tests/fixture.cjs')),baselineModel=baselineFixture.load('android');
const enhancements={
  'Netflix':['nflxext.com','nflxso.net','nflximg.com','netflix.net'],
  'Spotify':['spotifycdn.com','spotifycdn.net','spotify.net'],
  'Telegram':['cdn-telegram.org','telegram.me','tdesktop.com','telegram-cdn.org'],
  'Discord':['discord.media','discordapp.io','discordcdn.com'],
  'TikTok':['tiktokd.net'],
  'Twitter':['tweetdeck.com'],
  'Meta 服务':['wa.me'],
  'Steam':['steam-chat.com'],
  'Epic Games':['fortnite.com','unrealengine.com'],
  '苹果国际':['apple-dns.cn'],
  '哔哩国际':['b23.tv']
};
const services=JSON.parse(JSON.stringify(business.services)),decisions=[];
services.find(s=>s.name==='微软生态').sets.push('linkedin');
// Upstream OpenAI includes unverified third parties and a broad Azure tenant regex.
// The complete approved OpenAI ownership table is already small and stays inline.
services.find(s=>s.name==='OpenAI 服务').sets=[];
for(const s of services)for(const host of enhancements[s.name]||[]){
  const actual=baselineFixture.route(baselineModel,{host,protocol:'TCP',port:443}).group;
  if(actual===s.name){if(!s.seeds.includes(host))s.seeds.push(host);decisions.push({group:s.name,domain:host,decision:'KEEP_REVIEWED_PARENT'});}
  else decisions.push({group:s.name,domain:host,decision:'OMIT_NOT_IN_REVIEWED_GROUP',actual});
}
const domesticCandidates=['baidu.com','bdstatic.com','bdimg.com','qq.com','qpic.cn','gtimg.com','weixin.qq.com','taobao.com','tmall.com','alicdn.com','alipay.com','jd.com','360buyimg.com','weibo.com','weibo.cn','sina.com.cn','zhihu.com','zhimg.com','163.com','126.com','127.net','netease.com','douban.com','doubanio.com','amap.com','autonavi.com','meituan.com','dianping.com','ele.me','ctrip.com','qunar.com','csdn.net','gitee.com','mi.com','xiaomi.com','10010.com','10086.cn','10086.com','189.cn','iqiyi.com','youku.com','pinduoduo.com','pddpic.com','suning.com','360.cn','360.com','sogou.com','sohu.com','bcebos.com','xiaohongshu.com','xhscdn.com'];
const domestic=[];
for(const host of domesticCandidates){const actual=baselineFixture.route(baselineModel,{host,protocol:'TCP',port:443}).group;if(actual==='国内网站'){domestic.push(host);decisions.push({group:'国内网站',domain:host,decision:'KEEP_REVIEWED_PARENT'});}else decisions.push({group:'国内网站',domain:host,decision:'OMIT_NOT_IN_REVIEWED_GROUP',actual});}
const core={};
for(const [group,rows]of Object.entries(fullCore.groups)){
  if(['OpenAI 服务','Anthropic 服务','公共基础服务'].includes(group)){core[group]=rows.slice();continue;}
  const service=services.find(s=>s.name===group),parents=new Set(service.seeds);
  // Exact third-party tenants preserve the reviewed exception boundaries.
  // Country-domain and acquired-brand inventories stay in the remote full table.
  core[group]=rows.filter(r=>{const[k,h]=r.split(',');return k==='DOMAIN'||k==='DOMAIN-REGEX'||k==='DOMAIN-SUFFIX'&&parents.has(h);});
}
const embedded={
  private:{behavior:'classical',payloadText:reviewed.groups.private.payload.join('\n')},
  'category-doh':{behavior:'classical',payloadText:reviewed.groups['category-doh'].payload.join('\n')},
  cn:{behavior:'domain',payloadText:domestic.map(h=>'+.'+h).join('\n')}
};
const pins=Object.fromEntries(lock.sources.map(s=>[s.url.replace(/\/[a-f0-9]{40}\//,'/meta/'),s.url]));
const selected={version:'14.3',date:'2026-10-12',revision:'balanced-r1',scope:'Reviewed service parent domains, exact CDN/auth/Voice tenants, small private/DoH safety tables and bounded domestic parents; complete domain/IP inventories remain remote',
  domesticProtocolRevision:'domestic-protocol-r1',domesticProtocolAuthorization:'User selected reviewed domestic domain TCP/UDP/DNS following the domestic selector on 2026-10-13; unknown public IP UDP and generic STUN remain protected',
  core,services,embedded,decisions,limits:{maxScriptBytes:131072,maxGeneratedConfigBytes:196608},
  inputs:['data/rules/company-core.json','data/rules/business-services.json','data/rules/domestic-direct.json','data/rules/safety-classifiers.json','data/rule-sources.lock.json',baseline+'manifest.json'].map(file=>({file,sha256:sha(file)}))};
const selectedText=JSON.stringify(selected,null,2)+'\n';
return {selected,selectedText,lock,before,baseline,core,services,embedded,pins};
};
