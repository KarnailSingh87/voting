import jwt from 'jsonwebtoken';

export default function voterAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing auth token' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    req.voter = { id: payload.vid, aadhaarHash: payload.aadhaarHash };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
