const mongoose = require('mongoose');
const { Edition } = require('./db.js');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/srf_db').then(async () => {
  console.log('Connected');
  try {
    const res = await Edition.findOneAndUpdate(
      { id: 'ed_test_123' },
      { $set: { id: 'ed_test_123', name: 'Test Edition 123', status: 'draft', isDeleted: false } },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('Update Result:', res);
  } catch (err) {
    console.error('Update Error:', err);
  }
  mongoose.disconnect();
});
