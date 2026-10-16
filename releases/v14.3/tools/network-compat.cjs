'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=function(code,replaceOnce){
  const runtime=fs.readFileSync(path.join(__dirname,'network-compat-runtime.js'),'utf8').replaceAll('\r\n','\n');
  code=replaceOnce(code,'function v14ProviderGuard(provider, name, retain, warnings, upgradingFromV13) {',runtime+'\nfunction v14ProviderGuard(provider, name, retain, warnings, upgradingFromV13) {');
  code=replaceOnce(code,'.filter(e => e !== guardName && e !== guardType);','.filter(e => e !== guardName && e !== guardType && e !== V14_NODE_FAMILY_DEFAULT);');
  const end=code.lastIndexOf('  return config;\n}');
  if(end<0)throw Error('Missing policy return');
  return code.slice(0,end)+code.slice(end).replace('  return config;','  return v14NetworkDefaults(config);');
};
