import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({}, { strict: false });
const Answer = mongoose.model('ApplicationAnswer', AnswerSchema, 'applicationanswers');

async function dump() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  
  const answers = await Answer.find({}).lean();
  console.log(`Total answers in DB: ${answers.length}`);
  
  answers.forEach(a => {
    console.log(`AppID: ${a.applicationId}, FieldID: ${a.fieldId}, Status: ${a.questionStatus}, Score: ${a.questionScore}, ApprovedBy: ${a.approvedBy}`);
  });

  process.exit(0);
}
dump();
