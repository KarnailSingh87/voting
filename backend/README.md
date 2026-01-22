# Aadhaar-Based Voting System Backend

Secure, real-time voting backend with Aadhaar verification and OTP-based 2FA.

## Features

- **Aadhaar + OTP Verification**: Mock Aadhaar hashing (SHA-256) with in-memory OTP service.
- **Atomic Vote Casting**: Transactional vote submission with duplicate-vote prevention.
- **Real-Time Updates**: Socket.io events for live vote counts and election status changes.
- **Admin Management**: Create elections, add candidates, update election lifecycle (scheduled → ongoing → ended).
- **Security**: JWT authentication, bcrypt password hashing (admin), helmet & CORS protection.

## Setup

### Install dependencies

```bash
npm install
```

### Environment Variables

Create `.env`:

```env
MONGO_URI=mongodb://localhost:27017/aadhaar_voting
JWT_SECRET=your_secure_random_secret_256_bit
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
PORT=5005
```

### Seed Super Admin (Dev Only)

```bash
curl -X POST http://localhost:5005/api/admin/seed-super \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","email":"admin@example.com","password":"SecurePass123!"}'
```

### Run Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Routes

### Voter Authentication

#### Request OTP
**POST** `/api/voter/request-otp`

Body:
```json
{
  "aadhaar": "123412341234",
  "name": "John Doe",
  "mobile": "9876543210"
}
```

Response:
```json
{
  "message": "OTP sent (mock)",
  "aadhaarHash": "abc123..."
}
```

OTP logged to console for development.

#### Verify OTP & Get Token
**POST** `/api/voter/verify-otp`

Body:
```json
{
  "aadhaar": "123412341234",
  "otp": "123456"
}
```

Response:
```json
{
  "token": "jwt_token",
  "voter": {
    "id": "...",
    "name": "John Doe",
    "hasVoted": false
  }
}
```

### Vote Casting

**POST** `/api/vote/cast`

Headers:
```
Authorization: Bearer <voter_jwt_token>
```

Body:
```json
{
  "candidateId": "candidate_mongo_id"
}
```

Response:
```json
{
  "message": "Vote cast",
  "candidateId": "...",
  "voteCount": 42
}
```

Socket event emitted: `vote_cast` with `{ candidateId, voteCount }`.

### Admin

#### Admin Login
**POST** `/api/admin/login`

Body:
```json
{
  "username": "superadmin",
  "password": "SecurePass123!"
}
```

Response:
```json
{
  "token": "jwt_token",
  "admin": { "id": "...", "role": "super_admin", "username": "superadmin" }
}
```

#### Create Election (Protected)
**POST** `/api/admin/election`

Headers:
```
Authorization: Bearer <admin_jwt_token>
```

Body:
```json
{
  "title": "General Election 2025",
  "description": "National level voting",
  "startTime": "2025-12-01T00:00:00Z",
  "endTime": "2025-12-10T23:59:59Z"
}
```

#### Create Candidate (Protected)
**POST** `/api/admin/candidate`

Headers:
```
Authorization: Bearer <admin_jwt_token>
```

Body:
```json
{
  "electionId": "mongo_election_id",
  "name": "Candidate Name",
  "party": "Party XYZ",
  "manifesto": "Detailed policies"
}
```

#### Update Election Status (Protected)
**PATCH** `/api/admin/election/:id/status`

Headers:
```
Authorization: Bearer <admin_jwt_token>
```

Body:
```json
{
  "status": "ongoing"
}
```

Allowed statuses: `scheduled`, `ongoing`, `ended`.

Socket event emitted: `election_status` with `{ id, status }`.

#### Admin Dashboard Stats (Protected)
**GET** `/api/admin/dashboard`

Headers:
```
Authorization: Bearer <admin_jwt_token>
```

Response:
```json
{
  "success": true,
  "dashboard": {
    "admin": { "username": "...", "role": "..." },
    "statistics": {
      "totalElections": 5,
      "activeElections": 1,
      "upcomingElections": 2,
      "completedElections": 2
    },
    "recentActivity": []
  }
}
```

### Public

#### List Elections
**GET** `/api/election`

Response:
```json
{
  "success": true,
  "elections": [
    {
      "_id": "...",
      "title": "Election 2025",
      "status": "active",
      "startDate": "...",
      "endDate": "...",
      "candidates": [
        { "id": "...", "name": "Candidate A", "party": "Party A", "voteCount": 100 }
      ]
    }
  ]
}
```

## Socket.io Events

Clients connect to `http://localhost:5005` (or configured SOCKET_URL).

### Events Emitted by Server

- `vote_cast`: `{ candidateId: string, voteCount: number }`
- `election_status`: `{ id: string, status: 'scheduled'|'ongoing'|'ended' }`

## Testing

Run unit tests:
```bash
npm test
```

Tests cover:
- OTP request and verification
- Mock OTP deterministic behavior

## Security Notes

- **Aadhaar Hashing**: Aadhaar numbers are SHA-256 hashed before storage; never stored plain.
- **OTP Expiration**: OTP valid for 5 minutes; in-memory storage (dev only; use Redis for production).
- **JWT Secrets**: Always use strong secrets in production; rotate regularly.
- **Atomic Transactions**: `hasVoted` flag and `voteCount` increment are wrapped in Mongo transactions to prevent race conditions.
- **CORS**: Configure `CORS_ORIGIN` to allow only trusted frontend domains.
- **Helmet**: Default security headers applied.

## Future Enhancements

- Integrate Twilio or Firebase for real OTP delivery.
- Use Redis or database for OTP storage.
- Add rate limiting on OTP requests.
- Implement admin 2FA for critical operations.
- Detailed audit logs for all vote events.
- End-to-end encryption for vote payloads.

## License

Proprietary - Educational Project
