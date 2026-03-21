'use strict';

const { runRule } = require('./rule-dispatcher');
const { getByPath } = require('./utils');

function processRule(result, key, cfg, ctx) {
  const ruleName = cfg?.rule?.ruleName;

  if (!ruleName) {
    result[key] = undefined;
    return;
  }

  const ruleCtx = {
    ...ctx,
    sourceValue: getByPath(ctx.aemDoc, cfg.source),
    get: (p) => getByPath(ctx.aemDoc, p)
  };

  const { value, warning } = runRule(ruleName, ruleCtx);
  result[key] = value;

  if (warning && ctx.meta) {
    ctx.meta.warnings.push({
      key,
      ruleName,
      message: warning,
      type: warning.startsWith('Rule not implemented') ? 'unimplemented' : 'rule-error'
    });
  }
}

module.exports = { processRule };
