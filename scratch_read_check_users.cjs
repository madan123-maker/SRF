
const mongoose = require('mongoose');

async function check() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/userform');
    const UserSchema = new mongoose.Schema({}, { strict: false });
    // Prevent overwrite model compiler error if already registered
    const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
    const users = await User.find({}).lean();
    console.log('--- Database User Accounts ---');
    users.forEach(u => {
      console.log('Username:', u.username, '| Password:', u.password, '| Role:', u.role, '| Name:', u.name);
    });
  } catch (err) {
    console.error('Error querying MongoDB:', err);
  } finally {
    process.exit(0);
  }
}
check();
