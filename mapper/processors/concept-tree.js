'use strict';
function processConceptTree(result,key,cfg,ctx){
  const tags = ctx.aemDoc['cq:tags'] || [];
  const taxonomyJson = ctx.conceptTree;
  result[key] = getAllHiddenLabels(tags, taxonomyJson, cfg.tagType);
}

function getAllHiddenLabels(tags, taxonomyJson, tagType) {
  if (!tags || !Array.isArray(tags)) return [];
  if (!taxonomyJson || !tagType) return [];

  // taxonomyJson now looks like:
  // {
  //   geography: { ... },
  //   industry: { ... }
  // }
  const rootNode = taxonomyJson[tagType];

  if (!rootNode) return [];

  // Parse tag strings safely
  const parsedTags = tags
    .map((t) => {
      try {
        return typeof t === "string" ? JSON.parse(t) : t;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Dynamic prefix based on tagType
  const prefix = `${tagType}:`;

  // Keep only tags that belong to the requested taxonomy
  const filteredTags = parsedTags.filter((tag) => {
    const value = tag.value || "";
    const cqTagId = tag["cq:tagId"] || "";
    return value.startsWith(prefix) || cqTagId.startsWith(prefix);
  });

  // Prefer value, fallback to cq:tagId
  const keysToMatch = filteredTags.map((tag) => tag.value || tag["cq:tagId"]);

  // Build lookup map from taxonomy tree
  const keyToNodeMap = {};

  function buildMap(node) {
    if (!node || typeof node !== "object") return;

    if (node.value) keyToNodeMap[node.value] = node;
    if (node["cq:tagId"]) keyToNodeMap[node["cq:tagId"]] = node;

    if (Array.isArray(node.children)) {
      node.children.forEach(buildMap);
    }
  }

  buildMap(rootNode);

  // Collect hidden labels
  const allHiddenLabels = [];

  for (const key of keysToMatch) {
    const node = keyToNodeMap[key];
    if (node && Array.isArray(node.hiddenLabels)) {
      allHiddenLabels.push(...node.hiddenLabels);
    }
  }

  // Deduplicate
  return [...new Set(allHiddenLabels)];
}

module.exports = { processConceptTree };