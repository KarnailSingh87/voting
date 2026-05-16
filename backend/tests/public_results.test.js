import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../server.js';
import Election from '../models/Election.js';
import Candidate from '../models/Candidate.js';
import Voter from '../models/Voter.js';

describe('Public results transparency', () => {
  let replset;
  let electionId;
  let candidateOneId;

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

    const [candidateOne, candidateTwo] = await Candidate.create([
      { name: 'Candidate One', party: 'A', election: electionId, voteCount: 12 },
      { name: 'Candidate Two', party: 'B', election: electionId, voteCount: 8 },
    ]);
    candidateOneId = candidateOne._id.toString();

    await Voter.create([
      {
        aadhaarHash: 'hash-1',
        name: 'Voter One',
        email: 'voter1@example.com',
        mobile: '9990001111',
        identifierRaw: 'ROLL001',
        history: [{
          electionId,
          candidateName: 'Candidate One',
          voteHash: 'votehash-1',
          timestamp: new Date(),
        }],
      },
      {
        aadhaarHash: 'hash-2',
        name: 'Voter Two',
        email: 'voter2@example.com',
        mobile: '9990002222',
        identifierRaw: 'ROLL002',
        history: [{
          electionId,
          candidateName: 'Candidate Two',
          voteHash: 'votehash-2',
          timestamp: new Date(),
        }],
      },
    ]);
  });

  afterAll(async () => {
    await Voter.deleteMany({});
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

  it('returns candidate voters with CSV export', async () => {
    const res = await request(app).get(`/api/election/${electionId}/candidate/${candidateOneId}/voters`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.voters[0].voteHash).toBe('votehash-1');
    expect(res.body.csvUrl).toContain(`/api/election/${electionId}/candidate/${candidateOneId}/voters.csv`);

    const csvRes = await request(app).get(`/api/election/${electionId}/candidate/${candidateOneId}/voters.csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Candidate One');
    expect(csvRes.text).toContain('votehash-1');
  });
});
