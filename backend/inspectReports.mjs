import { connectDB } from './config/db.js';
import IdentityReport from './models/IdentityReport.js';

(async ()=>{
  try {
    const uri = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/aadhaar_Voting';
    await connectDB(uri);
    const items = await IdentityReport.find().sort({ createdAt: -1 }).limit(20).lean();
    console.log(JSON.stringify(items.map(i=>({ _id:i._id, roll:i.roll, phone:i.phone, userMessage:i.userMessage, reason:i.reason, contactProvided:i.contactProvided, reporterIp:i.reporterIp, createdAt:i.createdAt })), null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e);
    process.exit(2);
  }
})();
