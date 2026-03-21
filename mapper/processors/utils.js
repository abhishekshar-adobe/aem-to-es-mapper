'use strict';

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((o, key) => (o != null ? o[key] : undefined), obj);
}

function isNonEmpty(v) {
  return v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
}

/**
 * Parse an AEM date string to ISO format.
 * Handles standard JS dates, AEM's 'GMT' literal format, and timezone suffixes.
 */
function toIsoCompact(date) {
  // Strip trailing .000Z → Z to match the expected compact ISO-8601 format
  return date.toISOString().replace(/\.000Z$/, 'Z');
}

function parseAemDate(value) {
  if (!isNonEmpty(value)) return undefined;
  const str = String(value).trim();

  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) return toIsoCompact(direct);

  // AEM sometimes emits literal 'GMT' instead of a valid timezone
  const cleaned = str.replace(/'GMT'/g, 'GMT').replace(/\s+\(.*\)$/, '').trim();
  const secondTry = new Date(cleaned);
  if (!Number.isNaN(secondTry.getTime())) return toIsoCompact(secondTry);

  return undefined;
}

module.exports = { getByPath, isNonEmpty, parseAemDate };