# DBS Zentrum

A premium, fully client-side playground with three independent features:

1. **Random Boxes** — a gift/challenge reveal game with fair no-repeat participant cycles.
2. **Voting Rooms** — single or multiple choice polls with deadlines, rankings and tie handling.
3. **Quiz Rooms** — classroom quizzes where the teacher hosts on one device and every student
   answers on their own device, with the answer key hidden until everyone finishes.

Everything runs in the browser. There is **no database, no backend and no account system** — all data is
persisted in `localStorage`. Quiz sessions additionally use **PeerJS** (peer-to-peer WebRTC with free
public signaling) so students can join the teacher's device over the network.

---

## Tech stack

- **Next.js 15** (App Router) with **static export** (`output: "export"`)
- **TypeScript** + **React 19**
- **Tailwind CSS**
- **lucide-react** icons
- **PeerJS 1.5** — WebRTC data channels + free public signaling for cross-device classroom quiz sessions
- Browser `localStorage` for persistence, `sessionStorage` for temporary session info, and React state for the UI

No PostgreSQL / MySQL / SQLite / MongoDB / Prisma / Supabase / Firebase, no Laravel, no paid APIs — and no
custom server: PeerJS uses its free public broker for the initial handshake only; the quiz data itself
travels directly between devices.

---

## Getting started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
# open http://localhost:3000
```

### Production build (static export)

```bash
npm run build
# static files are written to ./out
```

### Other checks

```bash
npm run typecheck   # TypeScript, no emit
npm run lint        # ESLint (next/core-web-vitals)
npm test            # core logic tests + classroom session protocol tests
npm run test:e2e    # Playwright end-to-end: teacher + 2 students over WebRTC
                    # (needs the dev server running + internet for PeerJS signaling)
