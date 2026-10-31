'use strict';
// Run unchanged legacy assertions in bounded shards. Only dispatch and receipt
// destination are adapted in memory; the checked assertions and source stay intact.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '..'), file = path.join(root, 'releases/v14.3/tests/static.cjs');
const part = process.argv[2];
if (!['global','desktop','android','clashmi','merge'].includes(part)) throw Error('Expected global|desktop|android|clashmi|merge');
const dir = path.join(root, 'releases/v14.3/validation/architecture-audit');
fs.mkdirSync(dir, {recursive:true});
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
if (part === 'merge') {
  const rows = ['global','desktop','android','clashmi'].map(p => JSON.parse(fs.readFileSync(path.join(dir,'static-'+p+'.json'),'utf8')));
  const expected = rows[0].consideredChecks.slice().sort(), seen = new Set(), checks = [], failures = [];
  const source = sha(fs.readFileSync(file));
  const bindings = JSON.stringify(rows[0].sourceFiles);
  for (const row of rows) {
    if (row.originalTestSHA256 !== source || JSON.stringify(row.consideredChecks.slice().sort()) !== JSON.stringify(expected) || JSON.stringify(row.sourceFiles) !== bindings)
      throw Error('Shard evidence refers to different test/source bytes or inventory');
    for (const name of [...row.checks, ...row.failures.map(x=>x.name)]) {
      if (seen.has(name)) throw Error('Duplicated check: '+name);
      seen.add(name);
    }
    checks.push(...row.checks); failures.push(...row.failures);
  }
  if (JSON.stringify([...seen].sort()) !== JSON.stringify(expected)) throw Error('Static checks omitted');
  for (const entry of rows[0].sourceFiles) {
    if (sha(fs.readFileSync(path.join(root,'releases/v14.3',entry.file))) !== entry.sha256) throw Error('Stale source '+entry.file);
  }
  const report = {revision:'architecture-audit-r1',scope:'COMPLETE_LEGACY_STATIC_ASSERTIONS_IN_FOUR_BOUNDED_SHARDS_NOT_NATIVE_OR_DEVICE',
    executedAt:new Date().toISOString(),status:failures.length?'FAIL':'PASS',passed:checks.length,failed:failures.length,
    checks,failures,sourceFiles:rows[0].sourceFiles,originalTestSHA256:source,harnessSHA256:sha(fs.readFileSync(__filename)),
    shardSHA256:Object.fromEntries(['global','desktop','android','clashmi'].map(p=>[p,sha(fs.readFileSync(path.join(dir,'static-'+p+'.json')))]))};
  fs.writeFileSync(path.join(dir,'static-complete.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed}));
  if (failures.length) process.exitCode=1;
} else {
  const original = fs.readFileSync(file,'utf8');
  const anchor = 'const check=(name,fn)=>{try{';
  const output = "fs.writeFileSync(f.local('validation/static.json'),";
  if (original.split(anchor).length !== 2 || original.split(output).length !== 2) throw Error('Static runner source changed; re-review adapter');
  const code = original.replace(anchor,
    `report.shard=${JSON.stringify(part)};report.consideredChecks=[];report.skippedChecks=[];report.originalTestSHA256=${JSON.stringify(sha(original))};\n`+
    `const check=(name,fn)=>{report.consideredChecks.push(name);const owner=['desktop','android','clashmi'].find(p=>name.startsWith(p+':'))||'global';if(owner!==${JSON.stringify(part)}){report.skippedChecks.push(name);return;}try{`)
    .replace(output, `fs.writeFileSync(${JSON.stringify(path.join(dir,'static-'+part+'.json'))},`);
  const compiled = new Module(file, module);
  compiled.filename = file; compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(code, file);
}
