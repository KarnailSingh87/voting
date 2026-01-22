const puppeteer = require('puppeteer');

(async () => {
  try {
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:5174/';
    console.log('Using admin URL:', adminUrl);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Go to admin URL
    await page.goto(adminUrl, { waitUntil: 'networkidle2', timeout: 15000 });

    // Fill form
    await page.waitForSelector('#username', { timeout: 5000 });
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin@123456');

    // Listen for console messages to capture frontend errors
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Submit the form and wait for the login XHR response
    await page.click('button[type=submit]');

    // Wait for the backend response to the login call (or timeout)
    let loginResponse = null;
    try {
      loginResponse = await page.waitForResponse(response => response.url().includes('/api/admin/login'), { timeout: 5000 });
      const status = loginResponse.status();
      const body = await loginResponse.text();
      console.log('Login XHR status:', status);
      console.log('Login XHR body:', body);
    } catch (err) {
      console.log('No XHR response for /api/admin/login within timeout');
    }

    // Give React a moment to process and store token
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Read localStorage
    const token = await page.evaluate(() => localStorage.getItem('adminToken'));
    if (token) {
      console.log('SUCCESS: adminToken found.');
      console.log(token);
      await browser.close();
      process.exit(0);
    } else {
      console.log('FAIL: adminToken not found in localStorage.');
      // Also print current URL for diagnosis
      const url = page.url();
      console.log('Current URL:', url);
      // Optionally dump page content snippet
      const html = await page.content();
      console.log('Page length:', html.length);
      await browser.close();
      process.exit(2);
    }
  } catch (err) {
    console.error('ERROR running headless test:', err);
    process.exit(3);
  }
})();
