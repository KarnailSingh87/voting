import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../server.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';

describe('Public results transparency', () => {
  let replset;
  let electionId;

  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    await mongoose.connect(uri, { autoIndex: true });

    const start = new Date(Date.now() - 1000 * 60);
    const end = new Date(Date.now() + 1000 * 60 * 60);
    const election = await Election.create({
      title: 'Transparency Test Election',
      description: 'Public results proof test',
      startTime: start,
      endTime: end,
      status: 'ended',
    });
    electionId = election._id.toString();

    await Candidate.create([
      { name: 'Candidate One', party: 'A', election: electionId, voteCount: 12 },
      { name: 'Candidate Two', party: 'B', election: electionId, voteCount: 8 },
    ]);
  });

  afterAll(async () => {
    await Candidate.deleteMany({ election: electionId });
    await Election.deleteMany({ _id: electionId });
    await mongoose.disconnect();
    if (replset) await replset.stop();
  });

  it('returns result hash and signature', async () => {
    const res = await request(app).get(`/api/election/${electionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resultProof).toBeTruthy();
    expect(typeof res.body.resultProof.hash).toBe('string');
    expect(res.body.resultProof.hash.length).toBeGreaterThan(10);
    expect(typeof res.body.resultProof.signature).toBe('string');
    expect(res.body.csvUrl).toContain(`/api/election/${electionId}/results.csv`);
  });

  it('serves CSV download', async () => {
    const res = await request(app).get(`/api/election/${electionId}/results.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Candidate One');
    expect(res.text).toContain('Candidate Two');
  });
});
