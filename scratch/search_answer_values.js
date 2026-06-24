import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({}, { strict: false });
const Answer = mongoose.model('ApplicationAnswer', AnswerSchema, 'applicationanswers');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  
  const answers = await Answer.find({ applicationId: 'APP_1781780687417_IAR6G' }).lean();
  console.log(`Answers for APP_1781780687417_IAR6G:`);
  answers.forEach(a => {
    console.log(`Field: ${a.fieldId}, Value: "${a.value}", FilesCount: ${a.files?.length || 0}, Score: ${a.questionScore}, Status: ${a.questionStatus}`);
  });

  process.exit(0);
}
check();
