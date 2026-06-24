import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema, 'users');

async function update() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  
  // Find user by username 'anusrividya'
  const user = await User.findOne({ username: 'anusrividya' });
  if (user) {
    user.name = 'Anu Sri Vidya';
    await user.save();
    console.log('Successfully updated username anusrividya to name Anu Sri Vidya');
  } else {
    console.log('User anusrividya not found');
  }
  
  process.exit(0);
}
update();
