'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=function(root,business){
  const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
  const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex');
  const file='data/rules/cdn-regex-review.json',review=read(file);
  business ||= read('data/rules/business-services.json');
  assert.equal(review.status,'REVIEWED_EXACT_POLICY_SUBSET','Unreviewed CDN policy');
  assert.equal(review.remoteSourceChanges,0);assert.equal(review.fallbackPolicy,'公共基础服务');
  assert.equal(business.cdnRegexReview?.file,file);assert.equal(business.cdnRegexReview.sha256,sha(file),'Unbound CDN review');
  assert.deepEqual(review.numberTails,['0','1','17','23','999'],'Changed finite CDN review scope');
  const expected=[];
  for(const source of review.legacyClassifiers){
    assert.equal(sha(source.file),source.sha256,'Changed frozen CDN classifier');
    const rows=fs.readFileSync(path.join(root,source.file),'utf8').split(/\r?\n/).filter(r=>r.startsWith('DOMAIN-REGEX,'));
    assert.deepEqual(source.rows,rows,'Unreviewed CDN regex row');
    for(const row of rows){
      const entry=review.entries.find(e=>e.sourceRow===row&&e.policy===source.policy);
      assert.ok(entry,'Missing CDN projection');const regex=new RegExp(row.slice(13));
      let hosts;
      if(source.policy==='Disney+')hosts=['',...'1234567'].map(n=>'hses'+n+'.akamaized.net');
      else if(row.includes('akamaized'))hosts=Array.from({length:10},(_,n)=>'epicgames-download'+n+'.akamaized.net');
      else hosts=Array.from({length:10},(_,n)=>review.numberTails.map(t=>row.startsWith('DOMAIN-REGEX,^cdn')?'cdn'+n+'-epicgames-'+t+'.file.myqcloud.com':'epicgames-download'+n+'-'+t+'.file.myqcloud.com')).flat();
      assert.deepEqual(entry.hosts,hosts,'CDN exact subset exceeds reviewed finite scope');
      for(const host of entry.hosts){assert.match(host,/^[a-z0-9.-]+$/);assert.ok(regex.test(host),'CDN host exceeds frozen regex');}
      const service=business.services.find(s=>s.name===entry.policy);assert.ok(service,'Missing CDN company');
      assert.ok(entry.hosts.every(h=>service.exact?.includes(h)),'Missing common CDN DNS/routing host');
      expected.push(entry);
    }
  }
  assert.deepEqual(review.entries,expected);assert.equal(expected.flatMap(e=>e.hosts).length,118);
  assert.deepEqual(review.sharedGuards,[
    {mihomo:String.raw`DOMAIN-REGEX,^cdn.*-epicgames-.*\.file\.myqcloud\.com$`,shadowrocket:'DOMAIN-WILDCARD,cdn*-epicgames-*.file.myqcloud.com',dnsHost:'cdn*-epicgames-*.file.myqcloud.com'},
    {mihomo:String.raw`DOMAIN-REGEX,^epicgames-download.*-.*\.file\.myqcloud\.com$`,shadowrocket:'DOMAIN-WILDCARD,epicgames-download*-*.file.myqcloud.com',dnsHost:'epicgames-download*-*.file.myqcloud.com'}
  ],'Unsafe CDN shared guard');
  return review;
};
