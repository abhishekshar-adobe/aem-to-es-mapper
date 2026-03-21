'use strict';
function processField(result,key,cfg,ctx){
  let value = ctx.aemDoc[cfg.source];
  if (cfg.array === true && value !== undefined && value !== null && !Array.isArray(value)) {
    value = [value];
  }
  result[key] = value;
}
module.exports = { processField };
