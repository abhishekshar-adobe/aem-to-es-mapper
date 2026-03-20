'use strict';
function processTag(result,key,cfg,ctx){
  const tags = ctx.aemDoc['cq:tags'] || [];
  const values = tags
    .filter(t => t.includes(cfg.tagType))
    .map(t => JSON.parse(t)['jcr:title']);
  result[key] = values;
}
module.exports = { processTag };
