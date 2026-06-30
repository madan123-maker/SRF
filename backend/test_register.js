import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:5001/api/register-public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'testuser' + Date.now(),
      email: 'ramanadhamjayaveer@gmail.com',
      password: 'password123',
      name: 'Test',
      organization: 'Org',
      state: 'State',
      district: 'District',
      sector: 'Sector',
      nodalOfficer: 'Officer',
      startupName: 'Startup'
    })
  });
  console.log(await res.json());
}
test();
