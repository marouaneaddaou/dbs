/**
 * Classroom quiz protocol — teacher-hosted shared rooms.
 *
 * The teacher's browser is the host of the live session (PeerJS/WebRTC data
 * channels; the room code maps to the host peer id `dbs-quiz-<CODE>`). Students
 * on other devices connect to that peer with only a username and the code.
 *
 * SECURITY MODEL (honest):
 * - The full answer key never leaves the teacher's device until the reveal
 *   condition is met: `stripAnswerKey` removes every `correct` flag from the
 *   quiz students receive, and full reveal payloads are built only in
 *   `HostSession.finalize()`. Exception (Quizizz-style live feedback): right
 *   after a student submits an answer they receive an `answered` message with
 *   the correctness of THEIR OWN pick and the correct option for THAT question
 *   only — never the key for other questions and never other students'
 *   responses.
 * - WebRTC payloads are encrypted peer-to-peer; the free PeerJS signaling
 *   server only brokers the initial connection and never sees quiz data.
 * - This is a classroom-trust model, not cryptographic secrecy against a
 *   malicious student running their own client: timing (speed bonus) is
 *   reported by the student's device and cannot be fully trusted.
 *
 * This module is pure (no DOM, no PeerJS import) so it can run in Node tests.
 */

import type {
  QuizHistoryEntry,
  QuizPlayer,
  QuizPlayerScore,
  QuizResponse,
  QuizRoom,
  QuizSessionRecord,
} from "@/types/quiz";
import { buildHistoryEntry, computeScores, pointsForAnswer } from "@/lib/quiz";
import { normalizeCode } from "@/lib/voting";
import { uid } from "@/lib/storage";

/* ------------------------------ public shapes ----------------------------- */

export interface PublicAnswer {
  id: string;
  text: string;
}

export interface PublicQuestion {
  id: string;
  text: string;
  points: number;
  timeLimitSec: number | null;
  speedBonus: boolean;
  answers: PublicAnswer[];
}

/** What students may hold BEFORE the reveal: questions without any correctness. */
export interface PublicQuiz {
  code: string;
  title: string;
  description: string;
  questions: PublicQuestion[];
}

/** Strip every `correct` flag — the only quiz shape students ever receive pre-reveal. */
export function stripAnswerKey(room: QuizRoom): PublicQuiz {
  return {
    code: normalizeCode(room.code),
    title: room.title,
    description: room.description,
    questions: room.questions.map((q) => ({
      id: q.id,
      text: q.text,
      points: q.points,
      timeLimitSec: q.timeLimitSec,
      speedBonus: q.speedBonus,
      answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
    })),
  };
}

/** Host peer id for a room code. Prefixed so it can never collide with vote rooms. */
export function peerIdForCode(code: string): string {
  return `dbs-quiz-${normalizeCode(code)}`;
}

/* --------------------------- protocol message types ----------------------- */

export type StudentStatus = "joined" | "playing" | "completed" | "removed";
export type HostPhase = "lobby" | "playing" | "finished";

export interface ClassroomStudent {
  id: string;
  name: string;
  status: StudentStatus;
  connected: boolean;
  joinedAt: number;
  completedAt: number | null;
  /** Highest question index the student has reported reaching. */
  currentIndex: number;
}

export interface StudentAnswerState {
  questionId: string;
  answerId: string | null;
  elapsedMs: number;
  /** Own-answer feedback (Quizizz-style live validation), filled by the host. */
  correct?: boolean;
  /** The correct option for this question — sent only after the student answered it. */
  correctAnswerId?: string | null;
}

/** Shared, post-reveal facts (safe for every participant once revealed). */
export interface RevealPayload {
  finishedAt: number;
  leaderboard: QuizPlayerScore[];
  answerKey: { questionId: string; correctAnswerId: string }[];
  perQuestion: { questionId: string; answered: number; correct: number; total: number }[];
}

/** Post-reveal message personalized for one student. */
export interface StudentReveal extends RevealPayload {
  yourResponses: {
    questionId: string;
    answerId: string | null;
    correct: boolean;
    points: number;
    elapsedMs: number;
  }[];
}

export interface StudentState {
  phase: HostPhase;
  allowEditing: boolean;
  you: {
    id: string;
    name: string;
    status: StudentStatus;
    currentIndex: number;
  };
  answers: StudentAnswerState[];
  reveal: StudentReveal | null;
}

