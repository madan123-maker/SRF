import mongoose from 'mongoose';
import { connectDB, Assignment, Edition, ReformArea, FormField } from './server/db.js';

const MONGODB_URI = 'mongodb://127.0.0.1:27017/userform';

async function run() {
  await connectDB(MONGODB_URI);
  
  const targetEditionId = 'edition_1781178059672_6ofe';

  console.log('\n--- TARGET EDITION ---');
  const ed = await Edition.findOne({ id: targetEditionId }).lean();
  console.log(JSON.stringify(ed, null, 2));

  console.log('\n--- REFORM AREAS FOR TARGET ---');
  const ras = await ReformArea.find({ editionId: targetEditionId }).lean();
  console.log(JSON.stringify(ras, null, 2));

  console.log('\n--- FORM FIELDS FOR TARGET ---');
  const fields = await FormField.find({ editionId: targetEditionId }).lean();
  console.log(JSON.stringify(fields, null, 2));

  console.log('\n--- ASSIGNMENTS FOR TARGET ---');
  const assigns = await Assignment.find({ editionId: targetEditionId }).lean();
  console.log(JSON.stringify(assigns, null, 2));

  await mongoose.disconnect();
}

run();
