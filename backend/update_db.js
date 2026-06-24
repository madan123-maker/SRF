import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
dotenv.config({ path: './backend/.env' });
dotenv.config({ path: './server/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/userform';

const FormFieldSchema = new mongoose.Schema({}, { strict: false });
const FormField = mongoose.model('FormField', FormFieldSchema);

async function updateDb() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const arrowText = fs.readFileSync('arrow_marks.txt', 'utf8');
  const arrowLines = arrowText.split('\n')
    .map(line => line.replace('➢', '').trim())
    .filter(line => line.length > 5);

  const fields = await FormField.find({});
  let updatedCount = 0;

  for (let field of fields) {
    if (field.get('docs') && Array.isArray(field.get('docs'))) {
      const originalDocs = field.get('docs');
      const filteredDocs = originalDocs.filter(doc => {
        const docName = (doc.name || '').trim();
        if (docName === '-' || docName === '') return false;
        const isArrow = arrowLines.some(arrow => 
          arrow.includes(docName) || docName.includes(arrow)
        );
        return !isArrow;
      });

      if (filteredDocs.length !== originalDocs.length) {
        await FormField.updateOne({ _id: field._id }, { $set: { docs: filteredDocs } });
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} form fields in MongoDB.`);
  await mongoose.disconnect();
}

updateDb().catch(console.error);