export type HostMessage =
  | { type: "state"; quiz: PublicQuiz; state: StudentState }
  | { type: "started" }
  | { type: "session-reset" }
  | { type: "kicked"; reason: "removed" | "reset" }
  | { type: "late" }
  /** Live feedback for the student's own submission (never the full key). */
  | { type: "answered"; questionId: string; answerId: string; correctAnswerId: string; correct: boolean };

export type StudentMessage =
  | { type: "join"; studentId: string; name: string }
  | { type: "answer"; studentId: string; questionId: string; answerId: string | null; elapsedMs: number }
  | { type: "progress"; studentId: string; index: number }
  | { type: "complete"; studentId: string };

/* -------------------------------- transport -------------------------------- */

export interface HostTransport {
  /** Deliver a message to one student's live connection (token is opaque to the session). */
  send(token: unknown, message: HostMessage): void;
  /** Close a student's connection (after sending `kicked`). */
  drop?(token: unknown): void;
  /** Session mutated — UI should re-render. */
  onChange(): void;
  /** Persist a snapshot for refresh recovery + the admin dashboard status. */
  persistSession(record: QuizSessionRecord): void;
  /** Persist one completed run into quiz history (deduped by the receiver). */
  persistHistory(entry: QuizHistoryEntry): void;
}

/* -------------------------------- host session ----------------------------- */

export class HostSession {
  readonly room: QuizRoom;
  readonly quiz: PublicQuiz;

  phase: HostPhase = "lobby";
  finishedAt: number | null = null;
  responses: QuizResponse[] = [];
  /** Teacher toggle: when on, students may revise answers they already submitted. */
  allowEditing = false;

  private readonly transport: HostTransport;
  private readonly studentsById = new Map<string, ClassroomStudent>();
  private readonly tokenByStudent = new Map<string, unknown>();
  private readonly studentByToken = new Map<unknown, string>();
  private historySaved = false;

  constructor(room: QuizRoom, transport: HostTransport, restored?: QuizSessionRecord | null) {
    this.room = room;
    this.quiz = stripAnswerKey(room);
    this.transport = transport;

    if (restored) {
      for (const p of restored.players) {
        if (p.status === "removed") continue;
        this.studentsById.set(p.id, {
          id: p.id,
          name: p.name,
          status: p.status ?? (restored.session.status === "question" ? "playing" : "joined"),
          connected: false,
          joinedAt: p.joinedAt,
          completedAt: p.completedAt ?? null,
          currentIndex: 0,
        });
      }
      this.responses = restored.session.responses.map((r) => ({ ...r }));
      if (restored.session.status === "question") {
        this.phase = "playing";
      } else if (restored.session.status === "reveal" || restored.session.status === "finished") {
        this.phase = "finished";
        this.finishedAt = restored.session.completedAt ?? Date.now();
        this.historySaved = true; // the original run already saved its history entry
      } else {
        this.phase = "lobby";
      }
      this.allowEditing = restored.session.allowEditing === true;
      // Players resume where the snapshot left off: use the stored index when
      // available, otherwise derive it from recorded responses.
      for (const student of this.studentsById.values()) {
        const restoredPlayer = restored.players.find((p) => p.id === student.id);
        if (typeof restoredPlayer?.currentIndex === "number") {
          student.currentIndex = restoredPlayer.currentIndex;
        } else {
          const answered = this.responses.filter((r) => r.playerId === student.id).length;
          student.currentIndex = Math.min(answered, this.room.questions.length);
        }
      }
    }
  }

  /* ------------------------------ queries ------------------------------ */

  listStudents(): ClassroomStudent[] {
    return [...this.studentsById.values()].map((s) => ({ ...s }));
  }

  activeStudents(): ClassroomStudent[] {
    return [...this.studentsById.values()].filter((s) => s.status !== "removed");
  }

  progress(): { joined: number; completed: number; playing: number; disconnected: number; removed: number } {
    const all = [...this.studentsById.values()];
    return {
      joined: all.filter((s) => s.status !== "removed").length,
      completed: all.filter((s) => s.status === "completed").length,
      playing: all.filter((s) => s.status === "playing" || s.status === "joined").length,
      disconnected: all.filter((s) => !s.connected && s.status !== "removed").length,
      removed: all.filter((s) => s.status === "removed").length,
    };
  }

  questionStats(): { questionId: string; answered: number; correct: number; total: number }[] {
    const active = this.activeStudents().length;
    return this.room.questions.map((q) => {
      const forQuestion = this.responses.filter((r) => r.questionId === q.id);
      return {
        questionId: q.id,
        answered: forQuestion.length,
        correct: forQuestion.filter((r) => r.correct).length,
        total: active,
      };
    });
  }

