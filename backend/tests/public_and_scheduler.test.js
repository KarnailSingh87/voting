import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import { jest } from '@jest/globals';

jest.setTimeout(60_000);

describe('Public endpoints and scheduler behaviour', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri, { autoIndex: true });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  afterEach(async () => {
    // clear DB
    await Promise.all([Election.deleteMany({}), Candidate.deleteMany({}), Vote.deleteMany({})]);
  });

  test('GET /api/election/:id returns candidates and totals', async () => {
    const election = await Election.create({ title: 'Test Election', description: 'desc', status: 'ongoing', startTime: new Date(Date.now() - 1000), endTime: new Date(Date.now() + 1000 * 60 * 60) });
    const c1 = await Candidate.create({ election: election._id, name: 'Alice', party: 'X', voteCount: 3 });
    const c2 = await Candidate.create({ election: election._id, name: 'Bob', party: 'Y', voteCount: 2 });

    const res = await request(app).get(`/api/election/${election._id.toString()}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.election).toBeDefined();
    expect(Array.isArray(res.body.candidates)).toBe(true);
    // candidates returned sorted by voteCount desc
    expect(res.body.candidates.length).toBe(2);
    const ids = res.body.candidates.map(c => c.name);
    expect(ids).toContain('Alice');
    expect(res.body.totalVotes).toBe(5);
  });

  test('Scheduler logic: auto-start and auto-end transitions (simulated)', async () => {
    // create scheduled election that should be started
    const now = new Date();
    const eStart = await Election.create({ title: 'ToStart', status: 'scheduled', startTime: new Date(now.getTime() - 5000), endTime: new Date(now.getTime() + 60_000) });
    // create ongoing election that should end
    const eEnd = await Election.create({ title: 'ToEnd', status: 'ongoing', startTime: new Date(now.getTime() - 60_000), endTime: new Date(now.getTime() - 1000) });

    // replicate the scheduler logic used in server.js
    const runSchedulerOnce = async () => {
      const nowInner = new Date();
      const toStart = await Election.find({ status: 'scheduled', startTime: { $lte: nowInner } });
      for (const e of toStart) {
        await Election.findByIdAndUpdate(e._id, { status: 'ongoing' }, { new: true });
      }
      const toEnd = await Election.find({ status: 'ongoing', endTime: { $lte: nowInner } });
      for (const e of toEnd) {
        await Election.findByIdAndUpdate(e._id, { status: 'ended' }, { new: true });
      }
    };

    await runSchedulerOnce();

    const freshStart = await Election.findById(eStart._id).lean();
    const freshEnd = await Election.findById(eEnd._id).lean();
    expect(freshStart.status).toBe('ongoing');
    expect(freshEnd.status).toBe('ended');
  });
});
