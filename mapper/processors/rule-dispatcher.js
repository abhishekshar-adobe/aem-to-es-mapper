'use strict';

const rules = require('./rule-functions');

function runRule(ruleName, ctx) {
  if (!ruleName) return undefined;

  if (!Object.prototype.hasOwnProperty.call(rules, ruleName)) {
    console.warn(`⚠️ Rule not implemented: ${ruleName}`);
    return undefined;
  }

  const fn = rules[ruleName];

  if (typeof fn !== 'function') {
    console.warn(`⚠️ Rule is not a function: ${ruleName}`);
    return undefined;
  }

  return fn(ctx);
}

module.exports = {
  runRule
};