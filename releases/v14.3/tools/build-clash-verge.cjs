'use strict';
// Compatibility command; all client artifacts are compiled by one ordered pipeline.
const path=require('node:path');
const result=require('./lib/build-entries.cjs').build(path.resolve(__dirname,'..'),process.argv.includes('--check'));
console.log(JSON.stringify(result));
