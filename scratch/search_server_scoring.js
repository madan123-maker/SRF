import fs from 'fs';

const content = fs.readFileSync('server/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('questionScore') || line.includes('Approved') || line.includes('score')) {
    if (line.includes(' = ') || line.includes('route') || line.includes('app.post') || line.includes('update')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
