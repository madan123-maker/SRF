import mongoose from 'mongoose';

const ApplicationSchema = new mongoose.Schema({}, { strict: false });
const UserSchema = new mongoose.Schema({}, { strict: false });
const EditionSchema = new mongoose.Schema({}, { strict: false });

const Application = mongoose.model('Application', ApplicationSchema, 'applications');
const User = mongoose.model('User', UserSchema, 'users');
const Edition = mongoose.model('Edition', EditionSchema, 'editions');

async function dump() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  
  const users = await User.find({}).lean();
  console.log('=== USERS ===');
  users.forEach(u => {
    console.log(`ID: ${u.id}, Username: ${u.username}, Name: ${u.name}, Role: ${u.role}, Org: ${u.organization}`);
  });

  const editions = await Edition.find({}).lean();
  console.log('\n=== EDITIONS ===');
  editions.forEach(e => {
    console.log(`ID: ${e.id}, Name: ${e.name}`);
  });

  const apps = await Application.find({}).lean();
  console.log('\n=== APPLICATIONS ===');
  apps.forEach(a => {
    console.log(`ID: ${a.id}, UserID: ${a.userId}, EditionID: ${a.editionId}, Status: ${a.status}, AssignedTo: ${a.assignedReviewer}`);
  });

  process.exit(0);
}
dump();
