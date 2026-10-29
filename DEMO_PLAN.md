# Quantum Tech FPV: Client Demo, End-to-End Build Plan
### Full-stack MERN demo for Nihal · Plan only, no code yet

Date: 29 Oct 2026
Built from: *Project Overview* (28 Oct 2026) and *MERN Technical Blueprint* (both in this folder).
The blueprint is the source of truth for models, APIs and folder layout. This plan adds what the demo needs on top: scope, story, UI, data, schedule and demo day.

---

## 0. Assumptions (correct these if wrong)

- The demo is shown live (in person or screen share), about 20 minutes. After it, Nihal gets a link and logins to try it himself.
- Builder: you + Claude, about **15 working days**.
- The demo is built on the blueprint's structure, so it becomes the **Phase 1 code base**, not throwaway work.
- We build the website side too (open question #3), as a **separate plain-HTML website** that looks like the Quantum Tech site. The demo needs it for the "live booking" moment, and it proves the website stores nothing and uses only the public API (see 8.2).

---

## 1. Goal of the demo

Nihal should feel: *"This is my business, already running."* It must be real software: real clicks, real data saving, real live updates. No static mockups.

**Success = by the end of the meeting Nihal has:**
1. Seen a client booking on the website appear in the portal in under 1 second.
2. Seen his own rules enforced (no double booking, pilots can't cancel, Office can't see margin).
3. Got a branded quote PDF, and scanned a QR certificate with his phone.
4. Answered the 8 open questions (the demo turns into the scope meeting).
5. Received a link and 3 logins to explore afterwards.

---

## 2. Demo strategy: wide and believable, deep where it matters

All 12 modules are in the sidebar and none is empty. Depth differs:

| Depth | Meaning | Modules |
|---|---|---|
| **Deep** | Full business logic, real-time, rules enforced | Auth and roles, Dashboard, Pilots, Availability, Slot booking, Website booking + tracking, Client records, Enquiry inbox, Estimation, Certificates (approve → promote), Audit log |
| **Working** | Create, edit, list work; charts from real data; simple logic | Enrollment, Batches (attendance, test marks), Document vault, Fleet, Users and settings |
| **Preview** | Seeded screen, clearly marked "Phase 3" | Revenue reports, WhatsApp sending, online fee payment |

**Rule: no dead buttons.** Every button works, is hidden, or shows a small "Phase 3" badge.

---

## 3. The demo story: 6 "wow moments"

Everything is built to serve these. A feature that helps none of them is low priority.

| # | Moment | What Nihal sees | What it proves |
|---|---|---|---|
| 1 | **Book from the website** | Split screen: website left, Admin dashboard right. Client books a slot → toast "New booking QB-7K3M9X2P from Website" → KPI card ticks up, calendar cell turns booked, audit entry appears, confirmation email lands in a real inbox. | One system, live, no manual work |
| 2 | **Two clients, one slot** | Two browser windows, same slot, press Book together → one confirmed, the other sees "This slot was just taken, please pick another." | Rule enforced by the database |
| 3 | **Pilot's day** | Pilot logs in on a phone → sees only own bookings → Check in → Flight completed → flight hours go up. The client's tracking page (other screen) moves its stepper live. | Roles, mobile, live tracking |
| 4 | **Enquiry → quote → booking** | Custom request on website → Enquiry inbox → Create estimate → rates fill in, live breakdown updates while typing → branded PDF (no margin shown) → Accepted → Create booking blocks 3 days of pilot slots, which turn "booked" on the website. Then switch to Office: margin fields locked. | Sales workflow and hidden margins |
| 5 | **Student → pilot** | Student in batch → test marks entered → Admin approves certificate → certificate PDF with QR → Nihal scans it with his phone → public page says "Valid · Level 2 · valid till …" → the new pilot code now shows on the website booking page. | Training feeds the pilot pool |
| 6 | **Control room** | Admin dashboard with 12 months of data, alert cards (documents expiring, unanswered enquiries, drone service due), audit log with before/after view, Ctrl+K search. | Full visibility and control |

---

## 4. Demo defaults for the open questions

Each one is a **setting**, so we can change it live in the meeting when Nihal answers.

| Open question | Demo default | How we show it |
|---|---|---|
| Slot timings / slots per day | 4 slots: 07:00–10:00, 10:00–13:00, 14:00–17:00, 17:00–19:00 | Settings → Slots; edit live |
| Pilot names on website? | Code + level only (e.g. "P-007 · Level 2") | Toggle "Show pilot names on website" |
| Who builds the booking page | We do (for the demo) | Separate HTML website with its own URL; the booking part can also be dropped into their real site (see 8.2) |
| Email / WhatsApp | Real email; WhatsApp shown as a message preview in Notification log | Notification log screen |
| Office sees margin? | Hidden for Office | Switch role during demo |
| Accept estimate via website link? | No, Office marks Accepted. Stretch goal: accept link | — |
| Partner company students | Office enters them; "Partner company" field | Enrollment form |
| Online fee payment | Office marks paid/unpaid; pay button shows "Phase 3" | Enrollment |

---

## 5. Tech stack

Blueprint choices are kept. Additions for the demo are marked ★ with the reason.

| Part | Choice | Why |
|---|---|---|
| Repo | One folder, npm workspaces: `server/`, `portal/`, `shared/` ★, plus `website/` (plain static files, no build) | One install; code shared between server and portal |
| Backend | Node 20 LTS, Express, Mongoose | Blueprint |
| Database | MongoDB Atlas free tier (M0) | Runs as a replica set by default, so transactions work (estimate → many bookings, student → pilot) |
| Validation | Zod schemas in `shared/`, used by server and React Hook Form ★ | One set of rules for both sides |
| Estimate calculator | Pure function in `shared/` ★ | Live panel updates instantly with no API call per keystroke; server still recalculates on save (blueprint rule). Keep `/estimates/calculate` as well |
| Real-time | Socket.IO ★ | Overview promises "the same second". One library for portal and website; 30 s polling stays as fallback |
| Auth | JWT access token (15 min) + httpOnly refresh cookie, bcrypt | Blueprint |
| Security | helmet, cors, express-rate-limit, express-mongo-sanitize, API key on public routes | Blueprint |
| Portal UI | React + Vite, React Router, TanStack Query, Zustand, Tailwind, **shadcn/ui** ★, lucide icons, Recharts, TanStack Table, Sonner toasts ★, Framer Motion (light use) ★, cmdk (Ctrl+K) ★ | shadcn/ui gives a polished SaaS look fast |
| Website | Plain HTML + one CSS file + vanilla JavaScript; Socket.IO client from CDN; no framework, no build step ★ | Looks and works like a normal company website; any web team can host or copy it (see 8.2) |
| PDF | @react-pdf/renderer on the server ★ (instead of Puppeteer) | Puppeteer needs Chrome and is heavy on cheap hosting; react-pdf builds branded PDFs from JSX |
| Excel | exceljs | Blueprint |
| QR | qrcode | Blueprint |
| Email | Nodemailer + Brevo SMTP (free tier) or Gmail app password; Mailtrap in development | A real email arrives during the demo |
| File uploads | multer → local disk in dev, Cloudinary free tier when deployed ★ | Hosted server disks are wiped on restart |
| Jobs | node-cron | Blueprint |
| IDs | nanoid with a custom alphabet (no 0/O/1/I) | Readable IDs like QB-7K3M9X2P |
| Seed data | @faker-js/faker with `en_IN` locale ★ | Indian names, phone numbers, cities |
| Tests | Jest + Supertest (blueprint), Playwright for the demo script ★ | Proves the 6 moments work before every rehearsal |

---

## 6. Folder structure

```
Quantum tech fpv v2/
  package.json            npm workspaces + scripts: dev, seed, test, demo
  shared/                 zod schemas, enums (stages, statuses), stage machine,
                          estimate calculator, money and date formatters
  server/src/             exactly as blueprint:
    config/ models/ masters/ modules/<x>/ public/ middleware/ services/ jobs/ utils/
    realtime/             ★ Socket.IO setup, rooms, emit helpers
    seed/                 ★ seed script + "Reset demo" logic
  portal/src/             exactly as blueprint:
    app/ api/ components/ features/<x>/ layouts/
    theme/                ★ design tokens
  website/                ★ separate HTML website (static files, no build)
    index.html  book.html  track.html  request.html  verify.html
    config.js             API URL + public API key (only place to change)
    assets/css/site.css
    assets/js/            api.js, realtime.js, book.js, track.js, request.js, verify.js
    assets/img/           logo, drone photos
  e2e/                    ★ Playwright demo-script tests
```

---

## 7. Design system: what makes it look professional

**Overall look: light, clean and professional, for both the portal and the website.** White surfaces on a very light grey background, plenty of space, soft shadows, one accent colour. Think of the Stripe, Razorpay or Linear dashboards. **No dark theme in the demo.**

**Brand link to Quantum Tech:** their live site (quantumtechfpv.com) is dark and "tactical". We keep only the logo, their cyan as the accent colour (made darker so it reads well on white), and their font (Inter). The demo is the light, business-friendly version of the same brand.

| Token | Value | Use |
|---|---|---|
| Page background | `#F8FAFC` | Behind cards (portal); alternating sections (website) |
| Surface | `#FFFFFF` | Cards, tables, sidebar, top bar, dialogs |
| Border | `#E2E8F0` | 1 px borders, table lines, dividers |
| Text | `#0F172A` | Headings and main text |
| Muted text | `#64748B` | Labels, help text, table headers |
| Primary | `#0E7490`, hover `#155E75` | Main buttons, links, active menu item, focus ring. A darker version of their cyan `#00F0FF`, which is unreadable on white; this one passes contrast (5.4 : 1) |
| Primary tint | `#ECFEFF` | Active menu background, selected rows, highlights |
| Bright cyan | `#06B6D4` | Small accents only: "Live" dot, main chart series. Never for text |
| Olive badge | text `#4D5A1F` on `#F4F6EA` | "Certified", "Verified", "Approved" (from their olive `#9AA55A`) |
| Success / Warning / Danger | `#16A34A` / `#D97706` / `#DC2626` | Status badges, alerts |
| Font | Inter | All text; tabular numbers in tables and KPI cards |
| Mono font | JetBrains Mono | Only for IDs and codes: QB-7K3M9X2P, P-007, certificate numbers |
| Corners | 8 px cards and inputs, 6 px buttons, round badges | Modern but not playful |
| Shadow | Very soft on cards (`0 1px 2px rgba(15,23,42,.06)`); stronger only on dialogs and menus | Depth without noise |
| Logo | Dark-on-light version | Their favicon file is named "qtfpv-black", so a dark version likely exists; ask Nihal for it |

**Professional details:**
- Clear text hierarchy: one page title, small grey labels, bold numbers in KPI cards.
- Sentence-case headings and buttons ("Create estimate", not "CREATE ESTIMATE").
- Small uppercase labels in primary colour only as section eyebrows on the website (e.g. "PILOT SERVICES").
- Icons (lucide) at one size and stroke width everywhere.
- Consistent 8 px spacing grid; content width capped on large screens so lines don't stretch.
- Charts use the primary cyan family plus neutral greys, with no rainbow colours.

**Fixed status colours (used everywhere):**
- Booking: Booked = blue, Checked in = amber, Flight completed = violet, Report delivered = green, Cancelled = red
- Estimate: Draft = grey, Sent = blue, Accepted = green, Rejected = red, Expired = muted grey
- Fleet: Free = green, In use = blue, In repair = amber

**Page layout (every module):**
1. Left sidebar: 12 modules in the Overview's order; Audit log, Users, Settings at the bottom for Admin only.
2. Top bar: Ctrl+K search, notification bell, role badge, user menu.
3. Page header: title, breadcrumb, main action button.
4. 4 KPI cards → at most 3 charts → table or calendar (as the Overview says).

**Components:** blueprint list (KpiCard, DataTable, StatusBadge, ConfirmDialog, FileUpload, CalendarGrid, Funnel, Donut, StackedBar, GroupedBar, AlertCard, RoleGuard) plus ★ PageHeader, EmptyState, Skeleton, Drawer, StageStepper, LiveDot (pulsing "Live" marker), MoneyText, DateText.

**Feel:**
- Skeleton loaders, never a blank screen.
- A toast after every action, with a clear message.
- Stage buttons update instantly (optimistic UI) and roll back on error.
- KPI numbers count up briefly when they change live.
- Friendly error messages in plain words (never "Error 409").

**Formatting:** ₹ with Indian grouping (₹1,25,000), dates like "29 Oct 2026", IST everywhere, GST 18% (configurable).

**Responsive:** Admin and Office screens are desktop-first (check at 1366 px and 1920 px). Pilot screens and the website are mobile-first (check at 390 px).

**Website:** a separate plain-HTML site, described in section 8.2. It uses the same brand colours as the portal, but looks like a marketing website, not an app.

**Charts:** the Overview says charts follow "the earlier demo". If you have that demo, put it in this folder so the styles match.

---

## 8. Screens

### 8.1 Portal screens

KPI cards and charts follow the Overview's chart table.

| Module | Route | KPI cards | Charts | Main actions |
|---|---|---|---|---|
| Dashboard (Admin/Office) | `/dashboard` | Bookings today, Active bookings, Free pilots today, New enquiries | Stacked bar: bookings per month by project type; alert cards | Click an alert → opens the item |
| Dashboard (Pilot) | `/dashboard` | My bookings today, Upcoming, Flight hours, Certificate valid till | Small calendar (no big charts) | Check in from the card |
| Slot booking | `/bookings` | Today, Active, Completed this month, Cancelled this month | Funnel (4 stages, % per step); grouped bar received vs completed | Tabs All/Active/Completed/Cancelled; drawer with stage buttons, reschedule, assign pilot, cancel; "New phone booking" |
| Availability | `/availability` | Free pilots today, On leave today, Booked slots today, Utilisation % | Month calendar (free / booked / off colours), pilot filter | Mark day off (blocked if a booking exists) |
| Pilots and certificates | `/pilots`, `/pilots/:id`, `/certificates` | Total pilots, Bookable now, Avg flight hours, Certificates expiring in 30 days | Donut pilots by level; stacked bar flight hours per month by level; donut certificates valid/expiring/expired | Add pilot (Admin), approve certificate, download certificate PDF |
| Client records | `/clients`, `/clients/:id` | Total clients, New this month, Repeat %, Bookings this month | Donut new vs repeat; area chart new clients per month | Client detail with booking history timeline |
| Estimation | `/estimates`, `/estimates/:id` | Sent this month, Acceptance %, Pipeline value, Average quote | Funnel enquiry → sent → accepted → booking; donut by status | Editor with sticky live breakdown, duplicate (Base/Premium), PDF, Excel, send/accept/reject, create booking |
| Enquiry inbox | `/enquiries` | New, In discussion, Converted, Closed | Tabbed table | Convert to estimate or booking |
| Enrollment | `/enrollment` | Entered, Documents verified, Fee paid, Enrolled | Funnel | Add student, upload documents, verify, mark fee |
| Batches | `/batches`, `/batches/:id` | Active batches, Seats filled %, Students in training, Pass rate | — | Attendance tick grid, test marks entry |
| Fleet | `/fleet` | Drones free, In use, In repair, Service due | Donut | Change status; pilot reports a problem |
| Document vault | `/documents` | Total documents, Expiring in 30 days, Expired, Uploaded this month | Alert cards | Upload, download, delete (Admin) |
| Audit log | `/audit-log` | — | Table only | Filter by module, user, date; before/after view |
| Users and settings | `/users`, `/settings` | — | — | Users, rate library, masters, slots, website toggles, **Reset demo data** |

**Login page:** email + password, plus three "Log in as Admin / Office / Pilot" buttons that appear only when `DEMO_MODE=true`. This saves a lot of time while presenting.

### 8.2 Website: separate HTML site

The client side of the demo is a **separate website made of plain HTML, CSS and JavaScript**. It looks like the Quantum Tech company website and runs on its own URL, next to the portal.

**Why plain HTML instead of React:**
- In the split-screen moment, Nihal clearly sees **two separate systems** (his website and our portal) talking only through the API.
- It proves the Overview's rule: the website stores nothing. Every pilot, slot and booking comes live from the portal API.
- Their real website runs on **WordPress + Elementor** (Blocksy theme, WooCommerce store). A plain HTML/JS booking widget can be pasted into an Elementor "HTML" block, which answers open question #3.
- No build step: open the files directly or host them on any static host.

**Pages:**

| File | What it shows | Public API calls |
|---|---|---|
| `index.html` | A clean, light company home page. **Header** (white, sticky): their logo, their menu (Home, Portfolio, Defence Applications, Store, Technology, Industries, Contact) plus new **Training** and **Track booking** items, and a primary **"Book a pilot"** button. **Hero**: headline (e.g. "Certified drone pilots, booked in minutes"), short line, two buttons ("Book a pilot", "Send a custom request"), a large drone photo, and live stat chips ("● 9 pilots available today", "Next free slot 10:00"). **Sections:** how it works (3 steps), services (project type cards), why Quantum Tech (certified pilots, made-in-India platforms, their real stats such as "5+ defence contracts"), training academy (course → test → QR-verified certificate), track your booking, contact strip. **Footer** with their real address, phone, email and quick links | `GET /public/pilots` (stat chips, project types) |
| `book.html` | 4-step booking wizard: (1) project type + city, (2) date, (3) **live slot grid**: one row per pilot (code, level, skills), one column per slot; free = clickable, booked = grey; updates live, (4) details form (name, company, phone, email, notes). Then a confirmation panel: booking ID with copy button, tracking link, QR code to the tracking page | `GET /public/pilots`, `GET /public/availability`, `POST /public/bookings` |
| `track.html` | Booking ID + token form (or opened straight from the tracking link). Shows a stepper, Booked → Pilot checked in → Flight completed → Report delivered (or Cancelled), with date, slot, pilot code and project. **Moves live.** | `GET /public/bookings/:id?token=` |
| `request.html` | Custom request form for work that doesn't fit a slot (many days, big area, special drone) → shows a reference number | `POST /public/enquiries` |
| `verify.html` | Opened by scanning the certificate QR: pilot name, level, valid or expired, expiry date | `GET /public/certificates/verify/:qrToken` (the one extra call) |

**JavaScript (vanilla, no framework):**
- `config.js`: API URL and public API key. The only file to change when hosting moves.
- `api.js`: one `fetch` helper. It adds the API key header and turns error codes into friendly messages (`SLOT_TAKEN` → "This slot was just taken. Please pick another.").
- `realtime.js`: connects to the public Socket.IO channel. When "slots changed for date X" arrives, it reloads availability. On the tracking page it joins that booking's room. If the socket drops, it falls back to refreshing every 20 seconds.
- One script per page: `book.js`, `track.js`, `request.js`, `verify.js`.
- Simple checks in the browser (required fields, email, 10-digit Indian mobile). The server checks everything again, as the blueprint says.

**When the slot is taken (moment 2):** the API returns 409. The clicked cell shakes and turns grey, the friendly message shows, and the grid reloads. The client stays on step 3 and the details they typed are kept.

**Look and feel: light and professional (tokens in section 7):**
- White and light-grey sections, big clear headings, generous spacing, soft card shadows, one cyan accent. It should look like a modern, trustworthy service company.
- Brand link to their real site: same logo, same menu, same contact details, cyan accent. But it is light, not dark.
- Their site today is about defence products; pilot booking and training don't appear on it. The demo shows how these new services would look as part of his business.
- Menu items we don't rebuild (Portfolio, Defence Applications, Store, Technology, Industries) open the matching page on the real site in a new tab. No dead links.
- Images: their own logo and photos (ask Nihal for daylight photos of pilots, training and jobs; their current images are dark product renders). Until then, neutral stock drone photos from Unsplash/Pexels without other brands' logos. No made-up testimonials or client logos.
- Booking screens are simple for a non-technical client: big tap targets and clear slot states. Free = white card with cyan border, booked = grey and crossed out, selected = solid cyan with a tick.
- Works well on a phone (sticky menu, one-column wizard, sticky "Continue" button at the bottom).
- The widget's colours are CSS variables, so the same widget can later match their real (dark) WordPress site if they want it there.

**Where it runs:**
- Local: its own port (e.g. `http://localhost:5500`), next to the portal (`:5173`) and the API (`:4000`).
- Online: a static host with its own URL (Netlify or Vercel). The API's CORS allows only this URL and the portal.
- Because it copies their brand on a public URL: add `noindex` (so Google never shows it instead of their real site), a small "Demo preview" tag in the footer, and share the link only with Nihal.
- Footer shows their real contact details, as their site does. Demo emails go only to our test inbox, never to their real addresses.

**Build the booking wizard as a widget from the start.** All booking code renders inside one `<div id="qt-booking">`, and its CSS classes use a `qtb-` prefix so they don't clash with Elementor's. `book.html` is just their header and footer plus that widget. The paste-into-WordPress version then comes almost for free: one `<script>` tag plus one `<div>` in an Elementor HTML block. If time allows, show it working on a copy of an Elementor page as the answer to "who builds the booking page".

---

## 9. Backend plan

### 9.1 Data model
Use the blueprint's collections and critical indexes exactly. Demo additions:

- `Booking.stageHistory[{ stage, at, by }]`: powers the tracking timeline and funnel.
- `Booking.flightHours`: added to the pilot on "Flight completed".
- `Notification` collection (in-app bell): user or role, title, link, read.
- Settings: `showPilotNamesOnWebsite`, `demoMode`.
- Indexes are created at startup and checked by a test, because the double-booking rule depends on them.

### 9.2 Business rules: where each one lives and how we prove it

| Rule (from Overview) | Enforced in | Proof in the demo |
|---|---|---|
| One slot, one booking | Unique partial index `{pilotId, date, slotId}` where stage ≠ cancelled; duplicate key error → `409 SLOT_TAKEN` | Moment 2 + automated 20-parallel-bookings test |
| Only certified, available pilots are bookable | Booking service + availability query | The seeded pilot with an expired certificate never appears on the website |
| Bookings confirm instantly | No approval step | Moment 1 |
| Pilot can't mark a day off if booked | Availability service | Try it as the pilot → "You have a booking on this day. Please ask Office." |
| Pilots can't cancel | RBAC on route + no button | Pilot drawer has no Cancel |
| Stage order | Stage machine in `shared/` | Only the next valid stage button is shown |
| Flight hours added once | Conditional update (only from Checked in) then `$inc` | Pilot hours go up once, never twice |
| Student → pilot on approval | Certificate service, in a transaction: create Pilot + User, mark student promoted | Moment 5 |
| Long random booking IDs + token | nanoid | Tracking needs ID + token |
| Client auto-create / merge by email or phone | `clientService.findOrCreate` | Book twice with the same phone → one client, 2 bookings |
| Document and certificate expiry reminders | Daily cron + dashboard alert cards | Alert cards on dashboard |
| Estimate expiry | Daily cron | Seeded expired estimates |
| Audit everything, append-only | Audit middleware; no update/delete routes; model hooks block edits | Audit log page |

### 9.3 Real-time events (Socket.IO)

**Rooms:** `role:admin`, `role:office`, `pilot:<pilotId>`, `track:<bookingId>` (joined only after the server checks the token), `public:availability`.

| Event | When | Who receives it | What the screen does |
|---|---|---|---|
| `booking.created` | Any new booking | admin, office, that pilot, public | Toast, KPIs refresh, row slides in, calendar cell turns booked, website slot greys out |
| `booking.stageChanged` | Stage change | admin, office, that pilot, track room | Stepper moves, funnel updates |
| `booking.cancelled` | Cancel | admin, office, that pilot, public | Slot is free again on the website |
| `availability.changed` | Day off added/removed | admin, office, public | Calendar and website refresh |
| `enquiry.created` | Website custom request | admin, office | Bell + inbox badge |
| `notification.new` | Any notification | that user | Bell count |

**Pattern:** services emit an event → the front end just invalidates the matching TanStack Query cache and refetches. Simple and hard to get wrong. The public website only receives "slots changed for date X", never personal data.

### 9.4 API

- **Private API:** the blueprint's section 6 endpoints for every Deep and Working module.
- **Public API:** the blueprint's 5 calls. To keep the "5 calls" promise, `GET /public/pilots` also returns the dropdown lists the website needs (project types, cities, slots).
- **One addition to confirm with Nihal:** `GET /public/certificates/verify/:qrToken`, which the QR code needs. It returns only name, level, valid/expired and expiry date.
- **API key:** in the demo, the key sits in the website's `config.js` (visible in the browser), with CORS locked to the website URL. For production, add the server-side proxy the blueprint recommends.
- **Errors:** one shape everywhere, `{ success, code, message, details }`.

### 9.5 Tests (only what protects the demo)
- **Concurrency:** 20 simultaneous bookings for one slot → exactly 1 succeeds (blueprint).
- **Estimate calculator:** 3 examples checked by hand in Excel (ideally one is a real past quote from Nihal).
- **Stage machine:** valid and invalid moves.
- **RBAC smoke test:** pilot gets 403 on `/clients`; Office can't change margin.
- **Playwright demo script:** runs moments 1–5 automatically. Run it before every rehearsal.

---

## 10. Seed data: this makes or breaks the demo

Empty charts kill interest. The seed creates **12 months of history**, and every date is relative to *today*, so the demo never looks stale.

| Data | Amount | Notes |
|---|---|---|
| Users | 1 Admin (Nihal), 2 Office, 1 login per pilot | Simple demo passwords |
| Pilots | 16 (Level 1: 6, Level 2: 5, Level 3: 3, Expert: 2) | Pune-centred, like the company: Pune, Pimpri-Chinchwad, Mumbai, Nashik, Nagpur, Chhatrapati Sambhajinagar, Kolhapur; 1 with an expired certificate; 2 on leave today |
| Masters | Project types (Survey, Mapping, Inspection, Event shoot, Tethered surveillance, Agriculture spraying, Real estate, Construction monitoring, Solar inspection), cities, 4 slots, pilot levels, drone types, travel modes, deliverables, document types, courses | Realistic ₹ rates in the rate library |
| Bookings | ~420 over 12 months, more in Oct–Mar, ~8% cancelled; **today**: 6 bookings in different stages; next 14 days: ~30 upcoming | Charts and funnel look real |
| Clients | 60 companies (construction, solar, real estate, events, government/PSU), ~35% repeat | Booking histories |
| Enquiries | 25: 6 New, 5 In discussion, 9 Converted, 5 Closed | Inbox looks busy |
| Estimates | 30 across all statuses, including one Base + Premium pair | Pipeline value chart |
| Training | 3 batches (completed, running, upcoming), 45 students, attendance for the running batch, test results, **2 certificates pending approval**; one batch of students sent by a partner organisation | Ready for moment 5; shows the "partner company" open question |
| Fleet | 14 drones, 40 batteries; 2 in repair, 1 service due this week | Alert card |
| Documents | 40 (drone permissions, insurance, client NOCs); 3 expiring in 30 days, 1 expired | Alert cards; placeholder PDFs |
| Audit log | ~2,000 entries generated for the seeded actions | Audit page looks lived-in |

**Reset demo:** `npm run seed` and a "Reset demo data" button in Admin settings. It must finish in under 30 seconds. Run it before every rehearsal and right before the meeting.

---

## 11. Build plan (day by day)

About 15 working days. Every day ends with something you can click.

| Day | Work | Done when |
|---|---|---|
| 1 | Workspaces, ESLint/Prettier, Atlas cluster, `.env` files, Express API, portal (Vite + Tailwind + shadcn/ui), design tokens, portal shell (sidebar, top bar, empty pages), `website/` folder served on its own port | `npm run dev` starts API, portal and website; shell already looks final |
| 2 | Backend core: config, error shape, all models + indexes, generic masters CRUD, counters | Masters CRUD works from Postman |
| 3 | Auth, RBAC, audit middleware, users; login page with quick-login; role-based sidebar | 3 roles see 3 different sidebars |
| 4 | Seed script v1: masters, users, pilots, clients, booking history | Database looks real |
| 5 | Booking service (create, stage machine, cancel, reschedule, assign pilot), availability service, client find-or-create; concurrency test | 20 → 1 test passes |
| 6 | Public API (5 calls), Socket.IO rooms and events, confirmation email | A booking via curl sends an email and a socket event |
| 7 | HTML website: `index.html` (full home page), `book.html` (wizard + live slot grid + confirmation), `track.html` (live stepper), `request.html` | Moments 1 and 2 work from the website side |
| 8 | Portal: Bookings (tabs, drawer, stage buttons, funnel, charts) and Availability calendar | Moments 1 and 3 work fully |
| 9 | Portal: role-aware Dashboard, Pilots list/detail, Clients list/detail | Moment 6 mostly works |
| 10 | Enquiry inbox; Estimation editor with sticky live breakdown (shared calculator) | Numbers match the Excel examples |
| 11 | Estimate PDF and Excel, send/accept/reject, create-booking transaction, expiry cron | Moment 4 works |
| 12 | Enrollment, Batches, attendance, test marks, certificate approval → promotion, certificate PDF with QR, public verify page | Moment 5 works |
| 13 | Fleet, Document vault (uploads, expiry alerts), Audit log page, Users and Settings (rate library, slots, toggles, Reset demo) | All 12 modules clickable |
| 14 | Polish: empty/loading/error states, Ctrl+K, design consistency pass (spacing, icons, colours), notification bell, mobile pilot view, full seed v2, "Phase 3" badges, Playwright demo test | No console errors; phone check at 390 px passes |
| 15 | Deploy, test from another network, 2 full rehearsals, record a backup video, write the 1-page handout | Section 16 checklist all green |

**If you fall behind, cut in this order:** (1) Fleet becomes seeded read-only, (2) Excel export, (3) document upload (seeded documents only), (4) KPI count-up and other small animations, (5) Ctrl+K. **Never cut moments 1–4.**

---

## 12. Demo-day runbook

### One hour before
- Click "Reset demo data".
- Open the API URL once so the server is awake.
- Prepare tabs: (1) website, (2) portal as Admin, (3) portal as Office in an incognito window, (4) a second website window for the double booking, (5) the email inbox. Pilot logged in on a phone.
- Phone charged, with internet; camera ready to scan the QR code.
- Backup: the app running locally, plus the recorded video.

### Script (~20 minutes)

| Time | Step | Moment |
|---|---|---|
| 0–2 min | Nihal's problem in his own words; one architecture picture (website → API → portal) | — |
| 2–6 | Book from the website, split screen | 1 |
| 6–8 | Two clients, one slot | 2 |
| 8–11 | Pilot on phone → client's tracking page | 3 |
| 11–15 | Enquiry → estimate → PDF → booking; switch to Office view | 4 |
| 15–18 | Student → certificate → QR scan → new pilot on the website | 5 |
| 18–20 | Admin control room: dashboard, alerts, audit log, settings | 6 |
| 20+ | Go through the 8 open questions; flip the settings toggles live as he answers | — |

### After the meeting
- Send the links, the 3 logins, a 1-page summary of Phase 1/2/3, and his answers to the open questions.
- Keep the demo online for about 2 weeks. The audit log shows which screens were used, which helps in the follow-up call.

---

## 13. Hosting and accounts

| Need | Service | Note |
|---|---|---|
| Database | MongoDB Atlas M0 | Free; replica set included |
| API + Socket.IO | Render or Railway | Free tiers sleep when idle (first request is slow). Use the cheapest always-on tier during demo week. Vercel can't host a Socket.IO server, which is why the API goes here |
| Portal | Vercel | Free |
| Website (HTML) | Netlify or Vercel, on its **own URL** | Free; a separate URL makes the "two systems, one API" point clear |
| Email | Brevo SMTP | Free tier is enough |
| Files | Cloudinary | Free tier |
| Domain | Only with Nihal's permission (e.g. a demo subdomain); otherwise the default Vercel/Render URLs | Optional |

**Local backup:** transactions need a replica set, so locally run MongoDB as a single-node replica set (Docker or `mongod --replSet rs0`).

---

## 14. Risks and how we handle them

| Risk | Plan |
|---|---|
| Server asleep when the demo starts | Always-on tier, warm-up step, local backup |
| Internet fails | Local run + recorded video |
| Email goes to spam or arrives late | Verified sender; show the Notification log in the portal as proof |
| Too much work for 15 days | Use the cut list in section 11 |
| Estimate maths wrong in front of the client | Calculator tests with Excel-checked examples; copy a real past quote from Nihal |
| Data looks fake | Indian names, real cities, realistic ₹ rates, dates relative to today |
| Demo becomes throwaway code | Follows the blueprint structure, so it becomes the Phase 1 base |

---

## 15. What to get from Nihal (helpful, not blocking)

- Original logo file (SVG or large PNG), in the **dark-on-light** version for the white design.
- Daylight photos of pilots, training sessions and jobs. Their website mostly shows dark defence product renders, which don't suit the light design.
- OK on the menu labels for the new items ("Book a Pilot", "Training", "Track").
- One real past quote (sample estimate + calculator test).
- Real rates: pilot per level, drone per type, per km, hotel, food.
- The certificate design they use today.
- The "earlier demo" the Overview mentions (for chart styles).

---

## 16. Definition of done

- [ ] All 6 moments run end to end, 3 times in a row, with no problem.
- [ ] All 12 modules open, no empty screens, no dead buttons.
- [ ] No console errors and no unhandled API errors.
- [ ] Concurrency test, calculator tests and Playwright demo test pass.
- [ ] Works on a 1366 px laptop, a 1920 px monitor and a 390 px phone (pilot screens + website).
- [ ] Deployed links and logins tested from a different network.
- [ ] Reset demo finishes in under 30 seconds.
- [ ] Backup video recorded.

---

## 17. Decisions needed before coding starts

1. **Demo date.** Decides whether 15 working days fits, or whether we cut.
2. **Online or local only?** Recommended: online, so Nihal can try it after the meeting.
3. **Brand assets.** ✅ Website checked (quantumtechfpv.com). ✅ Design decided: light and professional, with their logo, menu and cyan accent (sections 7 and 8.2). Still useful: the dark-on-light logo file, daylight photos, and the earlier demo if you have it.
4. **Changes from the blueprint.** OK to use Socket.IO, the shared calculator, react-pdf instead of Puppeteer, and the extra certificate-verify public call?
