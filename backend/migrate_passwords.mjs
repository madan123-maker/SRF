/**
 * Migration: Hash all plain-text passwords in MongoDB with SHA-256
 * Run from backend directory: node migrate_passwords.mjs
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema, 'users');

function isAlreadyHashed(pwd) {
  // SHA-256 produces a 64-char hex string
  return typeof pwd === 'string' && /^[a-f0-9]{64}$/i.test(pwd);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users total.`);

  let alreadyHashed = 0;
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const pwd = user.password;

    if (!pwd) {
      console.log(`  ⚠️  [${user.username || user.id}] — No password, skipping`);
      skipped++;
      continue;
    }

    if (isAlreadyHashed(pwd)) {
      console.log(`  ✓  [${user.username || user.id}] — Already hashed`);
      alreadyHashed++;
      continue;
    }

    // Plain text — hash it
    const hashed = sha256(pwd);
    await User.updateOne({ _id: user._id }, { $set: { password: hashed } });
    console.log(`  🔐 [${user.username || user.id}] — Hashed: ${pwd.slice(0,3)}*** → ${hashed.slice(0,8)}...`);
    migrated++;
  }

  console.log(`\n━━━ Migration Complete ━━━`);
  console.log(`  Already hashed : ${alreadyHashed}`);
  console.log(`  Migrated now   : ${migrated}`);
  console.log(`  Skipped        : ${skipped}`);
  console.log(`  Total          : ${users.length}`);

  await mongoose.disconnect();
  console.log('\n✅ Done. All passwords are now SHA-256 hashed in MongoDB.');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
