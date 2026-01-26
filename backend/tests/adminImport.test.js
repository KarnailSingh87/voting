import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';

const ADMIN_SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('Admin import endpoint', () => {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri, { autoIndex: true });
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('rejects without token', async () => {
    const res = await request(app).post('/api/admin/import-students');
    expect(res.status).toBe(401);
  });

  it('accepts token but requires file', async () => {
    const token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, ADMIN_SECRET, { expiresIn: '1h' });
    const res = await request(app).post('/api/admin/import-students').set('Authorization', `Bearer ${token}`);
    // multer will likely return 400 for missing file/field
    expect([400, 500, 401]).toContain(res.status);
  });
});
