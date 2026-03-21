'use strict';

/**
 * Post-processing filters applied to the final ES document after all field
 * mappings are resolved. Each filter is independently toggled via the
 * `postProcessing` section of rules.json.
 *
 * Available flags:
 *   trimWhitespace  — collapse multiple spaces and strip leading/trailing
 *                     whitespace from every string value (and string items
 *                     inside arrays). Does NOT alter non-string values.
 *
 *   stripHtml       — remove all HTML tags (e.g. <br/>, <p>, <strong>) from
 *                     string values. Runs after trimWhitespace when both are
 *                     enabled so the result is clean text.
 */

const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Apply a transform function to every string leaf in a value.
 * - Strings → transformed directly.
 * - Arrays  → each string element transformed (non-strings untouched).
 * - Other   → returned as-is.
 */
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? fn(item) : item));
  }
  return value;
}

function trimWhitespace(value) {
  return mapStrings(value, (s) => s.replace(/\s+/g, ' ').trim());
}

function stripHtml(value) {
  return mapStrings(value, (s) => s.replace(HTML_TAG_RE, '').replace(/\s+/g, ' ').trim());
}

/**
 * Apply enabled post-processing filters to every field in the document.
 *
 * @param {object} document - ES document produced by buildEsDocument
 * @param {object} options  - postProcessing flags (from rules.json)
 * @param {boolean} [options.trimWhitespace=false]
 * @param {boolean} [options.stripHtml=false]
 * @returns {object} The same document object, mutated in-place
 */
function applyPostProcessing(document, options) {
  if (!options || typeof options !== 'object') return document;

  const doTrim  = options.trimWhitespace === true;
  const doStrip = options.stripHtml      === true;

  if (!doTrim && !doStrip) return document;

  for (const key of Object.keys(document)) {
    let value = document[key];

    // trimWhitespace runs first so stripHtml works on already-trimmed text
    if (doTrim)  value = trimWhitespace(value);
    if (doStrip) value = stripHtml(value);

    document[key] = value;
  }

  return document;
}

module.exports = { applyPostProcessing };
