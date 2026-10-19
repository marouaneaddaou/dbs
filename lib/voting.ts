import type {
  OptionResult,
  QuestionResult,
  VoteBallot,
  VotingRoom,
  VotingRoomRecord,
} from "@/types/voting";
import { generateRoomCode, uid } from "@/lib/storage";

/** A room is expired when it has a deadline and that deadline has passed. */
export function isRoomExpired(room: VotingRoom, now: number = Date.now()): boolean {
  return room.closesAt !== null && now >= room.closesAt;
}

/** Voting is effectively open when status is open and the deadline hasn't passed. */
export function isVotingOpen(room: VotingRoom, now: number = Date.now()): boolean {
  if (room.status !== "open") return false;
  if (room.closesAt !== null && now >= room.closesAt) return false;
  return true;
}

/** Normalize a user-entered code so "ab-12 cd" matches "AB12CD". */
export function normalizeCode(input: string): string {
  return input.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function findRoomByCode(records: VotingRoomRecord[], code: string): VotingRoomRecord | undefined {
  const target = normalizeCode(code);
  if (!target) return undefined;
  return records.find((r) => normalizeCode(r.room.code) === target);
}

export interface BallotValidation {
  ok: boolean;
  error?: string;
}

/** Validate a ballot against the room settings before storing it. */
export function validateBallot(
  room: VotingRoom,
  answers: Record<string, string[]>,
  alreadyVoted: boolean,
): BallotValidation {
  if (room.status !== "open") {
    return { ok: false, error: "This poll is closed." };
  }
  if (isRoomExpired(room)) {
    return { ok: false, error: "The voting deadline has passed." };
  }
  if (alreadyVoted && !room.allowChange) {
    return { ok: false, error: "You have already voted and changes are disabled." };
  }
  for (const question of room.questions) {
    const picked = answers[question.id] ?? [];
    if (picked.length === 0) {
      return { ok: false, error: "Please answer every question before submitting." };
    }
    if (room.mode === "single" && picked.length !== 1) {
      return { ok: false, error: "Only one option per question is allowed." };
    }
    const validIds = new Set(question.options.map((o) => o.id));
    if (picked.some((id) => !validIds.has(id))) {
      return { ok: false, error: "Your ballot contains an unknown option." };
    }
    if (new Set(picked).size !== picked.length) {
      return { ok: false, error: "Duplicate options are not allowed." };
    }
  }
  return { ok: true };
}

export interface CastVoteResult {
  ok: boolean;
  error?: string;
  votes: VoteBallot[];
}

/** Add or replace a ballot depending on room settings. Pure helper. */
export function castVote(
  room: VotingRoom,
  votes: VoteBallot[],
  voter: string,
  answers: Record<string, string[]>,
): CastVoteResult {
  const cleanVoter = voter.trim();
  if (!cleanVoter) return { ok: false, error: "Please enter a username.", votes };
  const existingIndex = votes.findIndex((v) => v.voter.toLowerCase() === cleanVoter.toLowerCase());
  const validation = validateBallot(room, answers, existingIndex >= 0);
  if (!validation.ok) return { ok: false, error: validation.error, votes };

  const ballot: VoteBallot = {
    id: existingIndex >= 0 ? votes[existingIndex].id : uid("vote"),
    voter: cleanVoter,
    answers,
    at: Date.now(),
  };
  if (existingIndex >= 0) {
    const next = votes.slice();
    next[existingIndex] = ballot;
    return { ok: true, votes: next };
  }
  return { ok: true, votes: [...votes, ballot] };
}

function rankOptions(options: OptionResult[]): OptionResult[] {
  const sorted = options.slice().sort((a, b) => b.votes - a.votes);
  let rank = 0;
  let prevVotes = -1;
  return sorted.map((opt, index) => {
    if (opt.votes !== prevVotes) {
      rank = index + 1;
      prevVotes = opt.votes;
    }
    return { ...opt, rank };
  });
}

/** Compute per-question totals, percentages and competition ranking (ties share a rank). */
export function computeResults(room: VotingRoom, votes: VoteBallot[]): QuestionResult[] {
  return room.questions.map((question) => {
    const counts = new Map<string, number>();
    for (const option of question.options) counts.set(option.id, 0);
    let total = 0;
    for (const ballot of votes) {
      const picked = ballot.answers[question.id] ?? [];
      for (const optionId of picked) {
        if (!counts.has(optionId)) continue;
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
        total += 1;
      }
    }
    const base: OptionResult[] = question.options.map((option) => {
      const count = counts.get(option.id) ?? 0;
      return {
        optionId: option.id,
        text: option.text,
        votes: count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        rank: 0,
      };
    });
    return {
      questionId: question.id,
      text: question.text,
      totalVotes: total,
      options: rankOptions(base),
    };
  });
}

export function createEmptyRoom(): VotingRoom {
  const now = Date.now();
  return {
    code: generateRoomCode(),
    title: "",
    description: "",
    questions: [],
    mode: "single",
    allowChange: true,
    resultsVisibility: "after",
    durationMinutes: null,
    openedAt: now,
    closesAt: null,
    status: "open",
    createdAt: now,
  };
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}
