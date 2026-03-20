'use strict';
function processField(result,key,cfg,ctx){
  result[key] = ctx.aemDoc[cfg.source];
}
module.exports = { processField };
