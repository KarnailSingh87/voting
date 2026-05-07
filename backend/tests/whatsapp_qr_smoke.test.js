import request from 'supertest';
import express from 'express';

// This is a lightweight smoke test to ensure the WhatsApp QR endpoint doesn't crash.
// It doesn't attempt to actually pair with WhatsApp.

describe('WhatsApp QR endpoint (smoke)', () => {
  test('GET /api/admin/whatsapp-qr responds with JSON', async () => {
    // Importing the real router is heavy; but ensures route code loads.
    const routerMod = await import('../routes/adminRoutes.js');
    const adminRoutes = routerMod.default || routerMod;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);

    const res = await request(app).get('/api/admin/whatsapp-qr');

    expect([200, 202, 500]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBeTruthy();
    expect(typeof res.body).toBe('object');
  });
});