```

To preview the exported static site locally:

```bash
npx serve out
# or: npx http-server out
```

---

## Deployment (free)

The app is configured for **static export**, so it works on any static host — no server required.

| Host | How |
| --- | --- |
| **Vercel** | Import the repo. It auto-detects Next.js. Static export works out of the box. |
| **Netlify** | Build command `npm run build`, publish directory `out`. |
| **Cloudflare Pages** | Build command `npm run build`, output directory `out`. |
| **GitHub Pages** | Run `npm run build` and publish the `out/` folder (add a `.nojekyll` file). |
| **Any static server** | Upload the contents of `out/`. |

Because `trailingSlash: true` is enabled, all routes (including `/votes/room/` and `/quiz/room/`) resolve
cleanly on static hosts.

> **Why not `/votes/[code]`?** Dynamic URL segments require Next.js to know every path at build time. Room
> codes are created at runtime in the browser, so dynamic segments cannot be statically exported. Rooms are
> therefore opened via a query parameter (`/votes/room/?code=ABC123`), which keeps the entire app statically
> exportable and free to host anywhere. The legacy `/voting/*` URLs redirect client-side to `/votes/*`.

---

## LocalStorage architecture

Storage utilities live in `lib/storage.ts`. Data is written under **versioned keys**:

| Key | Contents |
| --- | --- |
| `dbs_meta_v1` | Schema version + last-written timestamp |
| `dbs_app_settings_v1` | Reserved app settings |
| `dbs_random_boxes_configs_v1` | Saved box game configurations |
| `dbs_random_boxes_games_v1` | Box game progress, keyed by config id |
| `dbs_voting_rooms_v1` | Voting rooms **and** their ballots |
| `dbs_quiz_rooms_v1` | Quiz room definitions |
| `dbs_quiz_sessions_v1` | Live quiz sessions: players + responses, keyed by code |
| `dbs_quiz_history_v1` | Saved completed-quiz results, keyed by quiz code (newest first) |

Design guarantees:

- **SSR-safe** — `localStorage` is never touched during server rendering; reads happen in effects after mount.
- **No hydration mismatches** — components render a stable placeholder until `useHydrated()` returns true.
- **Corruption-safe** — every read goes through `safeParse`, falling back to a default on any JSON error.
- **Migration-ready** — `runMigrations()` compares the stored schema version with `STORAGE_VERSION`.
- **Backup & restore** — export/import the whole dataset as JSON from **Settings**.
- **Destructive actions are confirmed** — deleting data always requires an explicit confirmation dialog.

`lib/hooks.ts` exposes `useLocalStorage<T>(key, fallback)` which keeps React state and storage in sync (and
listens for writes from other tabs).

---

## Honest limitations

> **localStorage is browser-specific.** Quiz/voting room definitions, box games and results created in one
> browser do **not** appear in another browser or device — use the built-in **JSON export / import** to move
> them.

**Classroom quiz sessions are the exception:** while a session runs, students join the teacher's device over
the network (see the next section). Those limits apply to it as well:

- **The teacher's device is the session.** Keep the host tab open for the whole class — the answer key,
  live progress and reveal live there. Closing it ends hosting (students keep retrying and can rejoin when
  the teacher reopens and restores the session from its snapshot).
- **PeerJS uses a free public signaling server and STUN only (no TURN).** Most classroom networks connect
  fine, but restrictive/symmetric NATs or very strict firewalls can block the direct peer-to-peer link —
  students would see "Can't reach the room yet" with automatic retries.
- **Timing (speed bonus) is client-reported** from each student's device clock. Points are honest for a
  normal classroom, but they are not server-verified.
- **Classroom-trust model, not cryptographic secrecy.** Questions travel without any correctness data, and
  the answer key never leaves the teacher's device before the reveal — but a technically skilled student
  could still inspect their own connection. Do not use this for high-stakes exams.
- Quiz/voting **definitions and saved results remain local** to the teacher's browser (back them up from
  Settings). Deadlines and timers are enforced by each device's clock, not by a server.

Random Boxes does not use room codes at all — it is a standalone single-device game.

---

## Classroom quiz mode (teacher hosts, students join from their own devices)

The flow teachers actually use:

1. **Create** a quiz in `/quiz/create` (or the dashboard) with a manual room code, e.g. `12355`.
2. **Open the room** from the dashboard (**Host** action → `/quiz/room?code=12355&host=1`; the host
   controls open for a signed-in admin). The teacher's browser becomes the host and shows the big room
   code plus a **Share room** button — a small popup offering *Copy room link*, *Share on WhatsApp*,
   *Share on Facebook* and *Share via other apps* (Web Share API), each built from the live origin as
   `…/quiz/room/?code=12355&host=1`.
3. **Students join**: on their own phone/laptop they open `/quiz`, enter `12355` + their name — or open
   the shared room link directly, which lands them on that room's name + join screen (no account; the
   password gate only protects the host controls). They land in the lobby and wait.
4. **Start** — the lobby closes; late joiners are politely refused with the code prompt.
5. **Everyone answers independently** and at their own pace on their own screen (per-question timers are
   optional). The teacher's screen shows live per-student progress and per-question answer counts — but
   **no correctness info is ever sent to students** (`stripAnswerKey()` in `lib/quiz-classroom.ts` removes
   every `correct` flag before any question leaves the host).
6. **Reveal** happens automatically only when **all active students have finished** — or immediately when
   the teacher clicks **End quiz & reveal**, or **removes** an unfinished participant (both explicit
   teacher actions). Then the leaderboard, per-question difficulty, the answer key and each student's own
   results appear on every screen, and the run is saved to quiz history.
7. **New session (same code)** resets the lobby for the next class without recreating the quiz.

Under the hood (`lib/quiz-classroom.ts`):

- The host listens as a PeerJS peer with the deterministic id `dbs-quiz-<CODE>`; students connect to it.
  Quiz traffic flows directly device-to-device (WebRTC); the public PeerJS broker only handles the
  handshake.
- Disconnects never count as finished: a student who loses connection can rejoin with the same identity
  (kept in `sessionStorage`) and resumes at the right question with their recorded answers.
- The host periodically persists a snapshot to `dbs_quiz_sessions_v1` — refreshing the teacher page
  restores lobby/progress/results and the admin dashboard status badges.
- Students who open the page after **Start** get a `late` message; removed students get `kicked` and
  cannot re-answer.

Protocol tests live in `scripts/classroom-test.ts` and drive the full flow (join → start → staggered
finishes → reveal gating → remove-to-reveal → history → snapshot restore) with a fake transport:
`npm test` runs them together with the core logic tests. `npm run test:e2e` additionally drives a real
browser session with Playwright — one teacher tab hosting and two student tabs answering over actual
WebRTC — and asserts the reveal gating end to end.

---

## Feature guide

### Random Boxes (`/boxes`)

- Choose any positive number of boxes (1–200).
- Add, edit, remove or bulk-paste participant names.
- Add, edit and remove box contents of types **question, challenge, task, gift or text**.
- Preview the grid, then start / pause / resume / repeat / reset.
- The grid shows an animated gift-box unboxing; each reveal is recorded in history.

**No-repeat rules.** Participants are drawn from a shuffled queue so each person gets exactly one turn per
cycle. With **40 names and 30 boxes**, after the 30th turn the remaining 10 names automatically continue after
you press **Repeat round** (which only reshuffles box contents — the participant cycle is untouched). When a
cycle is exhausted, a new shuffled cycle starts automatically.

### Voting Rooms (`/votes`, `/votes/create`, `/votes/room`)

- Title, description, one or more questions, and options.
- Single-choice or multiple-choice voting.
- Optional duration or unlimited; optional vote changes; results hidden until closing or shown live.
- Room code is chosen manually by the admin when creating the room — never auto-generated; a code already
  used by another voting room is rejected.
- Join with the admin's code + username, submit a ballot, and see ranked results with percentages and ties.
- Creator controls (admin only): close / reopen, reset votes, export, import.
- JSON export/import for moving rooms and results between devices.

### Quiz Rooms (`/quiz`, `/quiz/create`, `/quiz/room`)

- Add any number of questions with multiple answers and exactly one correct answer each.
- Points per question, optional timers, optional speed bonuses (up to +50%).
- Reorder / edit / delete questions.
- Room code is chosen manually by the admin when creating the quiz — never auto-generated; a code already
  used by another quiz is rejected. The code stays unchanged for the life of the room.
- **Classroom mode (default and only play mode)**: the teacher hosts from the dashboard, students join
  cross-device with code + username, and everyone answers independently on their own screen. Correct
  answers are hidden until all active students finish — or the teacher ends the quiz / removes someone.
  See "Classroom quiz mode" above for the full flow.
- **Quiz Completed** screen with an animated podium (gold/silver/bronze, tie-aware) plus a full table:
  rank, points, correct, incorrect, missed, accuracy and total time taken — plus per-question difficulty
  on the host screen and each student's personal answer review after the reveal.
- Scores are calculated only from real submitted answers; wrong answers score zero, unanswered questions are
  never counted as correct, and the optional speed bonus (up to +50%) applies only when enabled per question.
- Every finished run is **saved to history** (`dbs_quiz_history_v1`) and can be reviewed from the quiz list
  after a refresh — even after restarting the session.
- After a reveal the teacher can start a **new session with the same code** (fresh lobby), go back to the
  dashboard, or create a new quiz.

---

## Project structure

```
app/
  page.tsx                 Public landing (DBS logo + join quiz / join vote cards)
  admin/page.tsx           Admin dashboard (password-gated control center)
  boxes/page.tsx           Random Boxes dashboard + gameplay (admin only)
  votes/page.tsx           Public vote join page
  votes/create/page.tsx    Voting room builder (admin only)
  votes/room/page.tsx      Voting room (Suspense + client)
  voting/…                 Legacy URLs — client-side redirects to /votes/…
  quiz/page.tsx            Public quiz join page (code + username)
  quiz/join/page.tsx       Shared-link forwarder (?room= → the /quiz join page, code prefilled)
  quiz/create/page.tsx     Quiz builder (admin only)
  quiz/room/page.tsx       Quiz room dispatcher (host controls for admins; shared links → student join)
  settings/page.tsx        Storage overview, backup / restore, clear data (admin only)
components/
  admin/                   AdminLogin, AdminGate (password gate)
  boxes/  voting/          Feature-specific components
  quiz/                    QuizRoomForm, QuizHostView (teacher), QuizStudentView, QuizRoomEntry, history
  ui/                      Button, Card, Field, Modal, Toast, Badge, ...
  layout/                  Navbar, Footer, Background, PageHeader
  CountdownTimer.tsx  Podium.tsx  GiftBox.tsx  Providers.tsx
lib/
  admin-auth.ts      Demo password gate: login/logout + useAdminAuth hook
  storage.ts        Versioned, SSR-safe localStorage + backup/import
  hooks.ts          useHydrated, useLocalStorage
  randomization.ts  shuffle, content/box assignment helpers
  boxes.ts          Random Boxes game engine
  voting.ts         Voting validation, casting and result computation
  quiz.ts           Quiz validation, scoring and ranking
  quiz-classroom.ts Cross-device classroom protocol: stripAnswerKey, peer ids, HostSession + messages
  io.ts             JSON download / file read helpers
  cn.ts             className helper
types/              boxes.ts, voting.ts, quiz.ts
scripts/logic-test.ts       Core logic tests (npm test)
scripts/classroom-test.ts   Classroom session protocol tests (npm test)
```

---

## License

Provided as-is for personal and educational use.

---

## Admin Dashboard (/admin) — private area

The control center is **password-protected**. Opening `/admin` (or any admin-only page) without a session
shows a login screen; the password is **`123456`**.

- **Session**: after login the session lives in `sessionStorage` (`dbs_admin_session_v1`) — closing the tab
  requires logging in again. Nothing about the password is persisted.
- **Gated routes**: `/admin`, `/settings`, `/boxes`, `/quiz/create`, `/votes/create`, plus host/creator views
  (`/quiz/room?host=1` for signed-in admins, `/votes/room?host=1`). Participant pages (`/`, `/quiz`, `/votes`,
  non-host room views — and shared quiz-room links opened without a session, which land on the username +
  join screen) never show admin links or controls.
- **Logout** button in the dashboard header clears the session.

> ⚠️ **Demo-only gate.** This is a frontend app with no server: the password ships in the client bundle, so
> this protects against casual access only — it is **not** production-grade authentication. A real private
> admin area requires server-side auth (see `lib/admin-auth.ts`).

A central control center for managing everything stored in this browser:

- **Create** box games, voting rooms or quizzes from one place.
- **Summary counts** for saved items and total ballots cast.
- **Saved-room tables** with quick actions: copy code, open/host, edit, close/reopen, publish/unpublish, reset votes/sessions/progress, export, and delete (all with confirmations).
- **Draft & publish workflow** for voting rooms and quizzes.
- **Manual room codes**: the admin types the code for every quiz and voting room in a required
  "Choose Your Room Code" field. Codes are never auto-generated, and a code already used by another room of
  the same type is rejected. Participants can only enter the code — they can never choose or change one.
- **Local-only**: the dashboard only shows data in the current browser's localStorage.

---

## Design & theme

The UI uses the DBS brand palette on a clean white base:

- **Background**: white (#FFFFFF) everywhere
- **Text & headings**: black (#111111)
- **Primary buttons & brand accents**: red (#DD0000)
- **Highlights, badges, accents**: yellow/gold (#FFCC00)
- **Borders & surfaces**: light gray with subtle shadows

The DBS logo renders "D" in black, "B" in red and "S" in yellow, with "Deutsch-Bildungsstudio" underneath.
The look is simple, elegant, modern and responsive — cards stack vertically on mobile.