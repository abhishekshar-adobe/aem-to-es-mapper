'use strict';
function processTagsPath(result,key,cfg,ctx){
  const tags = ctx.aemDoc['cq:tags'] || [];
  result[key] = buildTagPathsForTaxonomy(tags, cfg.tagType);
}

function buildTagPathsForTaxonomy(tags, taxonomyKey) {
  const result = [];
  const seen = new Set();

  const parsed = tags.map(t => JSON.parse(t));

  // Keep only tags for the requested taxonomy
  const filtered = parsed.filter(tag => {
    const tagId = tag["cq:tagId"] || "";
    return tagId.startsWith(`${taxonomyKey}:`);
  });

  // Root label from taxonomy key
  const rootLabel = formatRootLabel(taxonomyKey);

  // Add root once
  addUnique(result, seen, rootLabel);

  // Build a lookup for exact tagId -> title
  const titleByTagId = new Map();
  for (const tag of filtered) {
    titleByTagId.set(tag["cq:tagId"], tag["jcr:title"]);
  }

  for (const tag of filtered) {
    const tagId = tag["cq:tagId"]; // ey-partner-ecosystem:s360-alliance-partners/sap/sap-s4-hana
    const [, rawPath] = tagId.split(":");
    if (!rawPath) continue;

    const parts = rawPath.split("/");

    let currentPath = rootLabel;

    for (let i = 0; i < parts.length; i++) {
      const partialTagId = `${taxonomyKey}:${parts.slice(0, i + 1).join("/")}`;
      const label = titleByTagId.get(partialTagId) || formatLabel(parts[i]);

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