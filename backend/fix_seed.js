import fs from 'fs';
import { SRF_6_SEED } from '../frontend/src/db/srf6Seed.js';

// Read arrow marks
const arrowText = fs.readFileSync('arrow_marks.txt', 'utf8');
const arrowLines = arrowText.split('\n')
  .map(line => line.replace('➢', '').trim())
  .filter(line => line.length > 5); // ignore short or empty lines

let removedCount = 0;

// Filter out docs that match arrow lines
SRF_6_SEED.forEach(ra => {
  ra.questions.forEach(q => {
    if (q.docs) {
      const originalDocsLen = q.docs.length;
      q.docs = q.docs.filter(doc => {
        const docName = doc.name.trim();
        // Check if docName matches any arrow line
        const isArrow = arrowLines.some(arrow => 
          arrow.includes(docName) || docName.includes(arrow)
        );
        if (isArrow) {
          console.log(`Removing doc: "${docName}"`);
          removedCount++;
          return false; // remove
        }
        return true; // keep
      });
    }
  });
});

console.log(`Removed ${removedCount} docs.`);

// Write back to srf6Seed.js
const output = `// This file is auto-generated\nexport const SRF_6_SEED = ${JSON.stringify(SRF_6_SEED, null, 2)};\n`;
fs.writeFileSync('../frontend/src/db/srf6Seed.js', output, 'utf8');
console.log('Updated src/db/srf6Seed.js');
