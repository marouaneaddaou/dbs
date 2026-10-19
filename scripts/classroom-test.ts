import assert from "node:assert";
import {
  HostSession,
  peerIdForCode,
  stripAnswerKey,
  type HostMessage,
  type HostTransport,
  type StudentMessage,
  type StudentReveal,
} from "../lib/quiz-classroom";
import type { QuizHistoryEntry, QuizQuestion, QuizRoom, QuizSessionRecord } from "../types/quiz";

/**
 * Classroom session protocol tests — framework-free.
 *
 * Drives HostSession with a fake transport through the full classroom flow:
 * join → start → independent answering + per-student progress → live
 * `answered` feedback (own pick only) → reveal gating (all finished / teacher
 * end / remove) → editing toggle + revision lock → history + snapshot
 * persistence → refresh restore.
 */

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log("  ok -", name);
  } catch (err) {
    console.error("  FAIL -", name);
    throw err;
  }
}

/* --------------------------------- fixtures -------------------------------- */

function makeQuestion(i: number): QuizQuestion {
  return {
    id: `q${i}`,
    text: `Question ${i}: pick the right option`,
    points: 100,
    timeLimitSec: 20,
    speedBonus: true,
    answers: [
      { id: `q${i}_right`, text: `right choice ${i}`, correct: true },
      { id: `q${i}_wrong1`, text: `wrong choice ${i}a`, correct: false },
      { id: `q${i}_wrong2`, text: `wrong choice ${i}b`, correct: false },
    ],
  };
}

const room: QuizRoom = {
  code: "12355",
  title: "Classroom protocol test",
  description: "",
  questions: [makeQuestion(1), makeQuestion(2), makeQuestion(3)],
  correctVisibility: "atEnd",
  status: "published",
  createdAt: 1_700_000_000_000,
};

class FakeTransport implements HostTransport {
  ordered: { token: unknown; msg: HostMessage }[] = [];
  history: QuizHistoryEntry[] = [];
  sessions: QuizSessionRecord[] = [];
  changes = 0;

  send(token: unknown, message: HostMessage): void {
    this.ordered.push({ token, msg: message });
  }
  drop(): void {
    /* recorded implicitly by session unbinding */
  }
  onChange(): void {
    this.changes += 1;
  }
  persistSession(record: QuizSessionRecord): void {
    this.sessions.push(record);
  }
  persistHistory(entry: QuizHistoryEntry): void {
    this.history.push(entry);
  }

  messagesFor(token: unknown): HostMessage[] {
    return this.ordered.filter((entry) => entry.token === token).map((entry) => entry.msg);
  }
  lastFor(token: unknown): HostMessage | undefined {
    const list = this.messagesFor(token);
    return list[list.length - 1];
  }
  clear(): void {
    this.ordered = [];
  }
}

/** Deep walk: no object anywhere may expose a `correct` flag pre-reveal —
 * except response entries (they carry an `answerId`), which may include the
 * host-validated feedback for the student's own pick (Quizizz-style). */
function assertNoCorrectFlags(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertNoCorrectFlags(entry, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "correct" && "answerId" in (value as object)) continue; // own-answer feedback
      assert.notStrictEqual(key, "correct", `forbidden "correct" key found at ${path}.${key}`);
      assertNoCorrectFlags(child, `${path}.${key}`);
    }
  }
}

function stateMessage(msg: HostMessage): Extract<HostMessage, { type: "state" }> | null {
  return msg.type === "state" ? msg : null;
}

function isRevealState(msg: HostMessage): boolean {
  const state = stateMessage(msg);
  return state?.state.phase === "finished" && state.state.reveal !== null;
}

function answeredMessages(t: FakeTransport, token: unknown): Extract<HostMessage, { type: "answered" }>[] {
  return t.messagesFor(token).filter((m) => m.type === "answered") as Extract<
    HostMessage,
    { type: "answered" }
  >[];
}

function join(studentId: string, name: string): StudentMessage {
  return { type: "join", studentId, name };
}

function answer(
  studentId: string,
  questionId: string,
  answerId: string | null,
  elapsedMs = 1000,
): StudentMessage {
  return { type: "answer", studentId, questionId, answerId, elapsedMs };
}

function progress(studentId: string, index: number): StudentMessage {
  return { type: "progress", studentId, index };
}

/* ================================ scenario 1 ================================ */

console.log("Classroom: full session with A + B (reveal only when ALL finish)");

const transport = new FakeTransport();
const TA = { device: "A" };
const TB = { device: "B" };
const session = new HostSession(room, transport, null);

