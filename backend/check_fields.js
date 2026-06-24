import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const FormFieldSchema = new mongoose.Schema({}, { strict: false });
const FormField = mongoose.model('FormField', FormFieldSchema, 'fields');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  const fields = await FormField.find({}).lean();
  console.log(`Found ${fields.length} form fields.`);
  
  const docFields = fields.filter(f => f.type === 'document' || f.type === 'file' || f.documentSettings);
  console.log(`Found ${docFields.length} document fields.`);
  
  if (docFields.length > 0) {
    console.log('Sample Document Field:', JSON.stringify(docFields[0], null, 2));
  }
  
  process.exit(0);
}
check();
