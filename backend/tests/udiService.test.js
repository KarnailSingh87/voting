import { jest } from '@jest/globals';

describe('UDI Service', () => {
  beforeEach(() => {
    jest.resetModules();
    // clear env vars that could affect module initialization
    delete process.env.UDI_URL;
    delete process.env.UDI_API_KEY;
    delete process.env.REDIS_URL;
    delete process.env.UDI_REQ_METHOD;
    delete process.env.UDI_CACHE_TTL;
  });

  test('returns mock name and caches it when UDI_URL not set', async () => {
    const { default: udiService } = await import('../config/udiService.js');
    const aadhaar = '123412341234';
    const r1 = await udiService.lookup(aadhaar);
    expect(r1.success).toBe(true);
    expect(r1.name).toBe('User 1234');
    expect(r1.mock).toBe(true);

    const r2 = await udiService.lookup(aadhaar);
    expect(r2.success).toBe(true);
    // second call should be served from cache
    expect(r2.cached).toBe(true);
    expect(r2.name).toBe(r1.name);
  });

  test('calls external UDI and caches response', async () => {
    // set env before importing module so axiosInstance uses correct config
    process.env.UDI_URL = 'https://udi.test/lookup';
    process.env.UDI_REQ_METHOD = 'POST';

    const nock = (await import('nock')).default;
    const scope = nock('https://udi.test')
      .post('/lookup')
      .reply(200, { data: { fullName: 'Alice Wonderland' } });

    const { default: udiService } = await import('../config/udiService.js');
    const aadhaar = '111122223333';
    const r1 = await udiService.lookup(aadhaar);
    expect(r1.success).toBe(true);
    expect(r1.name).toBe('Alice Wonderland');

    // second call should come from cache
    const r2 = await udiService.lookup(aadhaar);
    expect(r2.success).toBe(true);
    expect(r2.cached).toBe(true);
    expect(r2.name).toBe('Alice Wonderland');

    scope.done();
  });
});
