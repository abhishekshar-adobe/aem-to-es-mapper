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

  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

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
  return parseAemDate(ctx?.sourceValue);
}

function ParseDateGmtOrNative(ctx) {
  return parseAemDate(ctx?.sourceValue);
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
    "EY Topic Page"
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
    "EY Policy Guidance Page"
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
    "EY Video": "Video"
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

/* -------------------- flat-key extractors -------------------- */

function findFlatKeysEndingWith(doc, suffix) {
  return Object.keys(doc || {}).filter((k) => k.endsWith(suffix));
}

function getItemIndex(key) {
  const m = String(key).match(/\/item(\d+)(?:\/|$)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function sortKeysByItemIndex(keys) {
  return [...keys].sort((a, b) => {
    const ia = getItemIndex(a);
    const ib = getItemIndex(b);
    if (ia !== ib) return ia - ib;
    return String(a).localeCompare(String(b));
  });
}

function getParentPrefix(key, suffix) {
  const idx = String(key).lastIndexOf(suffix);
  return idx === -1 ? null : String(key).slice(0, idx);
}

function dedupeValues(values) {
  return [...new Set((values || []).filter(isNonEmpty))];
}

function firstNonEmpty(values) {
  for (const v of values) {
    if (isNonEmpty(v)) return v;
  }
  return undefined;
}

function collectValuesFromTitleSection(doc, {
  titleSuffix,
  titleValue,
  valueSuffix,
  dedupe = true
}) {
  const results = [];
  const titleKeys = sortKeysByItemIndex(findFlatKeysEndingWith(doc, titleSuffix));
  const sectionPrefix = titleSuffix.replace(/\/title$/, "");

  for (const titleKey of titleKeys) {
    if (doc[titleKey] !== titleValue) continue;

    const prefix = getParentPrefix(titleKey, titleSuffix);
    if (!prefix) continue;

    const valuePrefix = `${prefix}${sectionPrefix}/emailids/`;
    const valueKeys = sortKeysByItemIndex(
      Object.keys(doc).filter(
        (k) => k.startsWith(valuePrefix) && k.endsWith(valueSuffix)
      )
    );

    for (const k of valueKeys) {
      if (isNonEmpty(doc[k])) results.push(doc[k]);
    }
  }

  return results.length ? (dedupe ? dedupeValues(results) : results) : undefined;
}

function collectValuesFromResourceTypeSection(doc, {
  resourceTypeValue,
  valueSuffix,
  dedupe = true
}) {
  const results = [];
  const resourceKeys = sortKeysByItemIndex(findFlatKeysEndingWith(doc, "/sling:resourceType"));

  for (const resourceKey of resourceKeys) {
    if (doc[resourceKey] !== resourceTypeValue) continue;

    const prefix = getParentPrefix(resourceKey, "/sling:resourceType");
    if (!prefix) continue;

    const valuePrefix = `${prefix}/emailids/`;
    const valueKeys = sortKeysByItemIndex(
      Object.keys(doc).filter(
        (k) => k.startsWith(valuePrefix) && k.endsWith(valueSuffix)
      )
    );

    for (const k of valueKeys) {
      if (isNonEmpty(doc[k])) results.push(doc[k]);
    }
  }

  return results.length ? (dedupe ? dedupeValues(results) : results) : undefined;
}

/* -------------------- new rule functions -------------------- */

function ExtractContacts(ctx) {
  return collectValuesFromTitleSection(ctx?.aemDoc, {
    titleSuffix: "/contacts/title",
    titleValue: "Contact",
    valueSuffix: "/fullName",
    dedupe: true
  });
}

function ExtractContactEmails(ctx) {
  return collectValuesFromTitleSection(ctx?.aemDoc, {
    titleSuffix: "/contacts/title",
    titleValue: "Contact",
    valueSuffix: "/multiEmail",
    dedupe: true
  });
}

function ExtractSolutionLeaders(ctx) {
  return collectValuesFromResourceTypeSection(ctx?.aemDoc, {
    resourceTypeValue: "ey-internal-adobe-experience-app/components/contacts",
    valueSuffix: "/fullName",
    dedupe: true
  });
}

function ExtractSolutionLeaderEmails(ctx) {
  return collectValuesFromResourceTypeSection(ctx?.aemDoc, {
    resourceTypeValue: "ey-internal-adobe-experience-app/components/contacts",
    valueSuffix: "/multiEmail",
    dedupe: false
  });
}

function ExtractAuthors(ctx) {
  return collectValuesFromTitleSection(ctx?.aemDoc, {
    titleSuffix: "/authors/title",
    titleValue: "Authors",
    valueSuffix: "/fullName",
    dedupe: true
  });
}

function ExtractAuthorsEmail(ctx) {
  return collectValuesFromTitleSection(ctx?.aemDoc, {
    titleSuffix: "/authors/title",
    titleValue: "Authors",
    valueSuffix: "/multiEmail",
    dedupe: true
  });
}

function ExtractAbstract(ctx) {
  const doc = ctx?.aemDoc || {};
  const titleKeys = sortKeysByItemIndex(findFlatKeysEndingWith(doc, "/contentabstract/title"));

  for (const titleKey of titleKeys) {
    if (doc[titleKey] !== "Description") continue;

    const prefix = getParentPrefix(titleKey, "/contentabstract/title");
    if (!prefix) continue;

    const candidates = [
      `${prefix}/contentabstract/description`,
      `${prefix}/contentabstract/text`,
      `${prefix}/contentabstract/rte`
    ];

    const value = firstNonEmpty(candidates.map((k) => doc[k]));
    if (isNonEmpty(value)) return value;
  }

  return undefined;
}

/* -------------------- export -------------------- */

module.exports = {
  ParseDate,
  ParseDateGmtOrNative,
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
  ExtractAbstract
};