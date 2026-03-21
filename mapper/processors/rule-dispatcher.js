'use strict';

const rules = require('./rule-functions');

/**
 * Execute a named rule and return a structured result.
 * Returns { value, warning } — warning is null on success, a string on failure.
 * Never throws; callers decide how to handle warnings.
 */
function runRule(ruleName, ctx) {
  if (!ruleName) return { value: undefined, warning: null };

  if (!Object.prototype.hasOwnProperty.call(rules, ruleName)) {
    return { value: undefined, warning: `Rule not implemented: ${ruleName}` };
  }

  const fn = rules[ruleName];
  if (typeof fn !== 'function') {
    return { value: undefined, warning: `Rule '${ruleName}' is not a function` };
  }

  return { value: fn(ctx), warning: null };
}

module.exports = { runRule };
