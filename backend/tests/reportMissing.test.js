import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';
import IdentityReport from '../models/IdentityReport.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, { autoIndex: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await IdentityReport.deleteMany({});
});

describe('POST /api/report-missing', () => {
  it('creates an IdentityReport with reason "missing" when roll is provided', async () => {
    const res = await request(app).post('/api/report-missing').send({ roll: 'R12345' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');

    const report = await IdentityReport.findOne({ roll: 'R12345' }).lean();
    expect(report).toBeTruthy();
    expect(report.reason).toBe('missing');
    expect(report.detectedName).toBeUndefined();
  });

  it('saves contactProvided when included', async () => {
    const res = await request(app)
      .post('/api/report-missing')
      .send({ roll: 'R67890', contactProvided: 'student@example.com' });
    expect(res.status).toBe(200);
    const report = await IdentityReport.findOne({ roll: 'R67890' }).lean();
    expect(report).toBeTruthy();
    expect(report.contactProvided).toBe('student@example.com');
  });

  it('returns 400 when roll is missing', async () => {
    const res = await request(app).post('/api/report-missing').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toMatch(/roll.*required/i);
  });
});
