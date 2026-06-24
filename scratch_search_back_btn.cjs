const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('btn-back-to-user-dash')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
