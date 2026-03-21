'use strict';

/**
 * Deep equality check that handles primitives, arrays, and plain objects.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Generate a per-document diff report from mapper output and meta.
 * The `fields` section contains ONLY non-ok fields (missing, empty, unimplemented, error).
 * When `expected` is provided, ok fields are also compared against expected values and
 * flagged as `mismatch` if they differ. All non-ok entries include `currentValue` and,
 * when `expected` is provided, `expectedValue`.
 *
 * @param {object} options
 * @param {string} options.docId       - Document identifier
 * @param {string} options.source      - Source filename for traceability
 * @param {object} options.document    - ES document produced by buildEsDocument
 * @param {object} options.meta        - Meta object from buildEsDocument: { warnings, errors, fieldStatuses }
 * @param {object} options.mapping     - rules.json config (for reason inference)
 * @param {object} [options.expected]  - Expected ES document from result.json for comparison (optional)
 * @returns {object} Structured diff report
 */
function generateReport({ docId, source, document, meta, mapping, expected = null }) {
  const fieldStatuses = meta.fieldStatuses || {};
  const warnings = meta.warnings || [];
  const errors = meta.errors || [];

  // Only non-ok fields appear in the output — keeps reports focused on what needs attention
  const missingFields = {};
  let populated = 0;
  let mismatch = 0;
  let empty = 0;
  let undefinedCount = 0;
  let unimplemented = 0;
  const errorCount = errors.length;

  for (const [key, status] of Object.entries(fieldStatuses)) {
    const cfg = mapping[key] || {};

    if (status === 'ok') {
      // Only compare against expected when the key is explicitly present in expected.
      // If the key is absent from expected, the reference doc simply doesn't cover it —
      // treat the field as ok rather than a false mismatch.
      if (expected !== null && (key in expected) && !deepEqual(document[key], expected[key])) {
        mismatch++;
        missingFields[key] = {
          status: 'mismatch',
          currentValue: document[key],
          expectedValue: expected[key]
        };
      } else {
        populated++;
      }
      continue;
    }

    const entry = { status };

    // When result.json is the source of truth, skip fields not present in it entirely
    if (expected !== null && !(key in expected)) {
      continue;
    }

    switch (status) {
      case 'empty':
        empty++;
        entry.currentValue = document[key];
        if (cfg.tagType) {
          entry.reason = `No '${cfg.tagType}' tags found in cq:tags`;
        }
        break;

      case 'undefined':
        undefinedCount++;
        if (cfg.source) {
          entry.reason = `Source field '${cfg.source}' absent or null in AEM doc`;
        } else if (cfg.type === 'rule') {
          entry.reason = `Rule '${cfg.rule?.ruleName}' returned undefined`;
        } else if (cfg.type === 'tag') {
          entry.reason = `No '${cfg.tagType}' tags matched`;
        }
        break;

      case 'unimplemented': {
        unimplemented++;
        const warn = warnings.find((w) => w.key === key && w.type === 'unimplemented');
        entry.reason = warn?.message || `Rule '${cfg.rule?.ruleName}' not implemented`;
        break;
      }

      case 'error': {
        const err = errors.find((e) => e.key === key);
        entry.reason = err?.message || 'Runtime error';
        break;
      }
    }

    // Add currentValue for fields that don't already have it (empty case sets it above)
    if (!('currentValue' in entry)) {
      entry.currentValue = document[key];
    }
    // Add expectedValue only when the key is explicitly present in expected
    if (expected !== null && (key in expected)) {
      entry.expectedValue = expected[key];
    }

    // Attach any non-unimplemented field-level warnings
    const fieldWarnings = warnings.filter(
      (w) => w.key === key && w.type !== 'unimplemented'
    );
    if (fieldWarnings.length > 0) {
      entry.warnings = fieldWarnings.map((w) => w.message);
    }

    missingFields[key] = entry;
  }

  const totalFields = Object.keys(fieldStatuses).length;
  const hasMissing = Object.keys(missingFields).length > 0;

  return {
    docId,
    processedAt: new Date().toISOString(),
    source,
    summary: {
      totalFields,
      populated,
      mismatch,
      empty,
      undefined: undefinedCount,
      unimplemented,
      warnings: warnings.length,
      errors: errorCount
    },
    // Only present when there are non-ok fields
    ...(hasMissing ? { missingOrMismatch: missingFields } : {}),
    ...(errors.length > 0 ? { errors } : {})
  };
}

module.exports = { generateReport };

