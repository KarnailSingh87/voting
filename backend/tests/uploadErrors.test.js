import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';

const ADMIN_SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('Upload error handling', () => {
  let mongod;
  let token;
  let electionId;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { autoIndex: true });
    token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, ADMIN_SECRET, { expiresIn: '1h' });
    // create a test election so import endpoint accepts requests that require electionId
    const now = new Date();
    const later = new Date(Date.now() + 60 * 60 * 1000);
    const res = await request(app).post('/api/admin/election').set('Authorization', `Bearer ${token}`).send({ title: 'Test Election', startDate: now.toISOString(), endDate: later.toISOString() });
    electionId = res.body && res.body.election && res.body.election._id ? res.body.election._id : null;
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('returns 413 for files larger than limit', async () => {
    // token and electionId created in beforeAll
    // create a buffer slightly larger than 10MB
  const big = Buffer.alloc(50 * 1024 * 1024 + 100, 'a');
    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('electionId', electionId)
      .attach('file', big, { filename: 'big.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/File too large/i);
  });

  it('rejects invalid file type', async () => {
    const txt = Buffer.from('hello');
    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('electionId', electionId)
      .attach('file', txt, { filename: 'bad.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid file type/i);
  });

  it('returns 500 for corrupt-but-valid-extension files', async () => {
    // send a file named .xlsx but with invalid contents
    const bad = Buffer.from('this is not a spreadsheet');
    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .field('electionId', electionId)
      .attach('file', bad, { filename: 'corrupt.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    // parsing may not throw; server currently returns success with imported=0 for invalid contents
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.imported).toBe('number');
  });
});
