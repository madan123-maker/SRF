import fs from 'fs';

const content = fs.readFileSync('src/modules/applicationManager.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('btn-reject-q')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
