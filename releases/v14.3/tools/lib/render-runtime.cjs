'use strict';
// Strict, pure literal rendering: no evaluation, network access, or historical text anchors.
const assert=require('node:assert/strict');
function render(source,values){return source.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{assert.ok(Object.hasOwn(values,key),'Missing runtime parameter '+key);return values[key];});}
module.exports={render};
