import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', UserSchema);

const AssignmentSchema = new mongoose.Schema({}, { strict: false });
const Assignment = mongoose.model('Assignment', AssignmentSchema);

const EditionSchema = new mongoose.Schema({}, { strict: false });
const Edition = mongoose.model('Edition', EditionSchema);

const MessageSchema = new mongoose.Schema({}, { strict: false });
const Message = mongoose.model('Message', MessageSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const user = await User.findOne({ username: 'jon' }).lean();
  console.log('User Jon:', user?.id);
  
  if (user) {
    const assignments = await Assignment.find({ userId: user.id }).lean();
    console.log('Assignments count:', assignments.length);
    if (assignments.length > 0) {
      const edIds = [...new Set(assignments.map(a => a.editionId))];
      const editions = await Edition.find({ id: { $in: edIds } }).lean();
      console.log('Editions mapped:', editions.map(e => e.id + ' ' + e.status));
    }
    
    const messages = await Message.find({ $or: [{ senderId: user.id }, { receiverId: user.id }] }).lean();
    console.log('Messages count:', messages.length);
  }
  
  await mongoose.disconnect();
}
run();
