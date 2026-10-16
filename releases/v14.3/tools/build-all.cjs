'use strict';
// Explicit build phases. All runtime files remain standalone; no runtime dependencies.
const cp=require('node:child_process'),path=require('node:path');
const phases=['build-balanced.cjs','build-shadowrocket-lean.cjs','build-macos.cjs','build-clash-verge.cjs','build-network-compat.cjs'];
for(const phase of phases)cp.execFileSync(process.execPath,[path.join(__dirname,phase),...(process.argv.includes('--check')?['--check']:[])],{stdio:'inherit',windowsHide:true});