ok("join in lobby returns state without any correctness flags", () => {
  session.handleRaw(TA, join("stu_A", "StudentA"));
  const msg = transport.lastFor(TA);
  const state = stateMessage(msg!);
  assert.ok(state, "expected a state message");
  assert.strictEqual(state!.state.phase, "lobby");
  assertNoCorrectFlags(msg, "$.A.joinState");
});

ok("stripAnswerKey never exposes correct flags", () => {
  assertNoCorrectFlags(stripAnswerKey(room), "$.quiz");
  assert.strictEqual(stripAnswerKey(room).questions[0].answers.length, 3);
});

ok("second student joins, host id is prefixed per code", () => {
  transport.clear();
  session.handleRaw(TB, join("stu_B", "StudentB"));
  assert.strictEqual(session.listStudents().length, 2);
  assert.strictEqual(peerIdForCode("12355"), "dbs-quiz-12355");
  assertNoCorrectFlags(transport.lastFor(TB)!, "$.B.joinState");
});

ok("start refuses with zero students and when already started", () => {
  const empty = new HostSession(room, new FakeTransport(), null);
  assert.strictEqual(empty.start().ok, false);
  const first = session.start();
  assert.strictEqual(first.ok, true);
  assert.strictEqual(session.phase, "playing");
  assert.strictEqual(session.start().ok, false);
  const started = transport.messagesFor(TA).filter((m) => m.type === "started");
  assert.strictEqual(started.length, 1);
});

const TA2 = { device: "A-reconnected" };

ok("disconnect marks student offline; same id rejoins on a new token", () => {
  transport.clear();
  session.handleDisconnect(TA);
  assert.strictEqual(session.progress().disconnected, 1);

  session.handleRaw(TA2, join("stu_A", "StudentA"));
  const state = stateMessage(transport.lastFor(TA2)!);
  assert.ok(state, "expected state on rejoin");
  assert.strictEqual(state!.state.phase, "playing");
  assert.strictEqual(session.progress().disconnected, 0);
  // rebinding: the old token is no longer bound to this student
  transport.clear();
  session.handleRaw(TA, answer("stu_A", "q1", "q1_right"));
  assert.strictEqual(session.responses.length, 0, "answers from a stale token are ignored");
});

ok("answers from never-joined students are ignored", () => {
  const TD = { device: "D" };
  session.handleRaw(TD, answer("stu_D", "q1", "q1_right"));
  assert.strictEqual(session.responses.length, 0);
});

ok("A finishes first — no reveal while B is still active", () => {
  transport.clear();
  session.handleRaw(TA2, answer("stu_A", "q1", "q1_right"));
  session.handleRaw(TA2, answer("stu_A", "q2", "q2_right"));
  session.handleRaw(TA2, answer("stu_A", "q3", "q3_right"));

  // Live Quizizz-style feedback: one `answered` per recorded answer.
  const aFb = answeredMessages(transport, TA2);
  assert.strictEqual(aFb.length, 3, "each recorded answer sends live feedback");
  assert.strictEqual(aFb[2].questionId, "q3");
  assert.strictEqual(aFb[2].correct, true);
  assert.strictEqual(aFb[2].correctAnswerId, "q3_right", "feedback carries the key for that question only");

  session.handleRaw(TA2, { type: "complete", studentId: "stu_A" });
  assert.strictEqual(session.phase, "playing", "phase must stay playing after A alone finishes");
  assert.strictEqual(transport.ordered.some((entry) => isRevealState(entry.msg)), false);
  assert.strictEqual(session.progress().completed, 1);
});

ok("duplicate and late answers after completion are ignored", () => {
  const before = session.responses.length;
  session.handleRaw(TA2, answer("stu_A", "q1", "q1_wrong1"));
  assert.strictEqual(session.responses.length, before);
});

