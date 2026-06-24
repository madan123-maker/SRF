import fs from 'fs';

const content = fs.readFileSync('src/modules/taskReviewManager.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('function triggerBulkApproval') || line.includes('function triggerBulkRejection')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
