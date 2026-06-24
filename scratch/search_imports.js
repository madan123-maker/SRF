import fs from 'fs';

const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.slice(0, 100).forEach((line, index) => {
  if (line.includes('taskReviewManager')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
