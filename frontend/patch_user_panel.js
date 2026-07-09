const fs = require('fs');

function patchAdvancedDashboard() {
  const filePath = './src/modules/advancedDashboard.js';
  let code = fs.readFileSync(filePath, 'utf8');
  
  // Filter apps
  code = code.replace(
    'const apps = Store.getApplicationsByUser(user.id);',
    'const apps = Store.getApplicationsByUser(user.id).filter(app => { const ed = Store.getEditionById(app.editionId); return ed && !ed.isDeleted && ed.status === "published"; });'
  );
  
  // Filter userAssignments
  code = code.replace(
    'return ed && !ed.isDeleted && ed.status !== \'archived\';',
    'return ed && !ed.isDeleted && ed.status === "published";'
  );

  fs.writeFileSync(filePath, code);
}

function patchUserPanel() {
  const filePath = './src/panels/userPanel.js';
  let code = fs.readFileSync(filePath, 'utf8');

  // Filter in renderApplyPage
  code = code.replace(
    'if (e.status === \'archived\') return false;',
    'if (e.status !== \'published\') return false;'
  );

  // Filter in renderUserAppsFiltered
  code = code.replace(
    'const allApps = getApplicationsByUser(user.id);',
    'const allApps = getApplicationsByUser(user.id).filter(app => { const ed = getEditionById(app.editionId); return ed && !ed.isDeleted && ed.status === "published"; });'
  );

  fs.writeFileSync(filePath, code);
}

patchAdvancedDashboard();
patchUserPanel();
console.log('Patched');
