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

  result[key] = runRule(ruleName, ruleCtx);
}

module.exports = { processRule };
