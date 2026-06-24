import fs from 'fs';

const content = fs.readFileSync('src/modules/taskReviewManager.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('resubmit') || line.toLowerCase().includes('request')) {
    if (line.includes('button') || line.includes('click') || line.includes('function') || line.includes('status')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
