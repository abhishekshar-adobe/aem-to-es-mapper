'use strict';
function processTagsPath(result, key, cfg, ctx) {
  const tags = ctx.aemDoc['cq:tags'] || [];
  result[key] = buildTagPathsForTaxonomy(tags, cfg.tagType, ctx.conceptTree);
}

/**
 * Build a flat cq:tagId → ey:userFriendlyPath lookup by traversing the
 * concept tree's children array recursively.
 */
function buildPathLookup(conceptTree, taxonomyKey) {
  const lookup = {};
  if (!conceptTree) return lookup;

  const rootNode = conceptTree[taxonomyKey];
  if (!rootNode) return lookup;

  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    const value = node.value;
    const cqTagId = node['cq:tagId'];
    const path = node['ey:userFriendlyPath'];
    // Index by both value and cq:tagId so AEM's old cq:tagId paths are resolved too
    if (value && path) {
      lookup[value] = path;
      // Root nodes have a trailing colon (e.g. "geography:") — also index without it
      if (value.endsWith(':')) lookup[value.slice(0, -1)] = path;
    }
    if (cqTagId && path && cqTagId !== value) {
      lookup[cqTagId] = path;
      if (cqTagId.endsWith(':')) lookup[cqTagId.slice(0, -1)] = path;
    }
    if (Array.isArray(node.children)) node.children.forEach(traverse);
  }

  traverse(rootNode);
  return lookup;
}

function buildTagPathsForTaxonomy(tags, taxonomyKey, conceptTree) {
  const result = [];
  const seen = new Set();

  const parsed = tags
    .map((t) => {
      try {
        return typeof t === 'string' ? JSON.parse(t) : t;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Keep only tags for the requested taxonomy
  const filtered = parsed.filter(tag => {
    const tagId = tag["cq:tagId"] || "";
    return tagId.startsWith(`${taxonomyKey}:`);
  });

  // Build concept-tree path lookup for correct casing of every segment
  const pathLookup = buildPathLookup(conceptTree, taxonomyKey);
  try { require('fs').appendFileSync('/tmp/tagpath-debug.txt', 'lookup key=' + taxonomyKey + ' size=' + Object.keys(pathLookup).length + ' conceptTree=' + (conceptTree ? 'yes' : 'null') + '\n'); } catch(e) {}

  // Root label: use first segment of concept tree friendly path, else slug-format fallback
  const rootFriendlyPath = pathLookup[taxonomyKey];
  const rootLabel = rootFriendlyPath
    ? rootFriendlyPath.split('/')[0]
    : formatRootLabel(taxonomyKey);

  addUnique(result, seen, rootLabel);

  // Build a jcr:title lookup for leaf tags (used as final fallback)
  const titleByTagId = new Map();
  for (const tag of filtered) {
    titleByTagId.set(tag["cq:tagId"], tag["jcr:title"]);
  }

  for (const tag of filtered) {
    const tagId = tag["cq:tagId"];
    const [, rawPath] = tagId.split(":");
    if (!rawPath) continue;

    const parts = rawPath.split("/");
    let currentPath = rootLabel;

    for (let i = 0; i < parts.length; i++) {
      const partialTagId = `${taxonomyKey}:${parts.slice(0, i + 1).join("/")}`;
      // Prefer concept tree friendly path (last segment) → jcr:title → slug fallback
      const friendlyPath = pathLookup[partialTagId];
      const label = friendlyPath
        ? friendlyPath.split('/').pop()
        : (titleByTagId.get(partialTagId) || formatLabel(parts[i]));

      currentPath = `${currentPath}\\${label}`;
      addUnique(result, seen, currentPath);
    }
  }

  return result;
}

function addUnique(result, seen, value) {
  if (!seen.has(value)) {
    seen.add(value);
    result.push(value);
  }
}

function formatRootLabel(key) {
  return key
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLabel(value) {
  return value
    .replace(/--/g, " & ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { processTagsPath };


function addUnique(result, seen, value) {
  if (!seen.has(value)) {
    seen.add(value);
    result.push(value);
  }
}

function formatRootLabel(key) {
  return key
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLabel(value) {
  return value
    .replace(/--/g, " & ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { processTagsPath };