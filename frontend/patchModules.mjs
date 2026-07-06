import fs from 'fs';
['src/modules/formEditor.js', 'src/modules/elementsShowcase.js'].forEach(f => {
    try {
        let c = fs.readFileSync(f, 'utf8');
        c = c.replace(/from\s+['"]\.\/src\//g, "from '../");
        fs.writeFileSync(f, c);
    } catch (e) { }
});
