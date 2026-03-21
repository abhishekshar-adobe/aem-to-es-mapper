#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { buildEsDocument } = require('./mapper');
const { generateReport }  = require('./reporter/diff-reporter');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  console.error(`
Usage:

  Single / explicit batch:
    node main.js <aem.json> <conceptTree.json> <rules.json> <outputPath>

  Folder batch (scans all subdirectories inside <inputDir>):
    node main.js --input <inputDir> <rules.json>

  Input folder structure:
    input/
      batch1/
        aem.json          ← file whose JSON has a "hits" array
        conceptTree.json  ← file whose JSON has a "Data" property
      batch2/
        ...

  Output mirrors the input structure:
    output/
      batch1/
        <docId>.es.json
        <docId>.report.json
        batch-summary.json
      batch2/
        ...
`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`✖ Failed to load "${filePath}": ${e.message}`);
    process.exit(1);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function flattenHit(hit) {
  // jcr:content.jcr:created (content node replication time) overwrites the page-level
  // jcr:created (original page creation date). Preserve the page-level value under a
  // distinct key so rules can reference it without ambiguity.
  const content = hit['jcr:content'] || {};
  const merged = { ...hit, ...content };
  if (hit['jcr:created'] !== undefined) {
    merged['jcr:page-created'] = hit['jcr:created'];
  }
  return merged;
}

function resolveDocId(doc) {
  const eyId = doc['ey:id'];
  if (eyId && String(eyId).trim()) return String(eyId).trim();

  const jcrPath = String(doc['jcr:path'] || '');
  const segments = jcrPath.split('/').filter(Boolean);
  if (segments.length > 0) return segments[segments.length - 1];

  return `doc-${Date.now()}`;
}

/**
 * Detect which JSON file in a folder is the AEM hits file and which is the
 * concept tree, purely by inspecting the JSON structure.
 * AEM file  → has a top-level "hits" array
 * Concept   → has a top-level "Data" object
 * Result    → flat object (not hits[], not Data{}) — expected ES output for comparison
 */
function detectInputFiles(folderPath) {
  const jsonFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith('.json'));

  let aemFile     = null;
  let conceptFile = null;
  let resultFile  = null;

  for (const file of jsonFiles) {
    const fullPath = path.join(folderPath, file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch {
      continue;
    }

    if (Array.isArray(parsed?.hits)) {
      aemFile = fullPath;
    } else if (parsed?.Data && typeof parsed.Data === 'object') {
      conceptFile = fullPath;
    } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      resultFile = fullPath;
    }
  }

  return { aemFile, conceptFile, resultFile };
}

// ---------------------------------------------------------------------------
// Core: process one batch folder → output dir
// ---------------------------------------------------------------------------