  finalLeaderboard(): QuizPlayerScore[] {
    const players = this.activeStudents().map(toPlayer);
    return computeScores(this.room, players, this.responses);
  }

  private sharedReveal(): RevealPayload {
    return {
      finishedAt: this.finishedAt ?? Date.now(),
      leaderboard: this.finalLeaderboard(),
      answerKey: this.room.questions.map((q) => ({
        questionId: q.id,
        correctAnswerId: q.answers.find((a) => a.correct)?.id ?? "",
      })),
      perQuestion: this.questionStats(),
    };
  }

  private revealFor(studentId: string): StudentReveal {
    const own = new Map(this.responses.filter((r) => r.playerId === studentId).map((r) => [r.questionId, r]));
    return {
      ...this.sharedReveal(),
      yourResponses: this.room.questions.map((q) => {
        const r = own.get(q.id) ?? null;
        return {
          questionId: q.id,
          answerId: r?.answerId ?? null,
          correct: r?.correct ?? false,
          points: r?.points ?? 0,
          elapsedMs: r?.elapsedMs ?? 0,
        };
      }),
    };
  }

  /** Correct option id for a question ("" when the room has no correct flag). */
  private correctAnswerIdFor(questionId: string): string {
    const question = this.room.questions.find((q) => q.id === questionId);
    return question?.answers.find((a) => a.correct)?.id ?? "";
  }

  /** Response → wire shape for the owning student, incl. own-answer feedback. */
  private toAnswerState(response: QuizResponse): StudentAnswerState {
    return {
      questionId: response.questionId,
      answerId: response.answerId,
      elapsedMs: response.elapsedMs,
      correct: response.correct,
      correctAnswerId: this.correctAnswerIdFor(response.questionId),
    };
  }

  private buildState(studentId: string): StudentState {
    const student = this.studentsById.get(studentId);
    const answers = this.responses
      .filter((r) => r.playerId === studentId)
      .map((r) => this.toAnswerState(r));
    return {
      phase: this.phase,
      allowEditing: this.allowEditing,
      you: student
        ? { id: student.id, name: student.name, status: student.status, currentIndex: student.currentIndex }
        : { id: studentId, name: "", status: "joined", currentIndex: 0 },
      answers,
      reveal: this.phase === "finished" ? this.revealFor(studentId) : null,
    };
  }

  private sendState(studentId: string): void {
    const token = this.tokenByStudent.get(studentId);
    if (token === undefined) return;
    this.transport.send(token, { type: "state", quiz: this.quiz, state: this.buildState(studentId) });
  }

  /* ----------------------------- inbound ------------------------------ */

  handleRaw(token: unknown, raw: unknown): void {
    const msg = raw as StudentMessage | null;
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

    if (msg.type === "join") {
      this.handleJoin(token, msg.studentId, msg.name);
      return;
    }
    if (msg.type === "answer") {
      this.handleAnswer(token, msg);
      return;
    }
    if (msg.type === "progress") {
      this.handleProgress(token, msg);
      return;
    }
    if (msg.type === "complete") {
      this.handleComplete(token, msg.studentId);
    }
  }

  handleDisconnect(token: unknown): void {
    const studentId = this.studentByToken.get(token);
    if (studentId === undefined) return;
    const student = this.studentsById.get(studentId);
    if (student && student.connected) {
      student.connected = false;
      this.changed();
    }
  }

  private handleJoin(token: unknown, studentId: string, rawName: string): void {
    const name = String(rawName || "").trim().slice(0, 40) || "Student";
    const existing = this.studentsById.get(studentId);

    if (existing) {
      if (existing.status === "removed") {
        this.transport.send(token, { type: "kicked", reason: "removed" });
        return;
      }
      this.bindToken(existing.id, token);
      existing.connected = true;
      existing.name = name;
      this.sendState(existing.id);
      this.changed();
      return;
    }

    // Unknown student.
    if (this.phase === "playing") {
      this.transport.send(token, { type: "late" });
      return;
    }
    if (this.phase === "finished") {
      this.transport.send(token, { type: "late" });
      return;
    }

    const student: ClassroomStudent = {
      id: studentId,
      name,
      status: "joined",
      connected: true,
      joinedAt: Date.now(),
      completedAt: null,
      currentIndex: 0,
    };
    this.studentsById.set(studentId, student);
    this.bindToken(studentId, token);
    this.sendState(studentId);
    this.changed();
  }

