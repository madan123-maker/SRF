const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('btn-submit-reform-area') || line.includes('btn-submit-app') || line.includes('Submit Entire Application') || line.includes('Submit Reform Area')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
