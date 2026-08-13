import mongoose from 'mongoose';

export async function connectDB(uri) {
  try {
    if (!uri) {
      throw new Error('MONGO_URI environment variable is missing');
    }
    await mongoose.connect(uri, { autoIndex: true });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    if (err.message && err.message.includes('bad auth')) {
      console.error('💡 Tip: Authentication failed. Please verify MONGO_URI in your Render web service Environment settings.');
    }
    process.exit(1);
  }
}

