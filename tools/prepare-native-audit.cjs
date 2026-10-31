'use strict';
// Export synthetic, isolated native-test inputs. Never reads a live subscription.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'..'),at=process.argv.indexOf('--home');
if(at<0)throw Error('--home is required');
const home=path.resolve(process.argv[at+1]);
if(!home.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Native audit home must be under OS temporary directory');
fs.mkdirSync(home,{recursive:true});
const current=JSON.parse(fs.readFileSync(path.join(root,'CURRENT_RELEASE.json'),'utf8'));
const variant=JSON.parse(fs.readFileSync(path.join(root,'releases/v14.3-ipv4-only/MANIFEST.json'),'utf8'));
const fixture=require(path.join(root,'releases/v14.3/tests/fixture.cjs'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const input=mode=>({proxies:[
 {name:'Audit-A',type:'socks5',server:'127.0.0.1',port:10801,udp:true},
 {name:'Audit-B',type:'socks5',server:'127.0.0.1',port:10802,udp:false},
 {name:'Audit-Broken',type:'socks5',server:'127.0.0.1',port:10803,udp:false}
],tun:{enable:false,'auto-route':false},'x-routeweaver':{'network-mode':mode}});
function isolate(config){
 config.tun={enable:false,'auto-route':false};
 config['allow-lan']=false;config['bind-address']='127.0.0.1';
 for(const key of ['mixed-port','port','socks-port','redir-port','tproxy-port'])config[key]=0;
 config['external-controller']='127.0.0.1:0';config.secret='audit-loopback-only';
 delete config['external-controller-pipe'];delete config['external-controller-unix'];delete config['external-controller-tls'];
 config.listeners=[];config.tunnels=[];config['log-level']='warning';
 config.dns.listen='127.0.0.1:0';config.dns['use-system-hosts']=false;
 config.profile={'store-selected':false,'store-fake-ip':false};
 for(const g of config['proxy-groups']){g.interval=0;g.lazy=true;}
 for(const p of Object.values(config['proxy-providers']||{}))p['health-check']={enable:false};
 fixture.installReviewedProviders(config,home);
 for(const p of Object.values(config['rule-providers']))if(p.type==='http'){
  p.type='file';delete p.url;delete p.interval;delete p.proxy;
 }
 return config;
}
const cases=[];
for(const [platform,file]of Object.entries(current.entries)){
 if(!file.endsWith('.js'))continue;
 for(const mode of ['auto','dual-stack','ipv4-local','ipv4-only']){
  const source=mode==='ipv4-only'?variant.entries[platform].file:file;
  const code=fs.readFileSync(path.join(root,source),'utf8'),ctx=vm.createContext({console:{log(){}}});
  vm.runInContext(code,ctx,{timeout:3000});ctx.auditInput=input(mode==='ipv4-only'?'ipv4-local':mode);
  const config=JSON.parse(JSON.stringify(vm.runInContext('main(auditInput)',ctx,{timeout:5000})));
  const generatedSHA256=sha(JSON.stringify(config));isolate(config);
  const name=platform+'-'+mode,configPath=path.join(home,name+'.json'),bytes=JSON.stringify(config,null,2)+'\n';
  fs.writeFileSync(configPath,bytes);
  cases.push({name,platform,mode,source,sourceSHA256:sha(code),generatedSHA256,isolatedConfigSHA256:sha(bytes),configPath});
 }
}
const plan={revision:'architecture-audit-r1',flavor:current.vpsDirectRevision?'personal':'public',home,
 isolation:'Synthetic loopback nodes; TUN/system routes disabled; all rule sources are local pinned snapshots; live client never read or modified',
 nativeAutoCapability:'NOT_PROVEN_BY_CONFIG_ACCEPTANCE',cases};
fs.writeFileSync(path.join(home,'plan.json'),JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({status:'ISOLATED_INPUTS_READY',cases:cases.length,plan:path.join(home,'plan.json')}));
