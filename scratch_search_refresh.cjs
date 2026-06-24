const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Users/divya/OneDrive/Documents/UserFormdo/UserFormdo (2)/UserFormdo/UserForm10/UserForm/UserForm/UserForm1 2/UserForm';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        results = results.concat(walk(fullPath));
      }
    } else {
      if (file.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = walk(rootDir);

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('refreshCurrentView')) {
      const relPath = path.relative(rootDir, file);
      console.log(`${relPath}:${idx + 1}: ${line.trim()}`);
    }
  });
});
