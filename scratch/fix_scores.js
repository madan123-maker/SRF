import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({}, { strict: false });
const Answer = mongoose.model('ApplicationAnswer', AnswerSchema, 'applicationanswers');

const ApplicationSchema = new mongoose.Schema({}, { strict: false });
const Application = mongoose.model('Application', ApplicationSchema, 'applications');

const FormFieldSchema = new mongoose.Schema({}, { strict: false });
const FormField = mongoose.model('FormField', FormFieldSchema, 'formfields');

function isAnswerNo(val, field) {
  if (!val) return false;
  if (typeof val === 'string') {
    if (val.trim().toLowerCase() === 'no') return true;
    if (val.trim().toLowerCase() === 'not applicable' || val.trim().toLowerCase() === 'n/a') return true;
    if (val.startsWith('{')) {
      try {
        const parsed = JSON.parse(val);
        let elementsList = [];
        if (field?.customCanvas) {
          elementsList = typeof field.customCanvas === 'string' ? JSON.parse(field.customCanvas) : field.customCanvas;
        } else if (field?.elements && field.elements.length > 0) {
          elementsList = typeof field.elements === 'string' ? JSON.parse(field.elements) : field.elements;
        }
        let hasNo = false;
        elementsList.forEach(el => {
          if (el.options && el.options.length > 0 && parsed[el.id] === 'No') {
            hasNo = true;
          }
        });
        return hasNo;
      } catch(e) {}
    }
  }
  return false;
}

async function fix() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userform');
  
  const answers = await Answer.find({}).lean();
  const fields = await FormField.find({}).lean();
  const fieldsMap = {};
  fields.forEach(f => { fieldsMap[f.id] = f; });
  
  console.log(`Scanning ${answers.length} answers...`);
  
  let fixedCount = 0;
  for (let ans of answers) {
    if (ans.questionStatus === 'Approved') {
      const field = fieldsMap[ans.fieldId];
      const isUploadType = ['file', 'pdf', 'imageupload'].includes(field?.fieldType) || field?.isUploadElement;
      
      let isAnswered = false;
      if (isUploadType) {
        isAnswered = Array.isArray(ans.files) && ans.files.length > 0;
      } else if (field?.fieldType === 'radio') {
        isAnswered = ans.value && !isAnswerNo(ans.value, field);
      } else {
        isAnswered = typeof ans.value === 'string' && ans.value.trim() !== '';
      }
      
      if (!isAnswered || isAnswerNo(ans.value, field)) {
        if (ans.questionScore !== 0) {
          console.log(`Fixing Answer ${ans._id} (Field: ${ans.fieldId}): setting score from ${ans.questionScore} to 0`);
          await Answer.updateOne({ _id: ans._id }, { $set: { questionScore: 0 } });
          fixedCount++;
        }
      }
    }
  }
  
  console.log(`Fixed ${fixedCount} answers. Recalculating application total scores...`);
  
  const apps = await Application.find({}).lean();
  for (let app of apps) {
    const appAnswers = await Answer.find({ applicationId: app.id }).lean();
    const totalScore = appAnswers.reduce((sum, a) => sum + (a.questionScore || 0), 0);
    if (app.score !== totalScore) {
      console.log(`Updating App ${app.id} total score from ${app.score} to ${totalScore}`);
      await Application.updateOne({ _id: app._id }, { $set: { score: totalScore } });
    }
  }
  
  console.log('Database score repair completed successfully.');
  process.exit(0);
}

fix();
