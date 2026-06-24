import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema, 'users');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users in database.`);
  users.forEach(u => {
    console.log(`ID: ${u.id}, Role: ${u.role}, State: ${u.state}`);
  });
  process.exit(0);
}
check();
