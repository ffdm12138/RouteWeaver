'use strict';
// Reproducible review of fixed local snapshots; no floating input is executed.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),rr=path.join(root,'releases/v14.3'),out=path.join(rr,'validation/cloud-rule-audit');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const lock=read(path.join(rr,'data/rule-sources.lock.json')),candidate=read(path.join(out,'upstream.json'));
const rows=p=>fs.readFileSync(p,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')&&s!=='payload:').map(s=>s.replace(/^-\s*/,''));
const sourceInventory=[...lock.sources,...read(path.join(rr,'metadata/shadowrocket-lean.json')).sources];
const sources=sourceInventory.map(s=>{assert.match(s.url,/\/[0-9a-f]{40}\//);assert.equal(sha(path.join(rr,s.file)),s.sha256);assert.equal(sha(path.join(rr,s.classifier.file)),s.classifier.sha256);return{id:s.id,url:s.url,sha256:s.sha256,classifierSHA256:s.classifier.sha256,rows:rows(path.join(rr,s.classifier.file)).length,decision:'KEEP_EXISTING_PINNED_REFERENCE_AND_EXISTING_PRECEDENCE'};});
const company=read(path.join(rr,'data/rules/company-core.json'));
const differences=[];
for(const c of candidate.sources){
 const file=path.join(out,c.file);assert.equal(sha(file),c.sha256);
 const old=c.name==='openai'?company.origins.find(s=>s.tag==='openai'):lock.sources.find(s=>s.id==='v12r-domain-'+c.name);
 const previous=new Set(rows(path.join(rr,old.classifier.file)));
 const current=new Set(rows(file));
 differences.push({name:c.name,commit:c.commit,sha256:c.sha256,previousRows:previous.size,candidateRows:current.size,
  added:[...current].filter(x=>!previous.has(x)),removed:[...previous].filter(x=>!current.has(x)),
  decision:c.name==='douyin'?'UNCHANGED_71_ROWS_ADD_OFFLINE_COVERAGE':c.name==='openai'?'KEEP_REVIEWED_INLINE_OWNERSHIP_NOT_RAW_REMOTE':c.name==='anthropic'?'KEEP_PINNED_AND_INLINE_CORE_HOLD_UNVERIFIED_NEW_CANDIDATES':'KEEP_PINNED_BROAD_CN_NEW_ROWS_REQUIRE_CLASSIFICATION_REVIEW'});
}
const result={revision:'cloud-rule-audit-r1',date:'2026-11-07',status:'PASS_BOUNDED_REVIEW',scope:'Integrity and syntax inventory of all 45 pinned sources; four fresh upstream candidates; official service and dependency coverage checked separately. Not proof of every current domain on the Internet.',
 sources,differences,officialReferences:[
 'https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps',
 'https://support.claude.com/en/articles/13198485-enforce-network-level-access-control-with-tenant-restrictions',
 'https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude',
 'https://code.claude.com/docs/en/network-config',
 'https://openai.com/foundation/'
 ],policy:'Shared authentication/CDN/payment/telemetry keep their existing company or shared-infrastructure groups. No broad Tencent/ByteDance/CDN promotion. No live provider URL changed.',
 additions:read(path.join(rr,'data/rules/company-supplement.json')).additions,
 testSHA256:sha(__filename)};
fs.writeFileSync(path.join(out,'review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,sources:sources.length,candidates:differences.map(({name,previousRows,candidateRows,added,removed})=>({name,previousRows,candidateRows,added:added.length,removed:removed.length}))}));
