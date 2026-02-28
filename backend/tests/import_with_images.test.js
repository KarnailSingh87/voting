import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import JSZip from 'jszip';
import { app } from '../server.js';

const ADMIN_SECRET = process.env.JWT_SECRET || 'dev_secret';

describe('Import with images (ZIP + CSV)', () => {
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

  it('imports a CSV from a ZIP and attaches image as data URI', async () => {
    const token = jwt.sign({ aid: '000000000000000000000000', role: 'super_admin' }, ADMIN_SECRET, { expiresIn: '1h' });

    // simple CSV with headers roll,name,photo and a filename referenced
    const csv = 'roll,name,photo\nR200,Jane Doe,janedoe.jpg\n';

    // tiny 1x1 PNG base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
    const imgBuf = Buffer.from(pngBase64, 'base64');

    const zip = new JSZip();
    zip.file('import.csv', csv);
    zip.file('janedoe.jpg', imgBuf);
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

  // sanity-check: ensure JSZip in this process can read the generated buffer
  const zipVerify = await JSZip.loadAsync(zipBuf);
  expect(Object.keys(zipVerify.files)).toEqual(expect.arrayContaining(['import.csv','janedoe.jpg']));

    const res = await request(app)
      .post('/api/admin/import-students')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zipBuf, { filename: 'import.zip', contentType: 'application/zip' });
    // debug / assert response
    // if failure occurs, printing body helps diagnose parsing errors
    // eslint-disable-next-line no-console
    console.log('IMPORT RESPONSE', res.status, res.body && typeof res.body === 'object' ? JSON.stringify(res.body).slice(0,200) : res.body);
    expect([200, 201]).toContain(res.status);
    expect(res.body && res.body.success).toBe(true);

    // fetch students and assert the imported one exists with photo data URI
  const studentsRes = await request(app).get('/api/admin/students').set('Authorization', `Bearer ${token}`);
  // eslint-disable-next-line no-console
  console.log('STUDENTS RESPONSE', studentsRes.status, studentsRes.body && typeof studentsRes.body === 'object' ? JSON.stringify(studentsRes.body).slice(0,300) : studentsRes.body);
  expect(studentsRes.status).toBe(200);
  expect(studentsRes.body.success).toBe(true);
  const items = studentsRes.body.items || [];
  const found = items.find(i => i.roll && i.roll.toString().toUpperCase() === 'R200');
  expect(found).toBeDefined();
  expect(found.name).toBe('Jane Doe');
  // The list endpoint now returns hasPhoto flag instead of full base64 to keep responses small.
  // Verify the photo exists via the dedicated photo endpoint.
  expect(found.hasPhoto).toBe(true);
  const photoRes = await request(app).get(`/api/admin/students/${encodeURIComponent(found.roll)}/photo`).set('Authorization', `Bearer ${token}`);
  expect(photoRes.status).toBe(200);
  expect(photoRes.headers['content-type']).toMatch(/^image\//);
  }, 20000);
});
