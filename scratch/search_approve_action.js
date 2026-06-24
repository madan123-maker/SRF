import fs from 'fs';

const content = fs.readFileSync('src/modules/taskReviewManager.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('questionStatus') && line.includes('Approved')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
  if (line.includes('approveQuestion') || line.includes('approveQuestionAction')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
