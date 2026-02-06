import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../server.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';

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
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import { app, startServer } from '../server.js';

if (typeof jest !== 'undefined' && typeof jest.setTimeout === 'function') {
  jest.setTimeout(30000);
}

describe('Public endpoints and scheduler', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    // speed up scheduler for tests
    process.env.ELECTION_SCHEDULE_INTERVAL_MS = '200';
    // allow server to pick an ephemeral port
    process.env.PORT = '0';
    // start server (connects DB and starts scheduler)
    await startServer();
  });

  afterAll(async () => {
    try { await mongoose.disconnect(); } catch (e) {}
    if (mongod) await mongod.stop();
  });

  test('GET /api/election/:id returns candidates and totals', async () => {
    const election = await Election.create({ title: 'Public Test', description: 'desc', startTime: new Date(), endTime: new Date(Date.now() + 100000), status: 'ongoing' });
    await Candidate.create({ election: election._id, name: 'Alice', party: 'A', voteCount: 10 });
    await Candidate.create({ election: election._id, name: 'Bob', party: 'B', voteCount: 5 });
    await Candidate.create({ election: election._id, name: 'Carol', party: 'C', voteCount: 0 });

    const res = await request(app).get(`/api/election/${String(election._id)}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates.length).toBe(3);
    const total = res.body.totalVotes;
    expect(total).toBe(15);
  });

  test('scheduler auto-starts and auto-ends elections', async () => {
    // schedule: start shortly, end shortly after
    const now = Date.now();
    const start = new Date(now + 400); // start in 400ms
    const end = new Date(now + 1200);  // end in 1200ms
    const e = await Election.create({ title: 'Sched Test', description: 'sched', startTime: start, endTime: end, status: 'scheduled' });

    // wait enough for scheduler to run and flip to ongoing
    await new Promise(r => setTimeout(r, 800));
    const afterStart = await Election.findById(e._id).lean();
    expect(afterStart.status === 'ongoing' || afterStart.status === 'ended').toBe(true);

    // wait until after end
    await new Promise(r => setTimeout(r, 700));
    const afterEnd = await Election.findById(e._id).lean();
    expect(afterEnd.status).toBe('ended');
  });

  test('GET /api/ledger/:electionId returns filtered votes with pagination', async () => {
    const elec = await Election.create({ title: 'Ledger Test', description: 'ledger', startTime: new Date(), endTime: new Date(Date.now() + 10000), status: 'ongoing' });
    // create some votes referencing election
    const votes = [];
    for (let i = 0; i < 25; i++) {
      votes.push({ election: elec._id, voteHash: `h${i}`, timestamp: new Date(Date.now() - i * 1000) });
    }
    await Vote.insertMany(votes);

    const res = await request(app).get(`/api/ledger/${String(elec._id)}?page=1&limit=10`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(25);
    expect(Array.isArray(res.body.ledger)).toBe(true);
    expect(res.body.ledger.length).toBe(10);
  });
});
