'use strict';

const { processField } = require('./processors/field');
const { processTag } = require('./processors/tag');
const { processTagsPath } = require('./processors/tag-path');
const { processConceptTree } = require('./processors/concept-tree');
const { processRule } = require('./processors/rule');
const { applyPostProcessing } = require('./processors/post-process');

/**
 * Transform an AEM document into an Elasticsearch document.
 *
 * @param {object} options
 * @param {object} options.aemDoc          - Flattened AEM document (hit merged with jcr:content)
 * @param {object} options.conceptTree      - Taxonomy tree (Data property from conceptTree.json)
 * @param {object} options.mapping          - Rules configuration from rules.json
 * @param {object} [options.postProcessing] - Optional post-processing flags
 * @param {boolean} [options.postProcessing.trimWhitespace] - Trim extra whitespace from all string values
 * @param {boolean} [options.postProcessing.stripHtml]      - Strip HTML tags from all string values
 * @returns {{ document: object, meta: object }}
 */
function buildEsDocument({ aemDoc, conceptTree, mapping, postProcessing }) {
  const document = {};
  const meta = {
    warnings: [],
    errors: [],
    fieldStatuses: {}
  };
  const ctx = { aemDoc, conceptTree, meta };

  for (const [key, cfg] of Object.entries(mapping)) {
    try {
      switch (cfg.type) {
        case 'field':        processField(document, key, cfg, ctx); break;
        case 'tag':          processTag(document, key, cfg, ctx); break;
        case 'rule':         processRule(document, key, cfg, ctx); break;
        case 'tag_path':     processTagsPath(document, key, cfg, ctx); break;
        case 'concept_tree': processConceptTree(document, key, cfg, ctx); break;
        default:
          meta.warnings.push({ key, message: `Unknown mapping type: '${cfg.type}'`, type: 'unknown-type' });
      }

      // Determine field status based on produced value
      const hasUnimplementedWarning = meta.warnings.some(
        (w) => w.key === key && w.type === 'unimplemented'
      );
      const value = document[key];

      if (hasUnimplementedWarning) {
        meta.fieldStatuses[key] = 'unimplemented';
      } else if (value === undefined) {
        meta.fieldStatuses[key] = 'undefined';
      } else if ((Array.isArray(value) && value.length === 0) || value === null || value === '') {
        meta.fieldStatuses[key] = 'empty';
      } else {
        meta.fieldStatuses[key] = 'ok';
      }
    } catch (err) {
      meta.errors.push({ key, message: err.message });
      meta.fieldStatuses[key] = 'error';
      document[key] = undefined;
    }
  }

  applyPostProcessing(document, postProcessing);

  return { document, meta };
}

module.exports = { buildEsDocument };
