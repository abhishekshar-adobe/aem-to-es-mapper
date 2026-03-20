"use strict";

/* -------------------- helpers -------------------- */

function isNonEmpty(value) {
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim() === "")
  );
}

function splitAndTrim(value, delimiter) {
  if (!isNonEmpty(value)) return undefined;
  return String(value)
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(v)) return true;
    if (["false", "0", "no", "n", ""].includes(v)) return false;
  }
  return Boolean(value);
}

function parseAemDate(value) {
  if (!isNonEmpty(value)) return undefined;

  const str = String(value).trim();

  // Try native parse first
  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  // Try to normalize common GMT formats
  // Example: Wed Mar 10 2021 12:00:00 GMT+0000
  const cleaned = str
    .replace(/'GMT'/g, "GMT")
    .replace(/\s+\(.*\)$/, "")
    .trim();

  const secondTry = new Date(cleaned);
  if (!Number.isNaN(secondTry.getTime())) {
    return secondTry.toISOString();
  }

  return undefined;
}

function getPath(ctx, path) {
  if (!ctx || typeof ctx.get !== "function") return undefined;
  return ctx.get(path);
}

function buildAemUrlFromPath(ctx) {
  const p = getPath(ctx, "jcr:path");
  if (!isNonEmpty(p)) return undefined;
  return `https://discovercontent.ey.net${p}.html`;
}

/* -------------------- core rules -------------------- */

function ParseDate(ctx) {
  return parseFlexibleDate(ctx?.sourceValue);
}

function SplitKeywords(ctx) {
  return splitAndTrim(getPath(ctx, "ey:keywords"), ",");
}

function SplitEndorsements(ctx) {
  return splitAndTrim(getPath(ctx, "ey:endorsement"), ";");
}

function ResolveLegacyOrId(ctx) {
  const legacy = getPath(ctx, "ey:legacy-id");
  const id = getPath(ctx, "ey:id");
  return isNonEmpty(legacy) ? legacy : id;
}

function BooleanField(ctx) {
  return toBoolean(ctx?.sourceValue);
}

function IsEndorsed(ctx) {
  return isNonEmpty(getPath(ctx, "ey:endorsement"));
}

function MapVertical(ctx) {
  const contentType = String(getPath(ctx, "ey:content-type") || "").trim();

  const documentTypes = new Set([
    "EY Knowledge Document",
    "EY Knowledge Page",
    "EY Knowledge FoP Page",
    "EY Knowledge Buyer Page",
    "EY Knowledge Solution Page",
    "EY Resource Catalogue item",
    "EY Policy Page",
    "Policy Document",
    "EY Policy Guidance Page",
    "EY Method Document",
    "EY Data Visualization",
    "EY Topic Page",
  ]);

  if (documentTypes.has(contentType)) return "Documents";
  if (contentType === "EY Video") return "Videos";
  if (contentType === "EY Credential List Item") return "Credentials";
  return "";
}

function ContentRestriction(ctx) {
  const contentType = String(getPath(ctx, "ey:content-type") || "").trim();

  if (contentType === "0" || contentType === "") return "NoRestrict";
  if (contentType === "1") return "AIOnly";
  if (contentType === "2") return "AISearchOnly";
  return "NoRestrict";
}

function ContentAge(ctx) {
  const contentType = String(getPath(ctx, "ey:content-type") || "").trim();

  const evergreen = new Set([
    "EY Knowledge Solution Page",
    "EY Knowledge FoP Page",
    "EY Resource Catalogue item",
    "Policy Document",
    "EY Policy Page",
    "EY Policy Guidance Page",
  ]);

  if (evergreen.has(contentType)) {
    return "2099-12-31T00:00:00.000Z";
  }

  return (
    parseAemDate(getPath(ctx, "ey:last-updated")) ||
    parseAemDate(getPath(ctx, "jcr:created")) ||
    undefined
  );
}

