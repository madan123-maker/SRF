import fs from 'fs';
const cssContent = fs.readFileSync('style.css', 'utf8');
const lines = cssContent.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('activity-feed') || line.includes('rb-item-card')) {
    console.log(`${idx + 1}: ${line}`);
  }
});
