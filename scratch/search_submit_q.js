import fs from 'fs';

const content = fs.readFileSync('src/db/store.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('submitQuestion')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
