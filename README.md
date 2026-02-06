# Voting (University Online Voting System)

Monorepo containing the backend API, a public voter frontend, and an admin frontend.

Overview
- Backend: Express + Mongoose (MongoDB). Handles student lookup, OTP, Voting, and admin imports.
- Frontend: Vite + React for public voter flows (login, OTP, ballot, dashboard).
- Admin: Vite + React admin UI for importing students, managing elections and monitoring.

Quick start (development)
1. Backend
```bash
cd backend
npm install
npm run dev
```

2. Frontend (voter)
```bash
cd frontend
npm install
npm run dev
```

3. Admin UI
```bash
cd admin
npm install
npx vite --port 5173
```

Testing
- Backend: `cd backend && npm test` (Jest, mongodb-memory-server)
- Frontend: `cd frontend && npm test` (Vitest)
- Admin E2E: `cd admin && npx cypress open` or `npx cypress run` (requires backend + admin running)

Environment variables
- `MONGO_URI` — MongoDB connection (default: mongodb://localhost:27017/aadhaar_Voting)
- `PORT` — backend port (default 5005)
- SMTP/Twilio (optional) for real OTP delivery: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

CI
- A GitHub Actions workflow is included at `.github/workflows/ci.yml` to run backend tests, frontend/admin lint + build, and an E2E job that starts services and runs Cypress.

Notes
- OTP delivery defaults to Ethereal/mock in non-production environments.
- OTP store is in-memory (for dev); consider Redis for production.

If anything looks out of place in the repository layout or you want a different README format, tell me and I will update it.