ok("B completes (wrong + unanswered included) → reveal goes to everyone", () => {
  transport.clear();
  session.handleRaw(TB, answer("stu_B", "q1", "q1_right"));
  session.handleRaw(TB, answer("stu_B", "q2", "q2_wrong1", 5000));
  session.handleRaw(TB, answer("stu_B", "q3", null, 20000)); // timer expiry marker

  const bFb = answeredMessages(transport, TB);
  assert.strictEqual(bFb.length, 2, "unanswered (null) marker sends no feedback message");
  const bFbQ2 = bFb.find((m) => m.questionId === "q2")!;
  assert.strictEqual(bFbQ2.correct, false, "wrong pick is reported as incorrect");
  assert.strictEqual(bFbQ2.correctAnswerId, "q2_right", "still reveals the key for that question");

  session.handleRaw(TB, { type: "complete", studentId: "stu_B" });

  assert.strictEqual(session.phase, "finished");
  const aMsg = transport.lastFor(TA2)!;
  const bMsg = transport.lastFor(TB)!;
  assert.ok(isRevealState(aMsg), "A must receive the reveal");
  assert.ok(isRevealState(bMsg), "B must receive the reveal");

  const aReveal = stateMessage(aMsg)!.state.reveal as StudentReveal;
  const bReveal = stateMessage(bMsg)!.state.reveal as StudentReveal;

  // Leaderboard: A swept, B has 1 correct / 1 wrong / 1 unanswered.
  assert.strictEqual(aReveal.leaderboard.length, 2);
  const aRow = aReveal.leaderboard.find((row) => row.playerId === "stu_A")!;
  const bRow = aReveal.leaderboard.find((row) => row.playerId === "stu_B")!;
  assert.strictEqual(aRow.rank, 1);
  assert.strictEqual(aRow.correct, 3);
  assert.strictEqual(bRow.correct, 1);
  assert.strictEqual(bRow.incorrect, 1);
  assert.strictEqual(bRow.unanswered, 1);
  assert.strictEqual(bRow.accuracy, 50);
  assert.ok(aRow.points > bRow.points, "A must outscore B");

  // Answer key + personalized responses.
  assert.strictEqual(aReveal.answerKey.length, 3);
  assert.strictEqual(aReveal.answerKey[0].correctAnswerId, "q1_right");
  assert.ok(aReveal.yourResponses.every((r) => r.correct), "A answered everything correctly");
  const bQ2 = bReveal.yourResponses.find((r) => r.questionId === "q2")!;
  const bQ3 = bReveal.yourResponses.find((r) => r.questionId === "q3")!;
  assert.strictEqual(bQ2.correct, false);
  assert.strictEqual(bQ3.answerId, null);
  assert.strictEqual(bQ3.correct, false);

  // Every message that ever left the host before the reveal was key-free.
  for (const entry of transport.ordered) {
    if (!isRevealState(entry.msg)) assertNoCorrectFlags(entry.msg, "$.preReveal");
  }
});

ok("history saved exactly once with both players", () => {
  assert.strictEqual(transport.history.length, 1);
  const entry = transport.history[0];
  assert.strictEqual(entry.roomCode, "12355");
  assert.strictEqual(entry.playerCount, 2);
  assert.strictEqual(entry.questionCount, 3);
  const lastSession = transport.sessions[transport.sessions.length - 1];
  assert.strictEqual(lastSession.session.status, "finished");
  assert.strictEqual(lastSession.players.length, 2);
  assert.strictEqual(lastSession.session.completedAt, session.finishedAt);
});

ok("new session resets to lobby, resets students, saves history only on next finish", () => {
  transport.clear();
  session.newSession();
  assert.strictEqual(session.phase, "lobby");
  assert.strictEqual(session.responses.length, 0);
  assert.strictEqual(session.progress().completed, 0);
  const resets = transport.ordered.filter((entry) => entry.msg.type === "session-reset");
  assert.strictEqual(resets.length, 2, "both connected students get session-reset");
  assert.strictEqual(transport.history.length, 1, "no extra history on reset");
  assert.strictEqual(session.start().ok, true);
  assert.strictEqual(session.phase, "playing");
});

ok("teacher endQuiz finalizes immediately and appends a second history run", () => {
  transport.clear();
  session.handleRaw(TB, answer("stu_B", "q1", "q1_right"));
  session.endQuiz();
  assert.strictEqual(session.phase, "finished");
  assert.strictEqual(transport.history.length, 2);
  assert.ok(isRevealState(transport.lastFor(TA2)!));
  assert.ok(transport.history[1].finishedAt >= transport.history[0].finishedAt);
});

/* ================================ scenario 2 ================================ */

console.log("Classroom: late joiner, remove-student reveal");

const t2 = new FakeTransport();
const s2 = new HostSession(room, t2, null);
const S1 = { device: "s1" };
const S2 = { device: "s2" };
const LATE = { device: "late" };

ok("late joiner after start receives `late`, never sees the quiz", () => {
  s2.handleRaw(S1, join("stu_1", "StudentOne"));
  s2.handleRaw(S2, join("stu_2", "StudentTwo"));
  assert.strictEqual(s2.start().ok, true);
  t2.clear();
  s2.handleRaw(LATE, join("stu_3", "StudentThree"));
  const msg = t2.lastFor(LATE);
  assert.strictEqual(msg?.type, "late");
  assert.strictEqual(s2.listStudents().length, 2, "late student must not be added");
});