function processBatch({ aemPath, conceptPath, resultPath = null, mapping, postProcessing, outputDir, batchLabel }) {
  const aemData     = loadJson(aemPath);
  const conceptTree = aemData?.Data ? aemData.Data : loadJson(conceptPath)?.Data;
  const expected    = resultPath ? loadJson(resultPath) : null;

  const hits = aemData?.hits;
  if (!Array.isArray(hits) || hits.length === 0) {
    console.error(`  ✖ No hits[] found in "${aemPath}" — skipping.`);
    return null;
  }

  ensureDir(outputDir);

  const batchResults = [];

  for (const hit of hits) {
    const aemDoc = flattenHit(hit);
    const docId  = resolveDocId(aemDoc);

    const { document, meta } = buildEsDocument({ aemDoc, conceptTree, mapping, postProcessing });
    const report = generateReport({
      docId,
      source: path.basename(aemPath),
      document,
      meta,
      mapping,
      expected
    });

    const esFile     = path.join(outputDir, `${docId}.es.json`);
    const reportFile = path.join(outputDir, `${docId}.report.json`);

    fs.writeFileSync(esFile,     JSON.stringify(document, null, 2));
    fs.writeFileSync(reportFile, JSON.stringify(report,   null, 2));

    const { summary } = report;
    const issueCount  = summary.empty + summary.undefined + summary.unimplemented + summary.errors;
    const statusIcon  = issueCount === 0 ? '✅' : '⚠️ ';

    console.log(`  ${statusIcon} ${docId}  (${summary.populated}/${summary.totalFields} ok, ${issueCount} issues)`);
    console.log(`     ES doc  → ${esFile}`);
    console.log(`     Report  → ${reportFile}`);

    batchResults.push({ docId, esFile, reportFile, summary });
  }

  const summaryFile = path.join(outputDir, 'batch-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({
    batch: batchLabel,
    processedAt: new Date().toISOString(),
    count: hits.length,
    docs: batchResults
  }, null, 2));

  console.log(`  📊 Summary → ${summaryFile}\n`);
  return batchResults;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args[0] === '--input' || args[0] === '-i') {
  // ── FOLDER BATCH MODE ─────────────────────────────────────────────────────
  // node main.js --input ./input ./mapper/rules.json
  const inputDir   = args[1];
  const rulesArg   = args[2];

  if (!inputDir || !rulesArg) usage();

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    console.error(`✖ Input folder not found: "${inputDir}"`);
    process.exit(1);
  }

  const mapping = loadJson(rulesArg);
  const postProcessing = mapping['__postProcessing'] || {};
  delete mapping['__postProcessing'];

  // Find all subdirectories in the input folder
  const batchFolders = fs.readdirSync(inputDir).filter((name) => {
    const full = path.join(inputDir, name);
    return fs.statSync(full).isDirectory();
  });

  if (batchFolders.length === 0) {
    console.error(`✖ No subdirectories found inside "${inputDir}". Create one per batch.`);
    process.exit(1);
  }

  const rootOutputDir = path.join(process.cwd(), 'output');
  const allBatches    = [];

  for (const batchName of batchFolders) {
    const batchInputDir  = path.join(inputDir, batchName);
    const batchOutputDir = path.join(rootOutputDir, batchName);

    console.log(`\n📁 Batch: ${batchName}`);

    const { aemFile, conceptFile, resultFile } = detectInputFiles(batchInputDir);

    if (!aemFile) {
      console.error(`  ✖ No AEM file (with "hits" array) found in "${batchInputDir}" — skipping.`);
      continue;
    }
    if (!conceptFile) {
      console.error(`  ✖ No concept tree file (with "Data" object) found in "${batchInputDir}" — skipping.`);
      continue;
    }

    console.log(`  AEM    : ${path.basename(aemFile)}`);
    console.log(`  Concept: ${path.basename(conceptFile)}`);
    if (resultFile) console.log(`  Result : ${path.basename(resultFile)} (expected)`);

    const results = processBatch({
      aemPath:     aemFile,
      conceptPath: conceptFile,
      resultPath:  resultFile,
      mapping,
      postProcessing,
      outputDir:   batchOutputDir,
      batchLabel:  batchName
    });

    if (results) {
      allBatches.push({ batch: batchName, docs: results });
    }
  }

  // Write a top-level all-batches summary
  const globalSummaryFile = path.join(rootOutputDir, 'all-batches-summary.json');
  ensureDir(rootOutputDir);
  fs.writeFileSync(globalSummaryFile, JSON.stringify({
    processedAt: new Date().toISOString(),
    totalBatches: allBatches.length,
    batches: allBatches.map(({ batch, docs }) => ({
      batch,
      totalDocs: docs.length,
      docs: docs.map(({ docId, summary }) => ({ docId, summary }))
    }))
  }, null, 2));

  const totalDocs = allBatches.reduce((n, b) => n + b.docs.length, 0);
  console.log(`\n✅ Done — ${allBatches.length} batch(es), ${totalDocs} doc(s)`);
  console.log(`📊 All-batches summary → ${globalSummaryFile}`);

} else {
  // ── SINGLE / EXPLICIT AEM FILE MODE ───────────────────────────────────────
  // node main.js aem.json conceptTree.json rules.json output.json
  const [aemPath, conceptPath, mappingPath, outputArg] = args;

  if (!aemPath || !conceptPath || !mappingPath || !outputArg) usage();

  const mapping     = loadJson(mappingPath);
  const postProcessing = mapping['__postProcessing'] || {};
  delete mapping['__postProcessing'];
  const aemData     = loadJson(aemPath);
  const conceptTree = loadJson(conceptPath)?.Data;

  const hits = aemData?.hits;
  if (!Array.isArray(hits) || hits.length === 0) {
    console.error('✖ No hits[] found in AEM input file.');
    process.exit(1);
  }

  if (hits.length > 1) {
    // Multiple hits in a single file → use output/<docId>.* naming
    const outDir = path.join(process.cwd(), 'output');
    processBatch({ aemPath, conceptPath, mapping, postProcessing, outputDir: outDir, batchLabel: 'default' });
  } else {
    // Exactly one hit → write to the exact path the user requested (backward compat)
    const aemDoc = flattenHit(hits[0]);
    const docId  = resolveDocId(aemDoc);

    const { document, meta } = buildEsDocument({ aemDoc, conceptTree, mapping, postProcessing });
    const report = generateReport({
      docId,
      source: path.basename(aemPath),
      document,
      meta,
      mapping
    });

    const reportFile = outputArg.replace(/\.json$/i, '.report.json');
    ensureDir(path.dirname(path.resolve(outputArg)));
    fs.writeFileSync(outputArg,  JSON.stringify(document, null, 2));
    fs.writeFileSync(reportFile, JSON.stringify(report,   null, 2));

    const { summary } = report;
    const issueCount  = summary.empty + summary.undefined + summary.unimplemented + summary.errors;
    const statusIcon  = issueCount === 0 ? '✅' : '⚠️ ';

    console.log(`${statusIcon} ${docId}  (${summary.populated}/${summary.totalFields} ok, ${issueCount} issues)`);
    console.log(`   ES doc  → ${path.resolve(outputArg)}`);
    console.log(`   Report  → ${path.resolve(reportFile)}`);
  }
}


