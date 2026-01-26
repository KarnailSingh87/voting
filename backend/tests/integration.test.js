import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../server.js';
import Student from '../models/Student.js';
import Voter from '../models/Voter.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import { hashAadhaar } from '../config/otpService.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('Integration: import -> lookup -> vote', () => {
  let studentRoll = 'INTTEST2301';
  let voterId = null;
  let candidateId = null;
  let electionId = null;

  let replset;
  beforeAll(async () => {
    // use a single-node replica set so transactions are supported in tests
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    await mongoose.connect(uri, { autoIndex: true });
    // clean up any existing test docs
    await Student.deleteMany({ roll: { $regex: '^INTTEST' } });
    await Voter.deleteMany({ identifierRaw: { $regex: '^INTTEST' } });
    await Candidate.deleteMany({});
    await Election.deleteMany({ title: /Integration Test/ });

    // create student (master list)
    await Student.create({ roll: studentRoll, name: 'Integration Tester', email: '', mobile: '', registeredAt: new Date(), voted: false });

    // create voter record (as if OTP verified)
    const idHash = hashAadhaar(studentRoll);
    const voter = await Voter.create({ aadhaarHash: idHash, identifierRaw: studentRoll, name: 'Integration Tester' });
    voterId = voter._id;

    // create election and candidate
    const start = new Date(Date.now() - 1000 * 60);
    const end = new Date(Date.now() + 1000 * 60 * 60);
    const election = await Election.create({ title: 'Integration Test Election', description: 'Test', startTime: start, endTime: end, status: 'ongoing' });
    electionId = election._id;
    const candidate = await Candidate.create({ name: 'Test Candidate', party: 'Independent', election: electionId });
    candidateId = candidate._id;
  });

  afterAll(async () => {
    // cleanup
    await Student.deleteMany({ roll: { $regex: '^INTTEST' } });
    await Voter.deleteMany({ identifierRaw: { $regex: '^INTTEST' } });
    await Candidate.deleteMany({});
    await Election.deleteMany({ title: /Integration Test/ });
  await mongoose.disconnect();
  if (replset) await replset.stop();
  });

  it('student-lookup returns the student', async () => {
    const res = await request(app).post('/api/student-lookup').send({ roll: studentRoll });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.name).toBe('Integration Tester');
  });

  it('can cast a vote and prevents double voting', async () => {
    // sign token for voter
    const idHash = hashAadhaar(studentRoll);
    const token = jwt.sign({ vid: voterId, aadhaarHash: idHash }, SECRET, { expiresIn: '1h' });

    const res = await request(app).post('/api/vote/cast').set('Authorization', `Bearer ${token}`).send({ candidateId });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Vote cast');

    // second attempt should fail
    const res2 = await request(app).post('/api/vote/cast').set('Authorization', `Bearer ${token}`).send({ candidateId });
    expect(res2.status).toBe(409);
  });
});