ok("removing the last unfinished student reveals to the rest", () => {
  // stu_1 answers everything; stu_2 stalls.
  for (let i = 1; i <= 3; i += 1) {
    s2.handleRaw(S1, answer("stu_1", `q${i}`, `q${i}_right`));
    s2.handleRaw(S1, progress("stu_1", i));
  }
  s2.handleRaw(S1, { type: "complete", studentId: "stu_1" });
  assert.strictEqual(s2.phase, "playing", "still waiting on stu_2");

  t2.clear();
  s2.removeStudent("stu_2");
  assert.strictEqual(s2.phase, "finished", "removing the stall unblocks the reveal");
  assert.strictEqual(t2.lastFor(S2)?.type, "kicked");
  assert.ok(isRevealState(t2.lastFor(S1)!), "remaining student gets the reveal");
  const reveal = stateMessage(t2.lastFor(S1)!)!.state.reveal as StudentReveal;
  assert.strictEqual(reveal.leaderboard.length, 1, "removed student is out of the leaderboard");
});

ok("rejoining after removal is refused with kicked", () => {
  t2.clear();
  s2.handleRaw(S2, join("stu_2", "StudentTwo"));
  assert.strictEqual(t2.lastFor(S2)?.type, "kicked");
  assert.strictEqual(s2.listStudents().filter((p) => p.status === "removed").length, 1);
});

/* ================================ scenario 3 ================================ */

console.log("Classroom: refresh restore from snapshot");

const t3 = new FakeTransport();
const s3 = new HostSession(room, t3, null);
const R1 = { device: "r1" };
const R2 = { device: "r2" };

ok("snapshot mid-game restores phase, responses and player position", () => {
  s3.handleRaw(R1, join("stu_r1", "RestoredOne"));
  s3.handleRaw(R2, join("stu_r2", "RestoredTwo"));
  assert.strictEqual(s3.start().ok, true);
  s3.handleRaw(R1, answer("stu_r1", "q1", "q1_right"));
  s3.handleRaw(R1, progress("stu_r1", 1));
  s3.handleRaw(R1, answer("stu_r1", "q2", "q2_wrong1"));
  s3.handleRaw(R1, progress("stu_r1", 2));

  const snapshot = s3.snapshot();
  const restored = new HostSession(room, new FakeTransport(), snapshot);

  assert.strictEqual(restored.phase, "playing");
  assert.strictEqual(restored.responses.length, 2);
  assert.strictEqual(restored.listStudents().length, 2);

  const t3b = new FakeTransport();
  const restored2 = new HostSession(room, t3b, snapshot);
  const NEW1 = { device: "r1-new" };
  restored2.handleRaw(NEW1, join("stu_r1", "RestoredOne"));
  const state = stateMessage(t3b.lastFor(NEW1)!);
  assert.ok(state, "state after rejoin");
  assert.strictEqual(state!.state.phase, "playing");
  assert.strictEqual(state!.state.you.currentIndex, 2, "resume at the first unanswered question");
  assert.strictEqual(state!.state.answers.length, 2, "recorded answers come back after refresh");
  const restoredQ1 = state!.state.answers.find((a) => a.questionId === "q1")!;
  const restoredQ2 = state!.state.answers.find((a) => a.questionId === "q2")!;
  assert.strictEqual(restoredQ1.correct, true, "own-answer feedback survives refresh");
  assert.strictEqual(restoredQ1.correctAnswerId, "q1_right");
  assert.strictEqual(restoredQ2.correct, false);
  assert.strictEqual(state!.state.reveal, null, "no reveal while in progress");
  assertNoCorrectFlags(state!, "$.restoredState");
});

ok("session snapshot shape matches admin status expectations", () => {
  const snap = s3.snapshot();
  assert.strictEqual(snap.session.roomCode, "12355");
  assert.ok(["lobby", "question", "finished"].includes(snap.session.status));
  assert.strictEqual(snap.players.every((p) => p.status !== "removed"), true);
});

/* ================================ scenario 4 ================================ */

console.log("Classroom: independent navigation + teacher-enabled answer editing");

const t4 = new FakeTransport();
const s4 = new HostSession(room, t4, null);
const N1 = { device: "n1" };
const N2 = { device: "n2" };

