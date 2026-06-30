const fs = require('fs');
fetch('http://localhost:5001/api/db', {
  headers: {
    'X-User-Role': 'superadmin'
  }
}).then(r => r.json()).then(db => {
  db.users.forEach(u => {
    if (u.id === 'user_admin') {
      u.name = 'DPIIT Admin Changed ' + Date.now();
    }
  });
  
  fetch('http://localhost:5001/api/db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'user_superadmin',
      'X-User-Role': 'superadmin'
    },
    body: JSON.stringify(db)
  }).then(async r => {
    console.log('Status:', r.status);
    console.log('Response:', await r.text());
  });
});
