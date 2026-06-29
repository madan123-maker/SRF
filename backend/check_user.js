import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema, 'users');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const users = await User.find({ email: { $regex: 'srfpap', $options: 'i' } }).lean();
  console.log('Users found with regex "srfpap":', users.length);
  users.forEach(u => console.log(u.id, `'${u.email}'`, `'${u.username}'`));

  process.exit(0);
}

test().catch(console.error);
