'use strict';

function getByPath(obj, path) {
  if (!obj || !path) return undefined;

  return path.split('.').reduce((o, key) => {
    if (!o) return undefined;
    return o[key];
  }, obj);
}

function isNonEmpty(v) {
  return v !== undefined && v !== null && v !== '';
}

function parseDate(value) {
  if (!value) return undefined;

  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();

  return undefined;
}

module.exports = {
  getByPath,
  isNonEmpty,
  parseDate
};