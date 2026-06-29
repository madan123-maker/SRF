/**
 * Cleanup: Remove applications referencing non-existent users from MongoDB
 * Run from backend directory: node cleanup_orphans.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

const schema = new mongoose.Schema({}, { strict: false });
const User        = mongoose.model('User',        schema, 'users');
const Application = mongoose.model('Application', new mongoose.Schema({}, { strict: false }), 'applications');
const AppAnswer   = mongoose.model('AppAnswer',   new mongoose.Schema({}, { strict: false }), 'applicationanswers');
const Assignment  = mongoose.model('Assignment',  new mongoose.Schema({}, { strict: false }), 'assignments');

async function cleanup() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const users = await User.find({}, { id: 1 }).lean();
  const validUserIds = new Set(users.map(u => u.id));
  console.log(`Found ${validUserIds.size} valid users.\n`);

  // --- Applications ---
  const apps = await Application.find({}).lean();
  const orphanAppIds = [];
  for (const app of apps) {
    if (app.userId && !validUserIds.has(app.userId)) {
      orphanAppIds.push(app.id || String(app._id));
      console.log(`  🗑  Orphan app: ${app.id} (owner user: ${app.userId} not found)`);
    }
  }
  if (orphanAppIds.length > 0) {
    await Application.deleteMany({ id: { $in: orphanAppIds } });
    console.log(`\n  ✅ Deleted ${orphanAppIds.length} orphan application(s)`);
  } else {
    console.log('  ✓  No orphan applications found');
  }

  // --- Application Answers ---
  const answers = await AppAnswer.find({}).lean();
  const orphanAnswerIds = [];
  for (const ans of answers) {
    if (ans.applicationId && orphanAppIds.includes(ans.applicationId)) {
      orphanAnswerIds.push(ans.id || String(ans._id));
    }
  }
  if (orphanAnswerIds.length > 0) {
    await AppAnswer.deleteMany({ id: { $in: orphanAnswerIds } });
    console.log(`  ✅ Deleted ${orphanAnswerIds.length} orphan answer(s)`);
  } else {
    console.log('  ✓  No orphan answers found');
  }

  // --- Assignments ---
  const assignments = await Assignment.find({}).lean();
  const orphanAssignIds = [];
  for (const a of assignments) {
    if (a.userId && !validUserIds.has(a.userId)) {
      orphanAssignIds.push(a.id || String(a._id));
      console.log(`  🗑  Orphan assignment: ${a.id} (userId: ${a.userId})`);
    }
  }
  if (orphanAssignIds.length > 0) {
    await Assignment.deleteMany({ id: { $in: orphanAssignIds } });
    console.log(`  ✅ Deleted ${orphanAssignIds.length} orphan assignment(s)`);
  } else {
    console.log('  ✓  No orphan assignments found');
  }

  console.log('\n━━━ Cleanup Complete ━━━');
  await mongoose.disconnect();
  console.log('✅ Done. Database integrity restored.');
}

cleanup().catch(err => { console.error('❌ Error:', err); process.exit(1); });
