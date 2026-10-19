export interface QuizAnswer {
  id: string;
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  answers: QuizAnswer[];
  /** Points awarded for a correct answer. */
  points: number;
  /** Time limit in seconds, or null when the timer is disabled. */
  timeLimitSec: number | null;
  /** Award extra points for answering quickly. */
  speedBonus: boolean;
}

export type CorrectVisibility = "afterEach" | "atEnd";

export type QuizRoomStatus = "draft" | "published";

export interface QuizRoom {
  code: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  correctVisibility: CorrectVisibility;
  /** Draft rooms are still being edited; published rooms can be played. */
  status: QuizRoomStatus;
  createdAt: number;
}

export type QuizStudentStatus = "joined" | "playing" | "completed" | "removed";

export interface QuizPlayer {
  id: string;
  name: string;
  joinedAt: number;
  /** Classroom session status (teacher-hosted shared rooms). */
  status?: QuizStudentStatus;
  /** Whether the student's device is currently connected. */
  connected?: boolean;
  completedAt?: number | null;
  /** Highest question index the student reported reaching (classroom sessions). */
  currentIndex?: number;
}

export interface QuizResponse {
  id: string;
  playerId: string;
  questionId: string;
  answerId: string;
  correct: boolean;
  elapsedMs: number;
  points: number;
  at: number;
}

export type QuizSessionStatus = "lobby" | "question" | "reveal" | "finished";

export interface QuizSession {
  roomCode: string;
  status: QuizSessionStatus;
  currentQuestionIndex: number;
  /** Teacher toggle: students may revise submitted answers while the quiz runs. */
  allowEditing?: boolean;
  /** Player ids in the order they answer each question. */
  turnOrder: string[];
  /** Index into turnOrder. */
  turnIndex: number;
  questionStartedAt: number | null;
  responses: QuizResponse[];
  updatedAt: number;
  /** Timestamp captured when the quiz reached "finished" (used for history dedupe). */
  completedAt?: number | null;
}

/** Everything about a live quiz session, stored separately from the room config. */
export interface QuizSessionRecord {
  players: QuizPlayer[];
  session: QuizSession;
}

export interface QuizPlayerScore {
  playerId: string;
  name: string;
  points: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number;
  /** Sum of the valid recorded answer times, in milliseconds. */
  totalTimeMs: number;
  rank: number;
}

/**
 * A saved snapshot of one completed quiz run.
 * Stored separately per quiz code so results survive refreshes and restarts.
 */
export interface QuizHistoryEntry {
  id: string;
  roomCode: string;
  title: string;
  finishedAt: number;
  questionCount: number;
  playerCount: number;
  players: QuizPlayer[];
  scores: QuizPlayerScore[];
  responses: QuizResponse[];
  /**
   * Snapshot of the questions as they were when the run finished.
   * Optional: older saved runs (before this field existed) or rooms edited
   * after the fact simply have no text/choices to display — the numeric
   * scores and response verdicts still work without it.
   */
  questions?: QuizQuestion[];
}

/** Per-quiz map of saved results, newest first. */
export type QuizHistoryMap = Record<string, QuizHistoryEntry[]>;
