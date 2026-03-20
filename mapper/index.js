'use strict';
const { processField } = require('./processors/field');
const { processTag } = require('./processors/tag');
const { processTagsPath } = require('./processors/tag-path');
const { processConceptTree } = require('./processors/concept-tree');
const { processRule } = require('./processors/rule');

function buildEsDocument({ aemDoc, conceptTree, mapping }) {
  // console.log("Building ES document...",mapping);
  const result = {};
  const ctx = { aemDoc, conceptTree };

  for (const [key, cfg] of Object.entries(mapping)) {
    switch(cfg.type){
      case 'field': processField(result,key,cfg,ctx); break;
      case 'tag': processTag(result,key,cfg,ctx); break;
      case 'rule': processRule(result,key,cfg,ctx); break;
      case 'tag_path': processTagsPath(result,key,cfg,ctx); break;
      case 'concept_tree': processConceptTree(result,key,cfg,ctx); break;
    }
  }
  return result;
}

module.exports = { buildEsDocument };
