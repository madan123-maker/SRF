import fs from 'fs';

const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('review-tasks') || line.includes('assigned-review-tasks')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
