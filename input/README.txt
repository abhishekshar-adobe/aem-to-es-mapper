Place one subfolder per batch inside this directory.

Each subfolder must contain exactly two JSON files:
  - One with a "hits" array  → AEM document file
  - One with a "Data" object → concept tree / taxonomy file

Example:
  input/
    batch1/
      KD_AemMetadataDetails.json   ← has hits[]
      conceptTree.json             ← has Data{}
    batch2/
      aem-export.json
      conceptTree.json

Run all batches in one command:
  node main.js --input ./input ./mapper/rules.json

Output will mirror this folder structure under output/:
  output/
    batch1/
      <docId>.es.json
      <docId>.report.json
      batch-summary.json
    batch2/
      ...
    all-batches-summary.json
