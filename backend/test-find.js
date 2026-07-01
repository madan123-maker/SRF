const mongoose = require('mongoose');
const { Edition } = require('./db.js');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/srf_db').then(async () => {
  console.log('Connected');
  try {
    const eds = await Edition.find().lean();
    console.log('All Editions:', eds);
  } catch (err) {
    console.error('Find Error:', err);
  }
  mongoose.disconnect();
});
