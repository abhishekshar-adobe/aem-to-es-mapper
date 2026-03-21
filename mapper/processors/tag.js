'use strict';

function normalizeTags(raw) {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [raw];

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      }
      return item;
    })
    .filter(Boolean);
}

function getSourceField(source) {
  if (!source || typeof source !== 'string') return null;
  return source.split('.').pop(); // cq:tags.jcr:title -> jcr:title
}

function getTagValue(tag, field) {
  if (!tag || !field) return undefined;

  if (field === 'jcr:title') return tag['jcr:title'] ?? tag.title;
  if (field === 'cq:tagId') return tag['cq:tagId'] ?? tag.tagId;
  if (field === 'value') return tag['value'] ?? tag['cq:tagId'] ?? tag.tagId;
  if (field === 'altLabels') return tag.altLabels;
  if (field === 'hiddenLabels') return tag.hiddenLabels;

  return tag[field];
}

function isMatch(tag, tagType) {
  if (!tag || !tagType) return false;

  const tagId = String(tag['cq:tagId'] || tag.tagId || '').toLowerCase();
  const type = String(tagType).toLowerCase();

  return tagId.startsWith(type + ':') || tagId === type;
}

function processTag(result, key, cfg, ctx) {
  const rawTags =
    ctx?.aemDoc?.['cq:tags'] ||
    ctx?.aemDoc?.['cq:tag'] ||
    [];

  const tags = normalizeTags(rawTags);
  const sourceField = getSourceField(cfg?.source);

  if (!sourceField) {
    result[key] = undefined;
    return;
  }

  const values = [];

  for (const tag of tags) {
    if (!isMatch(tag, cfg.tagType)) continue;

    const value = getTagValue(tag, sourceField);

    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          values.push(v);
        }
      }
    } else if (value !== undefined && value !== null && String(value).trim() !== '') {
      values.push(value);
    }
  }

  result[key] = [...new Set(values)];
}

module.exports = { processTag };