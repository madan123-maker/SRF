import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const ApplicationSchema = new mongoose.Schema({}, { strict: false });
const Application = mongoose.model('Application', ApplicationSchema, 'applications');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  const apps = await Application.find({}).lean();
  console.log(`Found ${apps.length} applications in database.`);
  apps.forEach(app => {
    console.log(`ID: ${app.id}, Status: ${app.status}, State: ${app.state}, Org: ${app.organization}, Edition: ${app.editionId}`);
  });
  process.exit(0);
}
check();
