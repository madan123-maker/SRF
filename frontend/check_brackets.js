const fs = require('fs');
const acorn = require('acorn');
try {
  acorn.parse(fs.readFileSync('app.js', 'utf8'), { ecmaVersion: 2020 });
  console.log("Syntax is OK");
} catch (e) {
  console.log("Acorn error at: " + e.loc.line + ":" + e.loc.column);
}
