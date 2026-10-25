import type { SaveTracking } from "@/types/persistence";

export type BoxContentType = "question" | "challenge" | "task" | "gift" | "text";

export interface BoxContent {
  id: string;
  type: BoxContentType;
  text: string;
}

export interface BoxConfig extends SaveTracking {
  id: string;
  name: string;
  boxCount: number;
  participants: string[];
  contents: BoxContent[];
  createdAt: number;
  updatedAt: number;
}

export interface BoxSelection {
  id: string;
  participant: string;
  boxIndex: number;
  content: BoxContent;
  round: number;
  cycle: number;
  at: number;
}

export type BoxGameStatus = "idle" | "running" | "paused" | "finished";
export type BoxGamePhase = "waiting" | "selecting" | "revealed";

export interface BoxGame {
  configId: string;
  status: BoxGameStatus;
  phase: BoxGamePhase;
  /** Box round: how many times the box contents have been (re)filled. */
  round: number;
  /** Participant cycle: one cycle = every participant gets one turn. */
  cycle: number;
  /** Remaining participants in the current cycle (shuffled). */
  cycleQueue: string[];
  /** Everyone that still has to play in the current cycle, including current. */
  currentParticipant: string | null;
  /** Box indexes still available to open in the current round. */
  availableBoxes: number[];
  /** Shuffled box content for each box index in the current round. */
  contentsOrder: BoxContent[];
  history: BoxSelection[];
  lastResult: BoxSelection | null;
  updatedAt: number;
}
