"use strict";
// Contract expectations, deliberately independent of source-emission order.
const net=require('node:net'),cases=[];
function add(name,target,port,protocol,policy,options={},dnsGroup){cases.push({name,flow:{port,protocol,...(net.isIP(target)?{ip:target}:{host:target})},policy,options,dnsGroup:dnsGroup||(net.isIP(target)?null:policy)});}
const owned={
  'OpenAI 服务':['chatgpt.com','api.openai.com','oaistatic.com','oaiusercontent.com','sora.com','chatgpt.livekit.cloud','host.livekit.cloud','turn.livekit.cloud','openai.qualtrics.com','openaiassets.blob.core.windows.net','chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com'],
  'Anthropic 服务':['api.anthropic.com','claude.ai','claude.com','claude.dev','claudeusercontent.com','servd-anthropic-website.b-cdn.net'],
  '谷歌服务':['gemini.google.com','aistudio.google.com','generativelanguage.googleapis.com','antigravity.google','notebook.google','google.com','google.cn','stun.l.google.com','youtube.com','googlevideo.com','recaptcha.net','googleapis.cn','xn--ngstr-lra8j.com'],
  '微软生态':['copilot.microsoft.com','github.com','githubcopilot.com','officecdn.microsoft.com','download.microsoft.com','login.microsoftonline.com','linkedin.com',
    'bingsettingssearch.trafficmanager.net','dtlgalleryint.cloudapp.net','poshtestgallery.cloudapp.net','psg-int-centralus.cloudapp.net','psg-int-eastus.cloudapp.net','vscode-sync-insiders.trafficmanager.net','vscode-sync.trafficmanager.net'],
  'Steam':['steamserver.net','steampowered.com','dl.steam.clngaa.com'],
  'Epic Games':['epicgames.com'], 'Discord':['discord.com','discordapp.net'],
  'Telegram':['telegram.org','t.me'], '哔哩国际':['voice.bilibili.com','stun.chat.bilibili.com'],
};
for(const [group,hosts]of Object.entries(owned))for(const host of hosts){
  add('company-'+host+'-tcp',host,443,'TCP',group);
  for(const port of [443,3478,49000])add('company-'+host+'-udp-'+port,host,port,'UDP',group);
  add('company-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},group);
}
const shared=['challenges.cloudflare.com','stun.cloudflare.com','tenant.auth0.com','anthropic.auth0.com','r1.host.livekit.cloud','r1.turn.livekit.cloud','other-tenant.livekit.cloud','api.workos.com','js.stripe.com','o33249.ingest.sentry.io','browser-intake-datadoghq.com','mail.sendgrid.net','a.b.ct.sendgrid.net','another.webpubsub.azure.com','chatgpt-async-webps-dev-eastus-1.webpubsub.azure.com','tenant.blob.core.windows.net','tenant.azurewebsites.net','tenant.appspot.com','tenant.firebaseio.com','foo.pages.dev','bucket.s3.amazonaws.com','foo.cloudfront.net','foo.github.io','client-api.arkoselabs.com','cdn.usefathom.com'];
for(const host of shared){for(const protocol of ['TCP','UDP'])add('shared-'+host+'-'+protocol,host,49000,protocol,'公共基础服务');add('shared-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'公共基础服务');}
// Independent business expectations: customer resource names do not identify
// the cloud provider's own products. These cover every added reviewed suffix.
const cloudTenants=['tenant.cloudapp.net','tenant.cloudapp.azure.com','tenant.azure-api.net','tenant.azurecontainer.io','tenant.trafficmanager.net',
  'tenant.azurecr.io','tenant.cosmos.azure.com','tenant.documents.azure.com','tenant.vault.azure.net','tenant.azmk8s.io','tenant.servicebus.windows.net','tenant.database.windows.net',
  'tenant.file.core.windows.net','tenant.queue.core.windows.net','tenant.table.core.windows.net','tenant.z22.web.core.windows.net','tenant.dfs.core.windows.net',
  'tenant.chinacloudapp.cn','tenant.blob.core.chinacloudapi.cn','tenant.queue.core.chinacloudapi.cn','tenant.table.core.chinacloudapi.cn','tenant.dfs.core.chinacloudapi.cn',
  'tenant.database.chinacloudapi.cn','tenant.servicebus.chinacloudapi.cn','tenant.vault.azure.cn','tenant.azure-api.cn','us-central1-thirdparty.cloudfunctions.net',
  'storage.googleapis.com','content-storage.googleapis.com','storage.cloud.google.com','storage.mtls.googleapis.com','storage.mtls.cloud.google.com'];
for(const host of cloudTenants){
  for(const protocol of ['TCP','UDP']){
    add('cloud-shared-'+host+'-'+protocol,host,49000,protocol,'公共基础服务');
    add('cloud-company-direct-conflict-'+host+'-'+protocol,host,49000,protocol,'公共基础服务',{selections:{'微软生态':'DIRECT','谷歌服务':'DIRECT'}},'公共基础服务');
  }
  add('cloud-shared-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'公共基础服务');
}
const exactMicrosoft=owned['微软生态'].slice(7);
for(const host of exactMicrosoft){for(const protocol of ['TCP','UDP'])add('exact-tenant-descendant-'+host+'-'+protocol,'child.'+host,49000,protocol,'公共基础服务');add('exact-tenant-descendant-no-udp-'+host,'child.'+host,49000,'UDP','REJECT',{udpSupported:false},'公共基础服务');}
for(const host of ['foo.undefined','foo.null','tenant.cloudapp.net.evil.example.net','tenant.cloudfunctions.net.evil.example.net','storage.googleapis.com.evil.example.net']){
  for(const protocol of ['TCP','UDP'])add('classification-negative-'+host+'-'+protocol,host,49000,protocol,'漏网之鱼');add('classification-negative-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'漏网之鱼');
}
for(const host of ['baidu.com','qq.com','taobao.com','jd.com','weibo.com','zhihu.com','douyin.com','feishu.cn','prts.plus','cnbeta.com','cnbetacdn.com','easou.com','mob.com','baidustatic.com','didi-labs.com']){
  add('domestic-site-'+host+'-tcp',host,443,'TCP','DIRECT',{},'漏网之鱼');
  add('domestic-site-'+host+'-udp',host,49000,'UDP','漏网之鱼');add('domestic-site-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'漏网之鱼');
}
for(const host of ['relay.example.cn','stun.example.cn','stunning.example.cn','return.example.cn','cn-udp.custom.cn','unknown.example.net','crixet.com','notopenai.example.net','onedrive-unrelated.example.cn']){
  for(const port of [443,3478,5349,5004,27015,49000])add('unknown-udp-'+host+'-'+port,host,port,'UDP','漏网之鱼');
  add('unknown-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'漏网之鱼');
}
for(const ip of ['223.5.5.5','2400:3200::1','2001:db8:abcd::1','9.9.9.9']){
  add('unknown-address-'+ip,ip,49000,'UDP','漏网之鱼');add('unknown-address-no-udp-'+ip,ip,49000,'UDP','REJECT',{udpSupported:false});
}
for(const ip of ['127.0.0.1','192.168.1.1','::1','fd12::1'])for(const protocol of ['TCP','UDP'])add('private-'+ip+'-'+protocol,ip,49000,protocol,'DIRECT');
for(const protocol of ['TCP','UDP']){
  add('voice-ip-'+protocol,'13.71.25.29',3478,protocol,'OpenAI 服务');
  add('telegram-ipv6-'+protocol,'2001:b28:f23d::1',49000,protocol,'Telegram');
  add('steam-explicit-direct-'+protocol,'steamserver.net',27015,protocol,'DIRECT',{selections:{Steam:'DIRECT'}},'Steam');
  add('openai-explicit-direct-'+protocol,'chatgpt.com',443,protocol,'DIRECT',{selections:{'OpenAI 服务':'DIRECT'}},'OpenAI 服务');
}
add('domestic-tcp','ordinary.example.cn',443,'TCP','DIRECT',{},'漏网之鱼');
add('domestic-cnip-tcp','223.5.5.5',443,'TCP','DIRECT');
add('domestic-ipv6-tcp','2400:3200::1',443,'TCP','DIRECT');
for(const host of ['baidu.com','qq.com','taobao.com','jd.com','weibo.com','zhihu.com','douyin.com','feishu.cn','prts.plus','cnbeta.com','baidustatic.com','didi-labs.com','ordinary.example.cn','223.5.5.5','2400:3200::1']){
  add('domestic-selector-ai-'+host,host,443,'TCP','国内网站',{selections:{'国内网站':'国内网站'}},net.isIP(host)?null:'漏网之鱼');
  add('domestic-selector-video-'+host,host,443,'TCP','国内网站',{selections:{'国内网站':'国内网站'}},net.isIP(host)?null:'漏网之鱼');cases.at(-1).followVideo=true;
}
for(const host of ['google.cn','gemini.google.com','api.openai.com','tenant.chinacloudapp.cn','steamserver.net']){
  const expected=host==='api.openai.com'?'OpenAI 服务':host==='tenant.chinacloudapp.cn'?'公共基础服务':host==='steamserver.net'?'Steam':'谷歌服务';
  add('domestic-selector-preserves-company-'+host,host,443,'TCP',expected,{selections:{'国内网站':'国内网站'}},expected);
}
add('explicit-manual-direct','shiyi.click',49000,'UDP','DIRECT');
add('dot-rejected','unknown.example.net',853,'TCP','REJECT',{},'漏网之鱼');
for(const ip of ['223.5.5.5','2400:3200::1','fdfe:dcba:9876::42'])for(const protocol of ['TCP','UDP']){
  cases.push({name:'protected-host-with-address-'+ip+'-'+protocol,flow:{host:'chatgpt.com',ip,port:443,protocol},policy:'OpenAI 服务',options:{},dnsGroup:'OpenAI 服务',staticOnly:true});
}
module.exports={cases,owned,shared,cloudTenants,exactMicrosoft};

for(const [host,group] of [['openai.com.cdn.cloudflare.net','OpenAI 服务'],['audit-child.openai.com.cdn.cloudflare.net','公共基础服务'],['microsoftazure.com','微软生态'],['byteoversea.com','TikTok'],['ibytedtos.com','TikTok'],['audit-child.recaptcha.net','谷歌服务']]) {
  for(const protocol of ['TCP','UDP']) cases.push({name:'thunder-company-'+host+'-'+protocol,flow:{host,port:443,protocol},policy:group,dnsGroup:group,options:{}});
  cases.push({name:'thunder-no-udp-'+host,flow:{host,port:443,protocol:'UDP'},policy:'REJECT',options:{udpSupported:false}});
}
// Independently reviewed exact external DoH hosts. A domestic DIRECT group
// must never silently carry these application-originated encrypted resolvers.
for(const host of ['dns.alidns.com','doh.pub','dns.pub','dns.cloudflare.com','one.one.one.one','dns.cfiec.net','sm2.doh.pub','doh.360.cn','doh-pure.onedns.net','doh.onedns.net']){
  for(const protocol of ['TCP','UDP']) add('r2-known-doh-'+host+'-'+protocol,host,443,protocol,'REJECT');
}

// R4: Azure async expectations are identical across platforms.
for(const host of ['doh.18bit.cn','dns.adguard.com','doh.dns.apple.com','freedns.controld.com','private.nextdns.io','audit-child.cloudflare-dns.com'])
  for(const protocol of ['TCP','UDP'])add('r3-approved-doh-'+host+'-'+protocol,host,443,protocol,'REJECT');
for(const host of ['audit-child.routerlogin.com','audit-child.tplogin.cn','p.to','audit-child.p.to','acl4.ssr','wifi.cmcc']){
  add('r3-no-public-lan-direct-'+host,host,49000,'UDP','漏网之鱼');
  add('r3-no-public-lan-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'漏网之鱼');
}
for(const host of ['chatgpt-async-webps-prod-eastus-x.webpubsub.azure.com','chatgpt-async-webps-prod-eastus-1.extra.webpubsub.azure.com'])
  for(const protocol of ['TCP','UDP'])add('r3-shared-async-'+host+'-'+protocol,host,443,protocol,'公共基础服务');

for(const host of ['chatgpt-async-webps-prod-eastus-17.webpubsub.azure.com','chatgpt-async-webps-prod-eastus-23.webpubsub.azure.com']) {
  for(const protocol of ['TCP','UDP']) add('r4-reviewed-async-'+host+'-'+protocol,host,443,protocol,'OpenAI 服务');
  add('r4-reviewed-async-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'OpenAI 服务');
}
for(const host of ['chatgpt-async-webps-prod-eastus-2.webpubsub.azure.com','chatgpt-async-webps-prod-eastus-01.webpubsub.azure.com','chatgpt-async-webps-prod-eastus.evil-1.webpubsub.azure.com','chatgpt-async-webps-prod-newregion-31337.webpubsub.azure.com','audit-child.chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com']) {
  for(const protocol of ['TCP','UDP']) add('r4-unreviewed-async-'+host+'-'+protocol,host,443,protocol,'公共基础服务');
  add('r4-unreviewed-async-no-udp-'+host,host,49000,'UDP','REJECT',{udpSupported:false},'公共基础服务');
}
for(const host of ['chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com','chatgpt-async-webps-prod-eastus-17.webpubsub.azure.com','chatgpt-async-webps-prod-eastus-23.webpubsub.azure.com']) for(const protocol of ['TCP','UDP']) {
  add('r4-reviewed-async-explicit-direct-'+host+'-'+protocol,host,443,protocol,'DIRECT',{selections:{'OpenAI 服务':'DIRECT'}},'OpenAI 服务');
  add('r4-reviewed-async-before-shared-direct-'+host+'-'+protocol,host,443,protocol,'OpenAI 服务',{selections:{'公共基础服务':'DIRECT','微软生态':'DIRECT','国内网站':'DIRECT'}},'OpenAI 服务');
}

// R5 targeted native routing controls, including valid TCP STUN Binding payloads.
cases.push(...[
  {
    "name": "r5-stun-stun.audit.cn-3478-TCP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-stun.audit.cn-3478-UDP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-stun.audit.cn-5349-TCP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 5349,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-stun.audit.cn-5349-UDP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 5349,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-stun.audit.cn-19307-TCP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 19307,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-stun.audit.cn-19307-UDP",
    "flow": {
      "host": "stun.audit.cn",
      "port": 19307,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-3478-TCP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-3478-UDP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-5349-TCP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 5349,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-5349-UDP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 5349,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-19307-TCP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 19307,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-turn.audit.cn-19307-UDP",
    "flow": {
      "host": "turn.audit.cn",
      "port": 19307,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-3478-TCP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-3478-UDP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-5349-TCP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 5349,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-5349-UDP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 5349,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-19307-TCP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 19307,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-relay.audit.cn-19307-UDP",
    "flow": {
      "host": "relay.audit.cn",
      "port": 19307,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-stun-223.5.5.5-3478-TCP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-223.5.5.5-3478-UDP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-223.5.5.5-5349-TCP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 5349,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-223.5.5.5-5349-UDP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 5349,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-223.5.5.5-19307-TCP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 19307,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-223.5.5.5-19307-UDP",
    "flow": {
      "ip": "223.5.5.5",
      "port": 19307,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-3478-TCP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-3478-UDP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-5349-TCP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 5349,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-5349-UDP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 5349,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-19307-TCP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 19307,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-stun-2400:3200::1-19307-UDP",
    "flow": {
      "ip": "2400:3200::1",
      "port": 19307,
      "protocol": "UDP"
    },
    "policy": "漏网之鱼",
    "options": {}
  },
  {
    "name": "r5-cdn-cdn1-epicgames-17.file.myqcloud.com-TCP",
    "flow": {
      "host": "cdn1-epicgames-17.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-cdn1-epicgames-17.file.myqcloud.com-TCP",
    "flow": {
      "host": "cdn1-epicgames-17.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-cdn1-epicgames-17.file.myqcloud.com-UDP",
    "flow": {
      "host": "cdn1-epicgames-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-cdn1-epicgames-17.file.myqcloud.com-UDP",
    "flow": {
      "host": "cdn1-epicgames-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-no-udp-cdn1-epicgames-17.file.myqcloud.com",
    "flow": {
      "host": "cdn1-epicgames-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-epicgames-download1-17.file.myqcloud.com-TCP",
    "flow": {
      "host": "epicgames-download1-17.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-epicgames-download1-17.file.myqcloud.com-TCP",
    "flow": {
      "host": "epicgames-download1-17.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-epicgames-download1-17.file.myqcloud.com-UDP",
    "flow": {
      "host": "epicgames-download1-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-epicgames-download1-17.file.myqcloud.com-UDP",
    "flow": {
      "host": "epicgames-download1-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-no-udp-epicgames-download1-17.file.myqcloud.com",
    "flow": {
      "host": "epicgames-download1-17.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-hses1.akamaized.net-TCP",
    "flow": {
      "host": "hses1.akamaized.net",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "Disney+",
    "options": {},
    "dnsGroup": "Disney+"
  },
  {
    "name": "r5-cdn-direct-hses1.akamaized.net-TCP",
    "flow": {
      "host": "hses1.akamaized.net",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Disney+": "DIRECT"
      }
    },
    "dnsGroup": "Disney+"
  },
  {
    "name": "r5-cdn-hses1.akamaized.net-UDP",
    "flow": {
      "host": "hses1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "Disney+",
    "options": {},
    "dnsGroup": "Disney+"
  },
  {
    "name": "r5-cdn-direct-hses1.akamaized.net-UDP",
    "flow": {
      "host": "hses1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Disney+": "DIRECT"
      }
    },
    "dnsGroup": "Disney+"
  },
  {
    "name": "r5-cdn-no-udp-hses1.akamaized.net",
    "flow": {
      "host": "hses1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "Disney+"
  },
  {
    "name": "r5-cdn-epicgames-download1.akamaized.net-TCP",
    "flow": {
      "host": "epicgames-download1.akamaized.net",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-epicgames-download1.akamaized.net-TCP",
    "flow": {
      "host": "epicgames-download1.akamaized.net",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-epicgames-download1.akamaized.net-UDP",
    "flow": {
      "host": "epicgames-download1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "Epic Games",
    "options": {},
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-direct-epicgames-download1.akamaized.net-UDP",
    "flow": {
      "host": "epicgames-download1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "DIRECT",
    "options": {
      "selections": {
        "Epic Games": "DIRECT"
      }
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-no-udp-epicgames-download1.akamaized.net",
    "flow": {
      "host": "epicgames-download1.akamaized.net",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "Epic Games"
  },
  {
    "name": "r5-cdn-unreviewed-cdn1-epicgames-9999.file.myqcloud.com-TCP",
    "flow": {
      "host": "cdn1-epicgames-9999.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "公共基础服务",
    "options": {},
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-cdn-unreviewed-cdn1-epicgames-9999.file.myqcloud.com-UDP",
    "flow": {
      "host": "cdn1-epicgames-9999.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "公共基础服务",
    "options": {},
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-cdn-unreviewed-no-udp-cdn1-epicgames-9999.file.myqcloud.com",
    "flow": {
      "host": "cdn1-epicgames-9999.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-cdn-unreviewed-epicgames-download1-00017.file.myqcloud.com-TCP",
    "flow": {
      "host": "epicgames-download1-00017.file.myqcloud.com",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "公共基础服务",
    "options": {},
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-cdn-unreviewed-epicgames-download1-00017.file.myqcloud.com-UDP",
    "flow": {
      "host": "epicgames-download1-00017.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "公共基础服务",
    "options": {},
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-cdn-unreviewed-no-udp-epicgames-download1-00017.file.myqcloud.com",
    "flow": {
      "host": "epicgames-download1-00017.file.myqcloud.com",
      "port": 443,
      "protocol": "UDP"
    },
    "policy": "REJECT",
    "options": {
      "udpSupported": false
    },
    "dnsGroup": "公共基础服务"
  },
  {
    "name": "r5-known-before-stun-stun.l.google.com-TCP",
    "flow": {
      "host": "stun.l.google.com",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "谷歌服务",
    "options": {},
    "dnsGroup": "谷歌服务"
  },
  {
    "name": "r5-known-before-stun-stun.l.google.com-UDP",
    "flow": {
      "host": "stun.l.google.com",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "谷歌服务",
    "options": {},
    "dnsGroup": "谷歌服务"
  },
  {
    "name": "r5-known-before-stun-turn.livekit.cloud-TCP",
    "flow": {
      "host": "turn.livekit.cloud",
      "port": 3478,
      "protocol": "TCP"
    },
    "policy": "OpenAI 服务",
    "options": {},
    "dnsGroup": "OpenAI 服务"
  },
  {
    "name": "r5-known-before-stun-turn.livekit.cloud-UDP",
    "flow": {
      "host": "turn.livekit.cloud",
      "port": 3478,
      "protocol": "UDP"
    },
    "policy": "OpenAI 服务",
    "options": {},
    "dnsGroup": "OpenAI 服务"
  },
  {
    "name": "r5-host-stun-nonstandard-stun.audit.cn",
    "flow": {
      "host": "stun.audit.cn",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-host-stun-nonstandard-turn.audit.cn",
    "flow": {
      "host": "turn.audit.cn",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-host-stun-nonstandard-relay.stun.audit.cn",
    "flow": {
      "host": "relay.stun.audit.cn",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  },
  {
    "name": "r5-host-stun-nonstandard-relay.turn.audit.cn",
    "flow": {
      "host": "relay.turn.audit.cn",
      "port": 443,
      "protocol": "TCP"
    },
    "policy": "漏网之鱼",
    "options": {},
    "dnsGroup": "漏网之鱼"
  }
]);

// domestic-protocol-r1 authorized expectations; unrelated historical cases remain.
const protocolDomesticHosts=new Set(['baidu.com','qq.com','taobao.com','jd.com','weibo.com','zhihu.com','douyin.com','feishu.cn','prts.plus','cnbeta.com','cnbetacdn.com','easou.com','mob.com','baidustatic.com','didi-labs.com']);
const protocolStunHost=h=>/(^|\.)(?:stun|turn)\./i.test(h||'');
const protocolStunPort=p=>Number(p)===3478||Number(p)===5349||Number(p)>=19302&&Number(p)<=19309;
for(const t of cases){
 const h=t.flow.host||'',declared=protocolDomesticHosts.has(h)||h.endsWith('.cn');
 if(!declared||protocolStunHost(h))continue;
 if(t.dnsGroup==='漏网之鱼')t.dnsGroup='国内网站';
 if(t.flow.protocol==='UDP'&&!protocolStunPort(t.flow.port)&&(t.policy==='漏网之鱼'||t.name.startsWith('domestic-site-no-udp-')||t.policy==='REJECT'&&t.dnsGroup==='国内网站'))t.policy=t.options?.selections?.['国内网站']?(t.options.udpSupported===false&&t.options.selections['国内网站']!=='DIRECT'?'REJECT':t.options.selections['国内网站']):'DIRECT';
}
for(const host of ['szfile.weixin.qq.com','szextshort.weixin.qq.com','wxapp.tc.qq.com','qlogo.cn','mmbiz.qpic.cn'])for(const protocol of ['TCP','UDP']){
 add('domestic-protocol-wechat-direct-'+host+'-'+protocol,host,443,protocol,'DIRECT',{},'国内网站');
 add('domestic-protocol-wechat-ai-'+host+'-'+protocol,host,443,protocol,'国内网站',{selections:{'国内网站':'国内网站'}},'国内网站');
 add('domestic-protocol-wechat-video-'+host+'-'+protocol,host,443,protocol,'国内网站',{selections:{'国内网站':'国内网站'}},'国内网站');cases.at(-1).followVideo=true;
 if(protocol==='UDP')add('domestic-protocol-wechat-no-udp-'+host,host,443,protocol,'REJECT',{selections:{'国内网站':'国内网站'},udpSupported:false},'国内网站');
}
