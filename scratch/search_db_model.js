import fs from 'fs';

const content = fs.readFileSync('server/db.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('model(') || line.includes('Schema(')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