function MapResultType(ctx) {
  const contentType = String(getPath(ctx, "ey:content-type") || "").trim();
  const assetType = String(getPath(ctx, "eykdassettype") || "").trim();

  if (contentType === "EY Resource Catalogue item") {
    const targetUrl = getPath(ctx, "ey:target-url") || "";
    if (!targetUrl) return "Site";

    try {
      const u = new URL(targetUrl);
      const host = u.host || "";
      if (host.includes("sites.ey.com") || host.includes("sharepoint.com")) {
        return "Site | Sharepoint";
      }
      return "Site";
    } catch {
      const clean = String(targetUrl)
        .replace(/^https?:\/\//i, "")
        .split("/")[0];

      if (clean.includes("sites.ey.com") || clean.includes("sharepoint.com")) {
        return "Site | Sharepoint";
      }
      return "Site";
    }
  }

  const map = {
    "EY Knowledge Document": "Document",
    "EY Credential list item": "Credential",
    "EY Data Visualization": "Document | Data Vis",
    "EY Method Document": "Document | Method",
    "Policy Document": "Document | Policy",
    "EY-P Engagement item": "EY-P | Engagement",
    "EY-P Perspective Document": "EY-P | Perspective",
    "Intranet News Article": "News | Article",
    "Intranet News Video": "News | Video",
    "EY Knowledge Page": "Page",
    "EY Knowledge FoP Page": "Page | BBFoP",
    "EY Knowledge Buyer Page": "Page | Buyer",
    "Intranet Content Page": "Page | Intranet",
    "EY Policy Page": "Page | Policy",
    "EY Knowledge Solution Page": "Page | Solution",
    "EY Topic Page": "Page | Topic",
    "EY Video": "Video",
  };

  if (map[contentType]) return map[contentType];

  if (assetType === "Data Product") return "Data | Product";
  if (assetType === "Data Provider") return "Data | Provider";
  if (assetType === "Data Set") return "Data | Set";

  return "";
}

function BuildAEMUrl(ctx) {
  return buildAemUrlFromPath(ctx);
}


/* -------------------- extra helpers for nested sections -------------------- */

function firstNonEmpty(values) {
  for (const v of values) {
    if (isNonEmpty(v)) return v;
  }
  return undefined;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return false;

  if (visitor(node)) return true;

  if (Array.isArray(node)) {
    for (const item of node) {
      if (walk(item, visitor)) return true;
    }
    return false;
  }

  for (const key of Object.keys(node)) {
    if (walk(node[key], visitor)) return true;
  }

  return false;
}

function dedupeValues(values) {
  return [...new Set((values || []).filter(isNonEmpty))];
}

function collectEmailIdValues(sectionNode, fieldName) {
  const values = [];

  walk(sectionNode, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

    const emailIds = node.emailids || node.emailIds || node.emailIdsList;
    if (Array.isArray(emailIds)) {
      for (const item of emailIds) {
        if (item && isNonEmpty(item[fieldName])) {
          values.push(item[fieldName]);
        }
      }
    }

    return false;
  });

  return dedupeValues(values);
}

function findFirstNodeByPredicate(doc, predicate) {
  let found;

  walk(doc, (node) => {
    if (predicate(node)) {
      found = node;
      return true;
    }
    return false;
  });

  return found;
}

function parseFlexibleDate(value) {
  if (!isNonEmpty(value)) return undefined;

  const str = String(value).trim();

  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const cleaned = str
    .replace(/'GMT'/g, 'GMT')
    .replace(/\s+\(.*\)$/, '')
    .trim();

  const secondTry = new Date(cleaned);
  if (!Number.isNaN(secondTry.getTime())) {
    return secondTry.toISOString();
  }

  return undefined;
}

/* -------------------- new rule functions -------------------- */

function ExtractContacts(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node.title || '').trim() === 'Contact' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'fullName');
}

function ExtractContactEmails(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node.title || '').trim() === 'Contact' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'multiEmail');
}

function ExtractSolutionLeaders(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node['sling:resourceType'] || '').trim() ===
        'ey-internal-adobe-experience-app/components/contacts' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'fullName');
}

function ExtractSolutionLeaderEmails(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node['sling:resourceType'] || '').trim() ===
        'ey-internal-adobe-experience-app/components/contacts' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'multiEmail');
}

function ExtractAuthors(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node.title || '').trim() === 'Authors' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'fullName');
}

function ExtractAuthorsEmail(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    return (
      node &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      String(node.title || '').trim() === 'Authors' &&
      node.emailids
    );
  });

  if (!section) return undefined;
  return collectEmailIdValues(section, 'multiEmail');
}

function ExtractAbstract(ctx) {
  const section = findFirstNodeByPredicate(ctx?.aemDoc, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;

    const ca = node.contentabstract;
    if (!ca) return false;

    if (Array.isArray(ca)) {
      return ca.some((item) => String(item?.title || '').trim() === 'Description');
    }

    return String(ca.title || '').trim() === 'Description';
  });

  if (!section || !section.contentabstract) return undefined;

  const ca = section.contentabstract;

  if (Array.isArray(ca)) {
    for (const item of ca) {
      const val = firstNonEmpty([item?.description, item?.text, item?.rte]);
      if (isNonEmpty(val)) return val;
    }
    return undefined;
  }

  return firstNonEmpty([ca.description, ca.text, ca.rte]);
}

/* -------------------- export -------------------- */

module.exports = {
  ParseDate,
  SplitKeywords,
  SplitEndorsements,
  ResolveLegacyOrId,
  BooleanField,
  IsEndorsed,
  MapVertical,
  ContentRestriction,
  ContentAge,
  MapResultType,
  BuildAEMUrl,

  ExtractContacts,
  ExtractContactEmails,
  ExtractSolutionLeaders,
  ExtractSolutionLeaderEmails,
  ExtractAuthors,
  ExtractAuthorsEmail,
  ExtractAbstract,
};