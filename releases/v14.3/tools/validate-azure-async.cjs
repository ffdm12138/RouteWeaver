'use strict';
// Validate the finite reviewed policy before either synchronizer or generator
// writes output. Historical source bytes are evidence, never runtime lists.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=function(root,core,business){
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  const file='data/rules/azure-async-review.json',review=read(file);
  core ||= read('data/rules/company-core.json');business ||= read('data/rules/business-services.json');
  assert.equal(review.status,'REVIEWED_EXACT_POLICY_SUBSET','Unreviewed Azure async policy');
  assert.equal(review.policy,'OpenAI 服务');assert.equal(review.fallbackPolicy,'公共基础服务');
  assert.equal(review.remoteSourceChanges,0);
  assert.equal(review.legacyClassifier.file,'data/rules/company-inputs/openai.list');
  assert.equal(sha(review.legacyClassifier.file),review.legacyClassifier.sha256,'Changed Azure async historical input');
  const rows=fs.readFileSync(path.join(root,review.legacyClassifier.file),'utf8').trim().split(/\r?\n/);
  assert.ok(rows.includes(review.legacyClassifier.row),'Azure async review is not bound to the historical classifier');
  assert.ok(review.legacyClassifier.row.startsWith('DOMAIN-REGEX,'));
  const regex=new RegExp(review.legacyClassifier.row.slice('DOMAIN-REGEX,'.length));
  assert.ok(Array.isArray(review.hosts)&&review.hosts.length&&new Set(review.hosts).size===review.hosts.length);
  for(const host of review.hosts){
    assert.match(host,/^chatgpt-async-webps-prod-[a-z0-9]+-[0-9]+\.webpubsub\.azure\.com$/,'Unsafe exact Azure async host');
    assert.ok(regex.test(host),'Azure async exception exceeds the previously reviewed policy');
    assert.ok(review.evidence.some(e=>e.host===host&&e.basis),'Missing Azure async exception evidence');
  }
  assert.equal(core.azureAsyncReview?.sha256,sha(file),'Unbound Azure async core review');
  assert.deepEqual(business.azureAsyncReview,core.azureAsyncReview,'Azure async routing/DNS review mismatch');
  const names=business.services.find(s=>s.name===review.policy).exact.filter(h=>h.endsWith('.webpubsub.azure.com'));
  assert.deepEqual(names,review.hosts,'Azure async service exceptions differ from review');
  const matches=core.groups[review.policy].filter(r=>r.includes('webpubsub'));
  assert.deepEqual(matches,review.hosts.map(h=>'DOMAIN,'+h),'Azure async core is broader than its exact review');
  return review;
};
