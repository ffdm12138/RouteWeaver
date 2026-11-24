'use strict';
// Expectations use the immutable previous normal TCP classification.
const net=require('node:net');
const mediaDomains=require('../data/rules/wechat-media.json');
const eduDomains=['edu.cn','ac.cn'];
const mediaHost=host=>mediaDomains.some(domain=>host===domain||host.endsWith('.'+domain));
const eduHost=host=>eduDomains.some(domain=>host===domain||host.endsWith('.'+domain));
const stunName=host=>/(^|\.)(?:stun|turn)\./i.test(host||'');
const stunPort=port=>Number(port)===3478||Number(port)===5349||Number(port)>=19302&&Number(port)<=19309;
const known=(host,beforeRoute)=>!!host&&!net.isIP(host)&&!stunName(host)&&beforeRoute(host).group==='国内网站';
const mediaDirect=(host,beforeRoute)=>mediaHost(host)&&!stunName(host)&&
 ['DIRECT','国内网站','漏网之鱼'].includes(beforeRoute(host).group);
const eduDirect=(host,beforeRoute)=>eduHost(host)&&!stunName(host)&&
 ['DIRECT','国内网站','漏网之鱼'].includes(beforeRoute(host).group);
const driveExactHosts = [
 'drive.googleapis.com', 'drive.usercontent.google.com', 'drive-data-export.usercontent.google.com',
 'drive-data-export-eu.usercontent.google.com', 'drive-thirdparty.googleusercontent.com',
 'driveactivity.googleapis.com', 'drivefrontend-pa.clients6.google.com', 'drivefrontend-pa.googleapis.com',
 'drivelabels.googleapis.com', 'drivesharefrontend-pa.clients6.google.com', 'drivesharefrontend-pa.googleapis.com',
];
function addedServiceGroup(host){
 if(host==='accounts.youtube.com')return '谷歌服务';
 if(host==='youtubei.googleapis.com'||['youtube.com','youtu.be','googlevideo.com','ytimg.com','youtube-nocookie.com']
   .some(domain=>host===domain||host.endsWith('.'+domain)))return 'YouTube';
 if(driveExactHosts.includes(host)||['drive.google.com','googledrive.com']
   .some(domain=>host===domain||host.endsWith('.'+domain)))return 'Google Drive';
 if(['archive.ubuntu.com','security.ubuntu.com','ports.ubuntu.com','old-releases.ubuntu.com']
   .some(domain=>host===domain||host.endsWith('.'+domain)))return '高网速视频用';
}
function expectedRoute(host,protocol,supported,beforeRoute){
 const group=addedServiceGroup(host);
 if(group)return {group,policy:protocol==='UDP'&&!supported?'REJECT':group};
 const old=beforeRoute(host,protocol,supported);
 if(mediaDirect(host,beforeRoute)||eduDirect(host,beforeRoute))return {group:'DIRECT',policy:'DIRECT'};
 return protocol==='UDP'&&known(host,beforeRoute)?{group:'国内网站',policy:'DIRECT'}:old;
}
function expectedDNS(host,beforeRoute,beforeDNS){
 const group=addedServiceGroup(host);
 if(group)return [group];
 const old=beforeDNS(host);
 if(mediaDirect(host,beforeRoute))return ['DIRECT'];
 if(eduDirect(host,beforeRoute))return ['system','DIRECT'];
 return known(host,beforeRoute)&&old.groups.length===1&&old.groups[0]==='漏网之鱼'?['国内网站']:old.groups;
}
module.exports={known,mediaHost,mediaDirect,eduDomains,eduHost,eduDirect,stunName,stunPort,driveExactHosts,addedServiceGroup,expectedRoute,expectedDNS};
