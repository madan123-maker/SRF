import mongoose from 'mongoose';

const FormFieldSchema = new mongoose.Schema({}, { strict: false });
const FormField = mongoose.model('FormField', FormFieldSchema, 'formfields');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  const field = await FormField.findOne({ id: 'field_srf6_4_1' }).lean();
  console.log('field_srf6_4_1:', JSON.stringify(field, null, 2));
  process.exit(0);
}
check();
