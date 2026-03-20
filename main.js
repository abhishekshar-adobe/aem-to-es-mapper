// main.js
'use strict';
const fs = require('fs');
const path = require('path');
const { buildEsDocument } = require('./mapper');

function loadJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }

const [,, aemPath, conceptPath, mappingPath, outputPath] = process.argv;

const result = buildEsDocument({
  aemDoc: { ...loadJson(aemPath)?.hits[0], ...loadJson(aemPath)?.hits[0]?.["jcr:content"] },
  conceptTree: loadJson(conceptPath)?.Data,
  mapping: loadJson(mappingPath)
});

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log("Done!");
