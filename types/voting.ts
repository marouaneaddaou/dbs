import type { SaveTracking } from "@/types/persistence";

export type VoteMode = "single" | "multiple";
export type ResultsVisibility = "during" | "after";
export type VotingStatus = "draft" | "open" | "closed";

export interface VotingOption {
  id: string;
  text: string;
}

export interface VotingQuestion {
  id: string;
  text: string;
  options: VotingOption[];
}

export interface VotingRoom extends SaveTracking {
  code: string;
  title: string;
  description: string;
  questions: VotingQuestion[];
  mode: VoteMode;
  allowChange: boolean;
  resultsVisibility: ResultsVisibility;
  /** Duration in minutes, or null for unlimited. */
  durationMinutes: number | null;
  openedAt: number;
  closesAt: number | null;
  status: VotingStatus;
  createdAt: number;
}

export interface VoteBallot {
  id: string;
  voter: string;
  /** questionId -> selected optionIds */
  answers: Record<string, string[]>;
  at: number;
}

export interface VotingRoomRecord {
  room: VotingRoom;
  votes: VoteBallot[];
}

export interface OptionResult {
  optionId: string;
  text: string;
  votes: number;
  percentage: number;
  rank: number;
}

export interface QuestionResult {
  questionId: string;
  text: string;
  totalVotes: number;
  options: OptionResult[];
}
