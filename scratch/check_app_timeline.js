import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = 'mongodb://127.0.0.1:27017/userform';

const ApplicationSchema = new mongoose.Schema({}, { strict: false });
const Application = mongoose.model('Application', ApplicationSchema, 'applications');

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema, 'users');

async function test() {
  await mongoose.connect(dbUrl);
  
  const app = await Application.findOne({ id: 'APP_1781780687417_IAR6G' }).lean();
  console.log('Application:', JSON.stringify(app, null, 2));

  const user = await User.findOne({ id: app.userId }).lean();
  console.log('User of this app:', user);

  process.exit(0);
}
test();
