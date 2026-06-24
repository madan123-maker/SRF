import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const ApplicationAnswerSchema = new mongoose.Schema({}, { strict: false });
const ApplicationAnswer = mongoose.model('ApplicationAnswer', ApplicationAnswerSchema, 'applicationanswers');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  const ans = await ApplicationAnswer.findOne({ applicationId: 'APP_1781689004708_4TU5N', fieldId: 'field_srf6_2_2' }).lean();
  if (!ans) {
    console.log("No answer found for this app and field.");
  } else {
    console.log("Answer found! Files count:", ans.files ? ans.files.length : 'no files array');
    if (ans.files && ans.files.length > 0) {
      console.log("Files:", ans.files.map(f => ({ name: f.name, docId: f.docId, hasDataUrl: !!f.dataUrl })));
    }
  }
  process.exit(0);
}
check();
