import fs from 'fs';
import path from 'path';

function searchInDir(dir, pattern) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        searchInDir(fullPath, pattern);
      }
    } else if (file.endsWith('.js') || file.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes(pattern)) {
          console.log(`${fullPath}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  });
}

console.log('--- Search Results for Form Buttons ---');
searchInDir('.', 'Submit Entire Application');
searchInDir('.', 'Save Question');
