const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../backend/.env' });

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema, 'users');

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/userform';
  console.log('Connecting to URI:', uri);
  await mongoose.connect(uri);
  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users in database.`);
  users.forEach(u => {
    console.log(`ID: ${u.id}, Username: ${u.username}, Password: ${u.password}, Role: ${u.role}`);
  });
  process.exit(0);
}
check().catch(err => {
  console.error(err);
  process.exit(1);
});