ok("students navigate independently; host tracks a per-student position", () => {
  s4.handleRaw(N1, join("stu_n1", "NavOne"));
  s4.handleRaw(N2, join("stu_n2", "NavTwo"));
  assert.strictEqual(s4.start().ok, true);

  s4.handleRaw(N1, answer("stu_n1", "q1", "q1_right"));
  s4.handleRaw(N1, progress("stu_n1", 1));
  s4.handleRaw(N1, answer("stu_n1", "q2", "q2_right"));
  s4.handleRaw(N1, progress("stu_n1", 2));

  const n1 = s4.listStudents().find((p) => p.id === "stu_n1")!;
  const n2 = s4.listStudents().find((p) => p.id === "stu_n2")!;
  assert.strictEqual(n1.currentIndex, 2, "N1 moved ahead via progress");
  assert.strictEqual(n2.currentIndex, 0, "N2 stays on question 1 — positions never share");

  // Out-of-range progress is clamped to the question count, never crashes.
  s4.handleRaw(N2, progress("stu_n2", 99));
  assert.strictEqual(s4.listStudents().find((p) => p.id === "stu_n2")!.currentIndex, 3);
  s4.handleRaw(N2, progress("stu_n2", 0));
});

ok("progress from a foreign token is ignored", () => {
  const FAKE = { device: "fake" };
  s4.handleRaw(FAKE, progress("stu_n1", 0));
  assert.strictEqual(s4.listStudents().find((p) => p.id === "stu_n1")!.currentIndex, 2);
});

ok("answers lock by default; teacher toggle enables revision (same response row)", () => {
  s4.handleRaw(N2, answer("stu_n2", "q1", "q1_wrong1"));
  assert.strictEqual(
    s4.responses.filter((r) => r.playerId === "stu_n2" && r.questionId === "q1").length,
    1,
  );

  // Locked: the duplicate must not create or replace anything.
  s4.handleRaw(N2, answer("stu_n2", "q1", "q1_right"));
  assert.strictEqual(
    s4.responses.find((r) => r.playerId === "stu_n2" && r.questionId === "q1")!.answerId,
    "q1_wrong1",
    "duplicate rejected while editing is off",
  );

  // Teacher enables editing → full state broadcast carries allowEditing: true.
  t4.clear();
  s4.setAllowEditing(true);
  const states = t4.ordered
    .filter((entry) => entry.msg.type === "state")
    .map((entry) => stateMessage(entry.msg));
  assert.ok(states.length >= 2, "state broadcast reaches every connected student");
  assert.ok(states.every((state) => state!.state.allowEditing === true), "allowEditing on the wire");

  // Revision replaces the existing response row (no duplicates) and sends a
  // fresh `answered` feedback message for the new pick.
  s4.handleRaw(N2, answer("stu_n2", "q1", "q1_right"));
  const rows = s4.responses.filter((r) => r.playerId === "stu_n2" && r.questionId === "q1");
  assert.strictEqual(rows.length, 1, "revision replaces, never duplicates");
  assert.strictEqual(rows[0].answerId, "q1_right");
  const n2Fb = t4.messagesFor(N2).filter((m) => m.type === "answered") as Extract<
    HostMessage,
    { type: "answered" }
  >[];
  assert.strictEqual(n2Fb.length, 1, "locked duplicate sent no feedback; revision sent one");
  assert.strictEqual(n2Fb[0].correct, true, "revised pick is re-validated live");
  assert.strictEqual(n2Fb[0].correctAnswerId, "q1_right");

  // Teacher toggles back off → locked again.
  s4.setAllowEditing(false);
  s4.handleRaw(N2, answer("stu_n2", "q1", "q1_wrong1"));
  assert.strictEqual(
    s4.responses.find((r) => r.playerId === "stu_n2" && r.questionId === "q1")!.answerId,
    "q1_right",
    "re-locked after the teacher disables editing",
  );
});

ok("allowEditing survives snapshot restore and keeps revisions working", () => {
  s4.setAllowEditing(true);
  const snap = s4.snapshot();
  assert.strictEqual(snap.session.allowEditing, true, "snapshot stores the toggle");

  const t4b = new FakeTransport();
  const restored = new HostSession(room, t4b, snap);
  assert.strictEqual(restored.phase, "playing");

  const R = { device: "n1-refresh" };
  restored.handleRaw(R, join("stu_n1", "NavOne"));
  const state = stateMessage(t4b.lastFor(R)!);
  assert.ok(state, "state after rejoin");
  assert.strictEqual(state!.state.allowEditing, true, "restored state carries allowEditing");
  assert.strictEqual(state!.state.you.currentIndex, 2, "restored position preserved");

  // The earlier answer came back → a revision replaces it in place.
  restored.handleRaw(R, answer("stu_n1", "q1", "q1_wrong1"));
  const rows = restored.responses.filter((r) => r.playerId === "stu_n1" && r.questionId === "q1");
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].answerId, "q1_wrong1", "revision accepted after restore");
});

/* --------------------------------- summary --------------------------------- */

console.log(`\n${passed} classroom checks passed.`);
