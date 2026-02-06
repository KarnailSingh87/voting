import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../server.js';
import Admin from '../models/Admin.js';
import Election from '../models/Election.js';

const SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('Admin health and status endpoints', () => {
  let replset;
  let adminToken;

  beforeAll(async () => {
    // start a single-node replset for transactions compatibility
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    await mongoose.connect(uri, { autoIndex: true });

    // create admin user
    const passwordHash = '$2b$10$C6UzMDM.H6dfI/f/6bW3eO6j9K3Q0uYvFhOaWb9qYh1b8V/4ePZfG'; // bcrypt hash placeholder
    const admin = await Admin.create({ username: 'testadmin', email: 'admin@example.com', passwordHash, role: 'super_admin' });
    adminToken = jwt.sign({ aid: admin._id, role: admin.role }, SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await Admin.deleteMany({ username: 'testadmin' });
    await mongoose.disconnect();
    if (replset) await replset.stop();
  });

  test('GET /api/admin/health returns health payload when authenticated', async () => {
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.health).toBeDefined();
    const h = res.body.health;
    expect(typeof h.uptime).toBe('number');
    expect(h.memoryUsage).toBeDefined();
    expect(h.cpuUsage).toBeDefined();
  });

  test('Compatibility start/pause/end endpoints update election status', async () => {
    // create a scheduled election
    const start = new Date(Date.now() + 1000 * 60);
    const end = new Date(Date.now() + 1000 * 60 * 60);
    const election = await Election.create({ title: 'Status Test Election', description: 'Test', startTime: start, endTime: end, status: 'scheduled' });

    // start
    const startRes = await request(app).post(`/api/admin/election/${election._id}/start`).set('Authorization', `Bearer ${adminToken}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.success).toBe(true);
    expect(startRes.body.election.status).toBe('ongoing');

    // pause -> maps to scheduled
    const pauseRes = await request(app).post(`/api/admin/election/${election._id}/pause`).set('Authorization', `Bearer ${adminToken}`);
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.success).toBe(true);
    expect(pauseRes.body.election.status).toBe('scheduled');

    // end
    const endRes = await request(app).post(`/api/admin/election/${election._id}/end`).set('Authorization', `Bearer ${adminToken}`);
    expect(endRes.status).toBe(200);
    expect(endRes.body.success).toBe(true);
    expect(endRes.body.election.status).toBe('ended');

    await Election.deleteOne({ _id: election._id });
  });
});
