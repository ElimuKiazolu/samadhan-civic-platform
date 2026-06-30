# Samadhan — Autonomous Civic Resolution Platform

**An autonomous AI civic ombudsman that drives neighborhood issues from *reported* to *resolved*.**

Built for the **Google AI Studio Agentic Hackathon** (Community Hero: Hyperlocal Problem Solver).

🔗 **Live:** https://samadhan-536916009392.asia-south1.run.app
📄 **Submission write-up:** https://docs.google.com/document/d/1P5vlJs_xWpOQESD4zIqIqRYAhUnCSfJnqdQzuEM4y2k/edit?usp=sharing

> **Best viewed on a phone** (or desktop browser in mobile/device mode). Samadhan is mobile-first by design — civic reporting is a phone-first act, so the app targets a ~390px viewport and renders as a centered phone-width column on desktop. It's also an installable PWA.

---

## The problem

Reporting a civic issue isn't the bottleneck — **resolution is.** Complaints vanish into a bureaucratic void with no follow-up or accountability. Samadhan's north star: **"Don't remind. Resolve."**

An autonomous agent, **Setu** ("bridge"), acts as the middleman between citizens and municipal authorities: it classifies and validates reports, routes them to the correct department, drafts and dispatches formal complaints, and — when an authority goes silent past its SLA — **escalates on its own** up a real statutory chain of command.

## What Setu does (the agentic core)

Setu runs a multi-step, tool-using pipeline on every issue, with its reasoning streamed to a live **Case Log**:
classify (Gemini vision) → resolve location → dedup → decision gate

→ route to department → draft complaint → dispatch (recorded)

→ monitor SLA → autonomously escalate up the real 4-tier ladder

Key behaviors:
- **Visible Case Log** — every reasoning step and action streams to the UI; you watch the agent think and act.
- **Decorum gate** — Setu replies in the feed only when it adds value (a question, a status request), and stays silent on noise. Rule-based, not an LLM call (deterministic, fast, cost-free).
- **No-fabrication guard** — replies are templated strictly from real issue fields; Setu cannot invent an authority response or promise a fix.
- **Autonomous SLA escalation** — a stale issue re-escalates up the real Rajkot Municipal Corporation ladder (HOD → Deputy Commissioner → Commissioner/Mayor → State Grievance Appellate Authority) with no human in the loop.

## Architecture
Mobile-first React client  (Vite + React 19 + Tailwind v4)

│  (no API keys client-side)

▼

Express server  (single process, Cloud Run)

│  ├─ Agent orchestrator + typed tool registry

│  ├─ Triage / routing / dispatch / sentinel services

│  └─ Server-side Firebase Admin + Gemini calls

▼

Gemini (vision + reasoning)  ·  Firestore (real-time)

Firebase Auth (role-gated)   ·  Firebase Storage

All intelligence and credentials are server-side. The client's Firebase *web* config is public by design — security is enforced by authorized domains + server-side ID-token verification, not by hiding config.

## Google technologies

- **Gemini** — multimodal vision classification, routing reasoning, complaint drafting (server-side only)
- **Firebase Auth** — Google Sign-In + email/password, role-gating via custom claims
- **Cloud Firestore** — real-time data layer
- **Firebase Storage** — media uploads
- **Cloud Run** — containerized deployment
- **Cloud Build** — CI/CD from GitHub
- **Google AI Studio** — core build environment

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Server | Node.js, Express (TypeScript via `tsx` / esbuild bundle) |
| AI | Gemini (`gemini-2.5-flash-lite`) |
| Data | Cloud Firestore + Firebase Storage |
| Auth | Firebase Auth (custom claims) |
| Deploy | Cloud Run + Cloud Build |
| PWA | Web manifest + service worker |

## Running locally

**Prerequisites:** Node.js 22+, a Firebase project (Firestore + Auth + Storage), a Gemini API key.

1. **Clone & install:**
```bash
   git clone https://github.com/ElimuKiazolu/samadhan-civic-platform.git
   cd samadhan-civic-platform
   npm install
```

2. **Environment:** copy `.env.example` to `.env` and fill in:
   - `VITE_FIREBASE_*` — your Firebase web config (client; baked in at build time)
   - Firebase Admin credentials (server) — service account via `FIREBASE_SERVICE_ACCOUNT_B64` (base64) or a local `serviceAccountKey.json`
   - `FIREBASE_STORAGE_BUCKET`
   - `GEMINI_API_KEY`

3. **Run:**
```bash
   npm run dev
```
   App runs on `http://localhost:3000`.

> If Firebase is unreachable, the server degrades gracefully to a local JSON store — by design (resilience). Restart on a stable connection to reconnect to Firestore.

## Building & deploying

```bash
npm run build          # vite build (client) + esbuild bundle (server → dist/server.cjs)
node dist/server.cjs   # run the production bundle (PORT env, default 8080)
```

**Deploy (Cloud Run via Cloud Build):** pushing to `main` triggers a build. The client Firebase config **must** be passed as Docker build args at build time (Vite bakes `VITE_*` vars into the client bundle during build — runtime env vars don't reach the built client). These are wired via Cloud Build substitution variables (`_VITE_FIREBASE_*`).

## Authority (demo) accounts

Authority role is granted out-of-band (never self-assigned) via an admin script:

```bash
npx tsx scripts/seed-authority.ts <email> <password> <departmentId>
# departmentId: bandhkam | lighting | water | swm | drainage | tp
```

## Project structure
server.ts                 # Express entry (API + serves client)

src/

App.tsx                 # app shell, nav, role-gated views

components/             # ReportFlow, IssueDetailModal, AuthorityDashboard,

#   ImpactDashboard, AlertsView, SignInScreen, YouProfile

context/AuthContext.tsx # Firebase Auth state + authedFetch

services/               # triage, routing, dispatch, sentinel, db, gemini,

#   decorum, auth, storage, seed

lib/                    # validation, image, alerts, metrics, geohash

scripts/                  # seed-authority, set-authority-claim

public/                   # PWA manifest, service worker, icons

## Resilience

Every external call follows: **try → retry (backoff) → fallback → degraded-but-working → never lose the user's input.** Gemini quota errors (429) fail fast to a human-confirmed classification path; Firestore outages fall back to a local store; reports are never lost on a failed external call.

## Scope (honest)

**Built:** auth, photo reporting, Gemini vision classification, geo-routing, real-time feed, corroboration + comments, live Case Log, autonomous SLA escalation, role-gated authority dashboard, public Impact dashboard, alerts, PWA, resilience baseline.

**Roadmap:** real Gmail dispatch (currently recorded with full pipeline, send stubbed), video reporting (photo-only today), live map view, multi-city seeding (architecture is city-agnostic; Rajkot is a fully-implemented reference deployment), predictive insights.

---

*Built solo for the Google AI Studio Agentic Hackathon. Rajkot reference deployment; city-agnostic architecture.*
