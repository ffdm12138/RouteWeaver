'use strict';
// Expectations use the immutable previous normal TCP classification.
const net=require('node:net');
const stunName=host=>/(^|\.)(?:stun|turn)\./i.test(host||'');
const stunPort=port=>Number(port)===3478||Number(port)===5349||Number(port)>=19302&&Number(port)<=19309;
const known=(host,beforeRoute)=>!!host&&!net.isIP(host)&&!stunName(host)&&beforeRoute(host).group==='国内网站';
function expectedRoute(host,protocol,supported,beforeRoute){
 const old=beforeRoute(host,protocol,supported);
 return protocol==='UDP'&&known(host,beforeRoute)?{group:'国内网站',policy:'DIRECT'}:old;
}
function expectedDNS(host,beforeRoute,beforeDNS){
 const old=beforeDNS(host);
 return known(host,beforeRoute)&&old.groups.length===1&&old.groups[0]==='漏网之鱼'?['国内网站']:old.groups;
}
module.exports={known,stunName,stunPort,expectedRoute,expectedDNS};