  private handleAnswer(token: unknown, msg: Extract<StudentMessage, { type: "answer" }>): void {
    if (this.phase !== "playing") return;
    // The message's studentId is advisory — only a connection currently bound
    // to this student may answer for it (blocks stale tokens and spoofing).
    if (this.studentByToken.get(token) !== msg.studentId) return;
    const student = this.studentsById.get(msg.studentId);
    if (!student || student.status === "removed" || student.status === "completed") return;

    if (student.status === "joined") student.status = "playing";

    if (msg.answerId === null || msg.answerId === undefined) {
      // Unanswered marker (timer ran out) — progress only, no response is
      // recorded and an already submitted answer is never overwritten.
      this.changed();
      return;
    }

    const question = this.room.questions.find((q) => q.id === msg.questionId);
    if (!question) return;
    const answer = question.answers.find((a) => a.id === msg.answerId);
    if (!answer) return;

    const existingIndex = this.responses.findIndex(
      (r) => r.playerId === student.id && r.questionId === question.id,
    );
    // Locked after submission unless the teacher explicitly enabled editing.
    if (existingIndex >= 0 && !this.allowEditing) return;

    const limitMs = question.timeLimitSec ? question.timeLimitSec * 1000 : null;
    let elapsedMs = Number.isFinite(msg.elapsedMs) ? Math.max(0, Math.floor(msg.elapsedMs)) : 0;
    if (limitMs !== null) elapsedMs = Math.min(elapsedMs, limitMs);

    const response: QuizResponse = {
      id: existingIndex >= 0 ? this.responses[existingIndex].id : uid("resp"),
      playerId: student.id,
      questionId: question.id,
      answerId: answer.id,
      correct: !!answer.correct,
      elapsedMs,
      points: pointsForAnswer(question, answer.id, elapsedMs),
      at: Date.now(),
    };
    if (existingIndex >= 0) this.responses[existingIndex] = response;
    else this.responses.push(response);
    // Quizizz-style live feedback: tell this student how THEIR pick scored and
    // which option is correct for this question (never the rest of the key).
    this.transport.send(token, {
      type: "answered",
      questionId: question.id,
      answerId: answer.id,
      correctAnswerId: this.correctAnswerIdFor(question.id),
      correct: !!answer.correct,
    });
    this.changed();
  }

  /**
   * Each student reports the question they are currently viewing — navigation
   * is fully independent per participant (never a shared room index).
   */
  private handleProgress(token: unknown, msg: Extract<StudentMessage, { type: "progress" }>): void {
    if (this.phase !== "playing") return;
    if (this.studentByToken.get(token) !== msg.studentId) return;
    const student = this.studentsById.get(msg.studentId);
    if (!student || student.status === "removed" || student.status === "completed") return;
    const raw = Number(msg.index);
    if (!Number.isFinite(raw)) return;
    const target = Math.max(0, Math.min(Math.floor(raw), this.room.questions.length));
    if (target === student.currentIndex) return;
    student.currentIndex = target;
    this.changed();
  }

  private handleComplete(token: unknown, studentId: string): void {
    if (this.phase !== "playing") return;
    if (this.studentByToken.get(token) !== studentId) return;
    const student = this.studentsById.get(studentId);
    if (!student || student.status === "removed" || student.status === "completed") return;
    student.status = "completed";
    student.completedAt = Date.now();
    student.currentIndex = this.room.questions.length;
    this.changed();
    this.checkAutoReveal();
  }

  /* ----------------------------- outbound ----------------------------- */

  start(): { ok: boolean; error?: string } {
    if (this.phase !== "lobby") return { ok: false, error: "The session has already started." };
    const active = this.activeStudents();
    if (active.length === 0) return { ok: false, error: "At least one student must join before you start." };
    this.phase = "playing";
    for (const studentId of this.tokenByStudent.keys()) {
      this.transport.send(this.tokenByStudent.get(studentId), { type: "started" });
    }
    this.changed();
    return { ok: true };
  }

  removeStudent(studentId: string): void {
    const student = this.studentsById.get(studentId);
    if (!student || student.status === "removed") return;
    student.status = "removed";
    student.connected = false;
    const token = this.tokenByStudent.get(studentId);
    if (token !== undefined) {
      this.transport.send(token, { type: "kicked", reason: "removed" });
      this.transport.drop?.(token);
      this.unbindToken(token);
    }
    this.changed();
    this.checkAutoReveal();
  }

  /** Teacher explicitly ends the session: finalize now, then reveal to everyone connected. */
  endQuiz(): void {
    if (this.phase !== "playing") return;
    this.finalize();
  }

