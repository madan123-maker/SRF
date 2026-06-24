import fs from 'fs';

const content = fs.readFileSync('src/db/store.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('sync') || line.includes('fetch') || line.includes('save') || line.includes('POST') || line.includes('api/')) {
    if (line.includes('function') || line.includes(' = ') || line.includes('url') || line.includes('const') || line.includes('let')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
