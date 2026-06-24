import fs from 'fs';

const content = fs.readFileSync('server/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('/api/db')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
