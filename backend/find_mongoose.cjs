const fs = require('fs');
const content = fs.readFileSync('src/routes/index.js', 'utf8');

const mongooseMethods = ['find', 'findOne', 'findOneAndUpdate', 'deleteMany', 'deleteOne', 'countDocuments', 'findById'];
let resultText = '';

for (const method of mongooseMethods) {
    const regex = new RegExp(`\\b([A-Z][a-zA-Z0-9_]+)\\.${method}\\(`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match[1] === 'JSON' || match[1] === 'Object' || match[1] === 'Date') continue;

        const lines = content.substring(0, match.index).split('\n');
        const lineNum = lines.length;
        const fullLine = content.split('\n')[lineNum - 1].replace(/\r/g, '').trim();
        resultText += `Line ${lineNum}: ${match[1]}.${method} -> ${fullLine}\n`;
    }
}

fs.writeFileSync('mongoose_results.txt', resultText);