  /** Teacher toggle: allow students to revise already-submitted answers. */
  setAllowEditing(value: boolean): void {
    const next = value === true;
    if (this.allowEditing === next) return;
    this.allowEditing = next;
    this.broadcastState();
    this.changed();
  }

  private broadcastState(): void {
    for (const studentId of this.tokenByStudent.keys()) this.sendState(studentId);
  }

  /** After a finished run, open a fresh session with the same quiz and code. */
  newSession(): void {
    if (this.phase !== "finished") return;
    this.phase = "lobby";
    this.finishedAt = null;
    this.responses = [];
    this.historySaved = false;
    for (const [studentId, student] of this.studentsById) {
      if (student.status === "removed") {
        this.studentsById.delete(studentId);
        continue;
      }
      student.status = "joined";
      student.completedAt = null;
      student.currentIndex = 0;
    }
    for (const studentId of this.tokenByStudent.keys()) {
      const token = this.tokenByStudent.get(studentId);
      if (token !== undefined) this.transport.send(token, { type: "session-reset" });
    }
    // Push a fresh state afterwards so students sync settings (e.g. editing
    // toggle) and see the lobby; it arrives after their local reset above.
    this.broadcastState();
    this.changed();
  }

  private checkAutoReveal(): void {
    if (this.phase !== "playing") return;
    const active = this.activeStudents();
    if (active.length === 0) return;
    if (active.every((s) => s.status === "completed")) this.finalize();
  }

  private finalize(): void {
    this.phase = "finished";
    this.finishedAt = Date.now();

    for (const student of this.activeStudents()) {
      const token = this.tokenByStudent.get(student.id);
      if (token === undefined) continue;
      this.transport.send(token, {
        type: "state",
        quiz: this.quiz,
        state: {
          phase: "finished",
          you: { id: student.id, name: student.name, status: student.status, currentIndex: student.currentIndex },
          answers: this.responses
            .filter((r) => r.playerId === student.id)
            .map((r) => this.toAnswerState(r)),
          reveal: this.revealFor(student.id),
          allowEditing: this.allowEditing,
        },
      });
    }

    if (!this.historySaved) {
      this.historySaved = true;
      const players = this.activeStudents().map(toPlayer);
      this.transport.persistHistory(
        buildHistoryEntry(this.room, players, this.responses, this.finishedAt),
      );
    }
    this.changed();
  }

  /** Snapshot for localStorage — powers refresh recovery and admin status badges. */
  snapshot(): QuizSessionRecord {
    const now = Date.now();
    return {
      players: [...this.studentsById.values()]
        .filter((s) => s.status !== "removed")
        .map((s) => ({
          id: s.id,
          name: s.name,
          joinedAt: s.joinedAt,
          status: s.status,
          connected: s.connected,
          completedAt: s.completedAt,
          currentIndex: s.currentIndex,
        })),
      session: {
        roomCode: normalizeCode(this.room.code),
        status: this.phase === "lobby" ? "lobby" : this.phase === "playing" ? "question" : "finished",
        allowEditing: this.allowEditing,
        currentQuestionIndex: 0,
        turnOrder: [],
        turnIndex: 0,
        questionStartedAt: null,
        responses: this.responses.map((r) => ({ ...r })),
        updatedAt: now,
        completedAt: this.phase === "finished" ? this.finishedAt : null,
      },
    };
  }

  /* ------------------------------ plumbing ---------------------------- */

  private bindToken(studentId: string, token: unknown): void {
    const previousToken = this.tokenByStudent.get(studentId);
    if (previousToken !== undefined && previousToken !== token) {
      this.studentByToken.delete(previousToken);
    }
    const previousStudent = this.studentByToken.get(token);
    if (previousStudent !== undefined && previousStudent !== studentId) {
      this.tokenByStudent.delete(previousStudent);
    }
    this.tokenByStudent.set(studentId, token);
    this.studentByToken.set(token, studentId);
  }

  private unbindToken(token: unknown): void {
    const studentId = this.studentByToken.get(token);
    if (studentId !== undefined) {
      this.studentByToken.delete(token);
      this.tokenByStudent.delete(studentId);
    }
  }

  private changed(): void {
    this.transport.persistSession(this.snapshot());
    this.transport.onChange();
  }
}

function toPlayer(student: ClassroomStudent): QuizPlayer {
  return {
    id: student.id,
    name: student.name,
    joinedAt: student.joinedAt,
    status: student.status,
    connected: student.connected,
    completedAt: student.completedAt,
  };
}
