# Quantum Tech FPV: Operations Platform demo

A working MERN demo: a plain-HTML client website with live pilot booking, and an operations portal for Admin, Office and Pilot users. A booking made on the website shows up in the portal in well under a second.

| Part | Folder | Port |
|---|---|---|
| API (Express, MongoDB, Socket.IO) | `server/` | 4000 |
| Operations portal (React, Vite) | `portal/` | 5173 |
| Client website (plain HTML/JS) | `website/` | 5500 |
| Shared rules (estimate calculator, stages) | `shared/` | n/a |

## Run it

1. `npm install` (once, at the repo root).
2. Create `server/.env` (never commit it):
   ```
   PORT=4000
   MONGODB_URI=<your MongoDB Atlas connection string, replica set>
   JWT_ACCESS_SECRET=<random string>
   JWT_REFRESH_SECRET=<another random string>
   PUBLIC_API_KEY=qt_demo_public_key_123
   PORTAL_ORIGIN=http://localhost:5173
   WEBSITE_ORIGIN=http://localhost:5500
   DEMO_MODE=true
   ```
3. `npm run seed` loads the demo data (about 15 seconds).
4. In three terminals: `npm run dev:server`, `npm run dev:portal`, `npm run dev:website`.

Open the website at http://localhost:5500 and the portal at http://localhost:5173.

## Demo logins

| Role | Email | Password |
|---|---|---|
| Admin | admin@quantumtechfpv.com | Admin@123 |
| Office | office@quantumtechfpv.com | Office@123 |
| Pilot | pilot1@quantumtechfpv.com | Pilot@123 |

The login page also has one-click demo buttons. In the portal, Settings, Demo, "Reset demo data" restores the starting data in about 15 seconds. Do this before every presentation and after running the tests.

## Tests

With the API running: `cd server && node --test test/`. They cover the 20-way booking race, the public-API privacy rules, tracking tokens and role permissions. They leave a few cancelled "Test Co" bookings behind; use Reset demo data to clear them.

## Rules enforced on the server

- One pilot, one date, one slot, one booking (unique index; a second attempt gets `SLOT_TAKEN`).
- Only certified, available pilots can be booked.
- Office never sees or changes overhead, contingency or margin; the client PDF hides them too.
- The public API returns no pilot names or phone numbers unless Admin switches that on.
- Approving a certificate creates the pilot account in one database transaction.
- The audit log is append-only.

See `DEMO_PLAN.md` for the demo script.
