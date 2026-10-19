import assert from "node:assert";
import { createGame, startGame, drawParticipant, openBox, repeatRound, resetGame, remainingThisCycle } from "../lib/boxes";
import { buildContentsOrder } from "../lib/randomization";
import type { BoxConfig, BoxContent } from "../types/boxes";
import { castVote, computeResults, createEmptyRoom, isVotingOpen, validateBallot } from "../lib/voting";
import type { VotingRoom, VotingRoomRecord } from "../types/voting";
import { computeScores, pointsForAnswer, createEmptyRoom as createQuizRoom, validateRoom, buildHistoryEntry, addHistoryEntry, removeQuizHistory, formatTotalTime, QUIZ_HISTORY_LIMIT, flattenQuizResults, rankQuizResults, scorePercent, summarizeQuizResults, hardestQuestions } from "../lib/quiz";
import type { QuizHistoryMap, QuizPlayer, QuizQuestion, QuizResponse, QuizRoom } from "../types/quiz";

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

console.log("Random Boxes: 40 participants / 30 boxes no-repeat cycle");
const participants = Array.from({ length: 40 }, (_, i) => `P${i + 1}`);
const contents: BoxContent[] = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i}`,
  type: "gift",
  text: `gift ${i}`,
}));
const config: BoxConfig = {
  id: "cfg",
  name: "test",
  boxCount: 30,
  participants,
  contents,
  createdAt: 0,
  updatedAt: 0,
};

ok("createGame builds full box set", () => {
  const g = createGame(config);
  assert.equal(g.availableBoxes.length, 30);
  assert.equal(g.cycleQueue.length, 40);
  assert.equal(g.contentsOrder.length, 30);
});

ok("40 names / 30 boxes: first cycle uses each name once, remaining 10 carry over", () => {
  let g = startGame(createGame(config), config);
  const seen: string[] = [];
  // open 30 boxes (one per turn)
  for (let i = 0; i < 30; i += 1) {
    const draw = drawParticipant(g, config);
    g = draw.game;
    assert.ok(draw.participant, "expected a participant");
    seen.push(draw.participant!);
    const res = openBox(g, config, g.availableBoxes[0]);
    assert.ok(res.selection, "expected selection");
    g = res.game;
  }
  assert.equal(new Set(seen).size, 30, "no participant repeats within first 30 turns");
  assert.equal(g.availableBoxes.length, 0, "all boxes opened");
  assert.equal(remainingThisCycle(g), 10, "10 participants remain in the cycle");

  // Repeat round without disturbing the cycle
  const beforeQueue = g.cycleQueue.slice();
  g = repeatRound(g, config);
  assert.equal(g.availableBoxes.length, 30, "boxes refilled");
  assert.deepEqual(g.cycleQueue, beforeQueue, "cycle queue untouched by repeat");
  assert.equal(g.cycle, 1, "cycle number unchanged");

  // remaining 10 finish the cycle, then a new cycle starts
  const seen2: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const draw = drawParticipant(g, config);
    g = draw.game;
    seen2.push(draw.participant!);
    g = openBox(g, config, g.availableBoxes[0]).game;
  }
  assert.equal(remainingThisCycle(g), 0, "cycle exhausted");
  assert.equal(new Set([...seen, ...seen2]).size, 40, "all 40 participated exactly once in cycle 1");

  const nextDraw = drawParticipant(g, config);
  assert.equal(nextDraw.newCycle, true, "new cycle auto-starts");
  assert.equal(nextDraw.game.cycle, 2, "cycle number incremented");
});

ok("cannot open a box twice or twice in a row without drawing", () => {
  let g = startGame(createGame(config), config);
  const draw = drawParticipant(g, config);
  g = draw.game;
  const box = g.availableBoxes[0];
  const first = openBox(g, config, box);
  assert.ok(first.selection);
  g = first.game;
  const second = openBox(g, config, box);
  assert.equal(second.selection, null, "second open rejected (phase revealed)");
});

ok("resetGame clears history and cycle", () => {
  let g = startGame(createGame(config), config);
  g = drawParticipant(g, config).game;
  g = openBox(g, config, g.availableBoxes[0]).game;
  const reset = resetGame(config);
  assert.equal(reset.history.length, 0);
  assert.equal(reset.cycle, 1);
  assert.equal(reset.status, "idle");
});

console.log("Randomization");
ok("buildContentsOrder fills exactly boxCount", () => {
  const order = buildContentsOrder(contents, 7);
  assert.equal(order.length, 7);
});

console.log("Voting");
function makeRoom(): VotingRoom {
  const room = createEmptyRoom();
  room.title = "Test";
  room.mode = "single";
  room.allowChange = false;
  room.resultsVisibility = "during";
  room.durationMinutes = null;
  room.closesAt = null;
  room.questions = [
    {
      id: "q1",
      text: "Pick one",
      options: [
        { id: "o1", text: "A" },
        { id: "o2", text: "B" },
        { id: "o3", text: "C" },
      ],
    },
  ];
  return room;
}

ok("single-choice requires exactly one option", () => {
  const room = makeRoom();
  assert.equal(validateBallot(room, { q1: [] }, false).ok, false);
  assert.equal(validateBallot(room, { q1: ["o1", "o2"] }, false).ok, false);
  assert.equal(validateBallot(room, { q1: ["o1"] }, false).ok, true);
});

ok("duplicate votes blocked when changes disabled, allowed when enabled", () => {
  const room = makeRoom();
  const first = castVote(room, [], "Alex", { q1: ["o1"] });
  assert.equal(first.ok, true);
  const dup = castVote(room, first.votes, "Alex", { q1: ["o2"] });
  assert.equal(dup.ok, false, "second vote rejected");
  const roomChange = { ...room, allowChange: true };
  const change = castVote(roomChange, first.votes, "Alex", { q1: ["o2"] });
  assert.equal(change.ok, true);
  assert.equal(change.votes.length, 1, "ballot replaced, not duplicated");
  assert.deepEqual(change.votes[0].answers.q1, ["o2"]);
});

ok("results compute totals, percentages and ranks with ties", () => {
  const room = makeRoom();
  let votes: VotingRoomRecord["votes"] = [];
  votes = castVote(room, votes, "a", { q1: ["o1"] }).votes;
  votes = castVote(room, votes, "b", { q1: ["o1"] }).votes;
  votes = castVote(room, votes, "c", { q1: ["o2"] }).votes;
  const results = computeResults(room, votes);
  const byId = Object.fromEntries(results[0].options.map((o) => [o.optionId, o]));
  assert.equal(byId.o1.votes, 2);
  assert.equal(byId.o2.votes, 1);
  assert.equal(byId.o1.rank, 1);
  assert.equal(byId.o2.rank, 2);
  assert.equal(byId.o3.rank, 3);
  assert.equal(results[0].totalVotes, 3);
});

ok("expired rooms are not open", () => {
  const room = makeRoom();
  room.closesAt = Date.now() - 1000;
  assert.equal(isVotingOpen(room), false);
});

console.log("Quiz");
function quizQuestion(): QuizQuestion {
  return {
    id: "q1",
    text: "2+2?",
    points: 100,
    timeLimitSec: 20,
    speedBonus: true,
    answers: [
      { id: "a1", text: "4", correct: true },
      { id: "a2", text: "5", correct: false },
    ],
  };
}

ok("points: correct only, with speed bonus scaling", () => {
  const q = quizQuestion();
  assert.equal(pointsForAnswer(q, "a2", 0), 0);
  const instant = pointsForAnswer(q, "a1", 0);
  const slow = pointsForAnswer(q, "a1", 20000);
  assert.equal(instant, 150, "instant gives full bonus");
  assert.equal(slow, 100, "no bonus at deadline");
  assert.ok(instant > slow);
});

ok("scores rank, count correct/incorrect/unanswered and accuracy", () => {
  const room: QuizRoom = { ...createQuizRoom(), title: "t", questions: [{ ...quizQuestion(), id: "q1" }, { ...quizQuestion(), id: "q2", text: "3+3?" }] };
  const players: QuizPlayer[] = [
    { id: "p1", name: "Ann", joinedAt: 0 },
    { id: "p2", name: "Ben", joinedAt: 0 },
  ];
  const responses: QuizResponse[] = [
    { id: "r1", playerId: "p1", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 1000, points: 148, at: 0 },
    { id: "r2", playerId: "p1", questionId: "q2", answerId: "a2", correct: false, elapsedMs: 1000, points: 0, at: 0 },
    { id: "r3", playerId: "p2", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 4000, points: 135, at: 0 },
    // p2 missed q2
  ];
  const scores = computeScores(room, players, responses);
  assert.equal(scores[0].name, "Ann");
  assert.equal(scores[0].rank, 1);
  assert.equal(scores[0].points, 148);
  assert.equal(scores[0].correct, 1);
  assert.equal(scores[0].incorrect, 1);
  assert.equal(scores[0].unanswered, 0);
  assert.equal(scores[0].accuracy, 50);
  assert.equal(scores[0].totalTimeMs, 2000, "Ann's total time = 1000 + 1000");
  assert.equal(scores[1].name, "Ben");
  assert.equal(scores[1].unanswered, 1);
  assert.equal(scores[1].accuracy, 100);
  assert.equal(scores[1].totalTimeMs, 4000, "Ben's total time = only his one recorded answer");
});

ok("tied players share the same rank", () => {
  const room: QuizRoom = { ...createQuizRoom(), title: "t", questions: [{ ...quizQuestion(), id: "q1" }] };
  const players: QuizPlayer[] = [
    { id: "p1", name: "Ann", joinedAt: 0 },
    { id: "p2", name: "Ben", joinedAt: 0 },
  ];
  const responses: QuizResponse[] = [
    { id: "r1", playerId: "p1", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 1000, points: 148, at: 0 },
    { id: "r2", playerId: "p2", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 2000, points: 148, at: 0 },
  ];
  const scores = computeScores(room, players, responses);
  assert.equal(scores[0].rank, 1);
  assert.equal(scores[1].rank, 1, "identical points + correct share rank 1");
});

ok("players with no answers get zero accuracy and zero time", () => {
  const room: QuizRoom = { ...createQuizRoom(), title: "t", questions: [{ ...quizQuestion(), id: "q1" }] };
  const players: QuizPlayer[] = [{ id: "p1", name: "Ann", joinedAt: 0 }];
  const scores = computeScores(room, players, []);
  assert.equal(scores[0].accuracy, 0);
  assert.equal(scores[0].totalTimeMs, 0);
  assert.equal(scores[0].unanswered, 1);
  assert.equal(formatTotalTime(0), "—");
});

ok("history entries are stored per quiz, capped and removable", () => {
  const room: QuizRoom = { ...createQuizRoom(), code: "QUIZ1", title: "Trivia", questions: [{ ...quizQuestion(), id: "q1" }] };
  const players: QuizPlayer[] = [{ id: "p1", name: "Ann", joinedAt: 0 }];
  const responses: QuizResponse[] = [
    { id: "r1", playerId: "p1", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 1500, points: 140, at: 0 },
  ];
  let map: QuizHistoryMap = {};
  const entry = buildHistoryEntry(room, players, responses, 123);
  assert.equal(entry.roomCode, "QUIZ1");
  assert.equal(entry.finishedAt, 123);
  assert.equal(entry.scores[0].points, 140);
  map = addHistoryEntry(map, entry);
  assert.equal(map.QUIZ1.length, 1);
  assert.equal(map.QUIZ1[0].scores[0].name, "Ann");
  // cap
  for (let i = 0; i < QUIZ_HISTORY_LIMIT + 5; i += 1) {
    map = addHistoryEntry(map, buildHistoryEntry(room, players, responses, 1000 + i));
  }
  assert.equal(map.QUIZ1.length, QUIZ_HISTORY_LIMIT, "history capped per quiz");
  map = removeQuizHistory(map, "QUIZ1");
  assert.equal(map.QUIZ1, undefined, "history removed for the quiz only");
  assert.equal(formatTotalTime(65000), "1m 05s");
});

ok("history entries snapshot questions; later room edits do not rewrite history", () => {
  const original = quizQuestion();
  const room: QuizRoom = { ...createQuizRoom(), code: "SNAP", title: "Snap", questions: [{ ...original, answers: original.answers.map((a) => ({ ...a })) }] };
  const entry = buildHistoryEntry(room, [{ id: "p1", name: "Ann", joinedAt: 0 }], [], 10);
  assert.equal(entry.questions?.length, 1);
  assert.equal(entry.questions?.[0].text, original.text);
  assert.equal(entry.questions?.[0].answers.length, original.answers.length);
  // Mutating the live room after the fact must not touch the snapshot.
  room.questions[0].text = "CHANGED";
  room.questions[0].answers[0].correct = false;
  assert.equal(entry.questions?.[0].text, "2+2?", "snapshot immune to later edits");
  assert.equal(entry.questions?.[0].answers[0].correct, true);
});

ok("flattenQuizResults builds rows; legacy entries without questions still work", () => {
  const room: QuizRoom = {
    ...createQuizRoom(),
    code: "FLAT",
    title: "Flat quiz",
    questions: [{ ...quizQuestion(), id: "q1" }, { ...quizQuestion(), id: "q2" }],
  };
  const players: QuizPlayer[] = [
    { id: "p1", name: "Ann", joinedAt: 0, completedAt: 5000 },
    { id: "p2", name: "Ben", joinedAt: 0 },
  ];
  const responses: QuizResponse[] = [
    { id: "r1", playerId: "p1", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 1000, points: 100, at: 0 },
    { id: "r2", playerId: "p1", questionId: "q2", answerId: "a2", correct: false, elapsedMs: 2000, points: 0, at: 0 },
    { id: "r3", playerId: "p2", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 3000, points: 100, at: 0 },
  ];
  const map: QuizHistoryMap = { FLAT: [buildHistoryEntry(room, players, responses, 999)] };
  const rows = flattenQuizResults(map);
  assert.equal(rows.length, 2, "one row per participant");
  const ann = rows.find((r) => r.name === "Ann")!;
  assert.equal(ann.completed, true, "completedAt marks the row completed");
  assert.equal(ann.points, 100);
  assert.equal(ann.correct, 1);
  assert.equal(ann.incorrect, 1);
  assert.equal(ann.unanswered, 0);
  assert.equal(ann.responses.length, 2, "row carries the participant's responses");
  assert.equal(ann.questions.length, 2, "row carries the question snapshot");
  const ben = rows.find((r) => r.name === "Ben")!;
  assert.equal(ben.completed, false, "no completedAt and unanswered questions → incomplete");
  // Legacy entry (pre-snapshot schema) must still flatten without crashing.
  const { questions: _drop, ...legacy } = map.FLAT[0];
  const legacyRows = flattenQuizResults({ FLAT: [legacy] });
  assert.equal(legacyRows.length, 2);
  assert.equal(legacyRows[0].questions.length, 0, "legacy rows have no snapshot");
  assert.equal(legacyRows[0].maxPoints, 0);
  assert.equal(scorePercent(legacyRows[0]), null, "no max points → no percentage");
});

ok("rankQuizResults shares ranks on ties; scorePercent uses base points", () => {
  const base = {
    runId: "r", roomCode: "X", quizTitle: "X", finishedAt: 0, playerId: "p",
    incorrect: 0, unanswered: 0, accuracy: 100, totalTimeMs: 0, rank: 0,
    completed: true, completedAt: 0, questionCount: 1, questions: [], responses: [],
    maxPoints: 200,
  };
  const rows = rankQuizResults([
    { ...base, playerId: "a", name: "Ann", points: 150, correct: 1 },
    { ...base, playerId: "b", name: "Ben", points: 150, correct: 1 },
    { ...base, playerId: "c", name: "Cleo", points: 200, correct: 2 },
  ]);
  assert.equal(rows[0].name, "Cleo");
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2, "Ann and Ben tie at rank 2");
  assert.equal(rows[2].rank, 2, "tied pair shares rank");
  assert.equal(scorePercent({ points: 150, maxPoints: 200 }), 75);
  assert.equal(scorePercent({ points: 150, maxPoints: 0 }), null);
});

ok("summarizeQuizResults and hardestQuestions aggregate correctly", () => {
  const mkQuestion = (id: string, text: string) => ({
    ...quizQuestion(), id, text,
    answers: [
      { id: "a1", text: "right", correct: true },
      { id: "a2", text: "wrong", correct: false },
    ],
  });
  const room: QuizRoom = {
    ...createQuizRoom(), code: "STAT", title: "Stats",
    questions: [mkQuestion("q1", "Easy one"), mkQuestion("q2", "Hard one")],
  };
  const players: QuizPlayer[] = [
    { id: "p1", name: "Ann", joinedAt: 0, completedAt: 1 },
    { id: "p2", name: "Ben", joinedAt: 0, completedAt: 2 },
  ];
  // Both players get q1 right; both get q2 wrong.
  const responses: QuizResponse[] = [
    { id: "r1", playerId: "p1", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 1000, points: 100, at: 0 },
    { id: "r2", playerId: "p1", questionId: "q2", answerId: "a2", correct: false, elapsedMs: 1000, points: 0, at: 0 },
    { id: "r3", playerId: "p2", questionId: "q1", answerId: "a1", correct: true, elapsedMs: 2000, points: 100, at: 0 },
    { id: "r4", playerId: "p2", questionId: "q2", answerId: "a2", correct: false, elapsedMs: 2000, points: 0, at: 0 },
  ];
  const map: QuizHistoryMap = { STAT: [buildHistoryEntry(room, players, responses, 7)] };
  const rows = flattenQuizResults(map);

  const summary = summarizeQuizResults(rows);
  assert.equal(summary.participants, 2);
  assert.equal(summary.completed, 2);
  assert.equal(summary.avgScore, 100);
  assert.equal(summary.highScore, 100);
  assert.equal(summary.correctRate, 50, "2 of 4 answered questions correct");

  const hardest = hardestQuestions(rows, 5);
  assert.equal(hardest.length, 2);
  assert.equal(hardest[0].questionId, "q2", "most wrong first");
  assert.equal(hardest[0].text, "Hard one");
  assert.equal(hardest[0].wrongCount, 2);
  assert.equal(hardest[0].wrongRate, 100);
  assert.equal(hardest[1].questionId, "q1");
  assert.equal(hardest[1].wrongCount, 0);

  assert.deepEqual(summarizeQuizResults([]), { participants: 0, completed: 0, avgScore: 0, highScore: 0, correctRate: 0 });
});

ok("validateRoom rejects empty title, missing correct answer", () => {
  const room = createQuizRoom();
  assert.equal(validateRoom(room).ok, false);
});

console.log(`\nAll ${passed} logic checks passed.`);
