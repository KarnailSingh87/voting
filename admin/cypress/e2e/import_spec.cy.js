/* eslint-env mocha */
/* global expect */
describe('Admin import flow (E2E)', () => {
  const backend = Cypress.env('BACKEND_URL') || 'http://localhost:5005';
  const username = Cypress.env('E2E_ADMIN_USER') || 'e2e-admin';
  const email = Cypress.env('E2E_ADMIN_EMAIL') || 'e2e-admin@example.com';
  const password = Cypress.env('E2E_ADMIN_PASSWORD') || 'E2E@123456';


  it('creates/ensures admin, logs in, creates election, updates import settings, imports file', () => {
    // Seed or create super admin via backend helper endpoint
    cy.request({ method: 'POST', url: `${backend}/api/admin/seed-super`, body: { username, email, password }, failOnStatusCode: false }).then(() => {
      // Login
      cy.request('POST', `${backend}/api/admin/login`, { username, password }).then((loginRes) => {
        expect(loginRes.status).to.be.oneOf([200,201]);
        const token = loginRes.body.token;
        // create an election
        const start = new Date(Date.now() - 3600 * 1000).toISOString();
        const end = new Date(Date.now() + 3600 * 1000).toISOString();
        cy.request({ method: 'POST', url: `${backend}/api/admin/election`, body: { title: 'Cypress E2E Election', description: 'created by cypress', startDate: start, endDate: end, importConcepts: { rollField: 'roll', nameField: 'name', emailField: 'email', mobileField: 'mobile' } }, headers: { Authorization: `Bearer ${token}` } }).then((createRes) => {
          expect(createRes.status).to.equal(200);
          // Visit admin UI and set token in localStorage
          cy.visit('/');
          cy.window().then((win) => {
            win.localStorage.setItem('adminToken', token);
          });
          // go to elections page
          cy.visit('/elections');
          // find created election in list and click View
          cy.contains('Cypress E2E Election').should('exist').parents('li').within(() => {
            cy.contains('View').click();
          });
          // wait for detail to load and open import settings reliably
          cy.contains('Import Settings').scrollIntoView();
          cy.get('[data-testid="toggle-import-settings"]').click();
          // Click Save Import Settings
          cy.get('[data-testid="save-import-settings"]').click();

          // Click Import students into this election (use testid)
          cy.get('[data-testid="import-to-election"]').click();

          // On import page, upload fixture CSV and run Preview + Import
          cy.get('[data-testid="file-input"]').attachFile('students.csv');
          cy.get('[data-testid="preview-btn"]').click();
          // Wait for preview and then Import
          cy.get('[data-testid="import-btn"]').click();
          // Expect a toast or success message
          cy.contains(/Imported|Imported:/, { timeout: 10000 }).should('exist');
        });
      });
    });
  });
});
