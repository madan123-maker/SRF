const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('db-sync-complete') || line.includes('setInterval') || line.includes('sync') || line.includes('db-sync')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
