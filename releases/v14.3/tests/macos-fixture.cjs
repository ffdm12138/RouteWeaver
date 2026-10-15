'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),base=require('./fixture.cjs');
const entries={'macos-flclash':'src/macos/v14.3-macos-flclash.js','macos-clashmi':'src/macos/v14.3-macos-clashmi.js'};
function generate(platform,input){
  assert.ok(entries[platform],platform);const ctx=vm.createContext({console:{log(){}}});
  vm.runInContext(fs.readFileSync(base.local(entries[platform]),'utf8'),ctx,{filename:entries[platform],timeout:3000});
  return JSON.parse(JSON.stringify(ctx.main(input||{proxies:[{name:'Audit node',type:'ss',server:'2001:db8::10',port:443,cipher:'aes-128-gcm',password:'test-only',udp:true}],tun:{enable:false,'auto-route':false},ipv6:true,dns:{ipv6:true,'fake-ip-range6':'fdfe:dcba:9876::1/64'}})));
}
function load(platform){
  const canonical=base.load(platform==='macos-flclash'?'desktop':'clashmi'),config=generate(platform);
  assert.deepEqual(config.rules,canonical.rules,'Mac routing changed');
  assert.deepEqual(config['rule-providers'],canonical.config['rule-providers'],'Mac providers changed');
  return {...canonical,platform,config,rules:config.rules};
}
module.exports={...base,entries,generate,load};
