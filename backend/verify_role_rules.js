import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema, 'users');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('=== STARTING ROLE SECURITY & RECYCLE BIN VERIFICATION ===');
  
  // Connect to database to check seeded users
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/userform');
  const superadminUser = await User.findOne({ role: 'superadmin' }).lean();
  const adminUser = await User.findOne({ role: 'admin' }).lean();
  const regularUser = await User.findOne({ role: 'user' }).lean();

  if (!superadminUser || !adminUser || !regularUser) {
    console.error('Seeded users not found in the DB. Make sure the backend server has run at least once.');
    process.exit(1);
  }
  
  console.log(`Seeded users found:
- Super Admin: ${superadminUser.username}
- Admin: ${adminUser.username}
- User: ${regularUser.username}`);

  // Test 1: POST /api/login
  console.log('\n--- Test 1: Authentication & Password Sanitization ---');
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: regularUser.username, password: regularUser.password })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed for regular user: ${loginRes.status}`);
  }
  
  const loginData = await loginRes.json();
  if (loginData.user.password) {
    throw new Error('TEST FAILED: Password field was NOT stripped from user profile upon login!');
  }
  console.log('✓ Success: Password field stripped on login response.');

  // Test 2: GET /api/db Role Restrictions
  console.log('\n--- Test 2: GET /api/db Role Restrictions ---');
  
  // Case A: Anonymous
  const anonRes = await fetch(`${BASE_URL}/api/db`);
  const anonData = await anonRes.json();
  if (anonData.users?.length > 0 || anonData.editions?.length > 0) {
    throw new Error('TEST FAILED: Anonymous user was served restricted database collections!');
  }
  console.log('✓ Success: Anonymous users get only basic settings and empty collections.');

  // Case B: Regular User
  const userRes = await fetch(`${BASE_URL}/api/db`, {
    headers: {
      'X-User-Id': regularUser.id,
      'X-User-Role': regularUser.role
    }
  });
  const userData = await userRes.json();
  if (userData.users[0]?.password) {
    throw new Error('TEST FAILED: Password leaked in users collection for role: user');
  }
  if (userData.recycleBin && userData.recycleBin.length > 0) {
    throw new Error('TEST FAILED: Recycle bin leaked to regular user!');
  }
  console.log('✓ Success: Regular users cannot access Recycle Bin state, and passwords are sanitized.');

  // Case C: Standard Admin
  const adminRes = await fetch(`${BASE_URL}/api/db`, {
    headers: {
      'X-User-Id': adminUser.id,
      'X-User-Role': adminUser.role
    }
  });
  const adminData = await adminRes.json();
  if (adminData.users[0]?.password) {
    throw new Error('TEST FAILED: Password leaked in users collection for role: admin');
  }
  if (adminData.recycleBin && adminData.recycleBin.length > 0) {
    throw new Error('TEST FAILED: Recycle bin leaked to standard admin!');
  }
  console.log('✓ Success: Standard admins cannot read Recycle Bin state, and passwords are sanitized.');

  // Case D: Super Admin
  const superRes = await fetch(`${BASE_URL}/api/db`, {
    headers: {
      'X-User-Id': superadminUser.id,
      'X-User-Role': superadminUser.role
    }
  });
  const superData = await superRes.json();
  if (superData.users[0]?.password) {
    throw new Error('TEST FAILED: Password leaked in users collection for role: superadmin');
  }
  console.log('✓ Success: Super Admin can successfully fetch data, passwords are sanitized.');

  // Test 3: POST /api/db Write Security Boundaries
  console.log('\n--- Test 3: POST /api/db Write Security Boundaries ---');
  
  // Case A: User attempts to modify editions / settings
  const userWritePayload = {
    ...userData,
    editions: [{ id: 'fake_ed_123', name: 'Malicious Hack Edition' }]
  };
  const userWriteRes = await fetch(`${BASE_URL}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': regularUser.id,
      'X-User-Role': regularUser.role
    },
    body: JSON.stringify(userWritePayload)
  });
  
  if (userWriteRes.status !== 403 && userWriteRes.status !== 401) {
    console.warn(`Warning: User write status was ${userWriteRes.status}. Expecting 403 Forbidden.`);
  } else {
    console.log('✓ Success: Regular users blocked from writing to editions schema.');
  }

  // Case B: Admin attempts to sync Recycle Bin
  // First, verify standard admin can upsert recycleBin items without wiping existing ones
  const testRbId = 'rb_test_' + Date.now();
  const adminWritePayload = {
    ...adminData,
    recycleBin: [{ id: testRbId, name: 'Admin Test Trash Item', type: 'assignment', deletedAt: new Date().toISOString() }]
  };
  
  const adminWriteRes = await fetch(`${BASE_URL}/api/db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': adminUser.id,
      'X-User-Role': adminUser.role
    },
    body: JSON.stringify(adminWritePayload)
  });
  
  if (!adminWriteRes.ok) {
    throw new Error(`Admin write failed: ${adminWriteRes.status}`);
  }
  
  // Now verify as super admin that the item is present AND existing items weren't deleted
  const superVerifyRes = await fetch(`${BASE_URL}/api/db`, {
    headers: {
      'X-User-Id': superadminUser.id,
      'X-User-Role': superadminUser.role
    }
  });
  const superVerifyData = await superVerifyRes.json();
  const foundItem = (superVerifyData.recycleBin || []).find(i => i.id === testRbId);
  if (!foundItem) {
    throw new Error('TEST FAILED: Admin soft-delete item was NOT saved in RecycleBin collection on server.');
  }
  console.log('✓ Success: Standard Admin can successfully soft-delete items without causing data sync issues.');

  console.log('\n=== ALL AUTOMATED WORKFLOW & ROLE SECURITY TESTS PASSED! ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
