import type { BoxConfig, BoxContent, BoxGame, BoxSelection } from "@/types/boxes";
import { buildBoxIndexes, buildContentsOrder, shuffle } from "@/lib/randomization";
import { uid } from "@/lib/storage";

export const EMPTY_BOX_CONTENT: BoxContent = {
  id: "empty",
  type: "text",
  text: "This box is empty.",
};

/** Start a brand new game for a config (status stays idle until "Start"). */
export function createGame(config: BoxConfig): BoxGame {
  return {
    configId: config.id,
    status: "idle",
    phase: "waiting",
    round: 1,
    cycle: 1,
    cycleQueue: shuffle(config.participants),
    currentParticipant: null,
    availableBoxes: buildBoxIndexes(config.boxCount),
    contentsOrder: buildContentsOrder(config.contents, config.boxCount),
    history: [],
    lastResult: null,
    updatedAt: Date.now(),
  };
}

export function startGame(game: BoxGame, config: BoxConfig): BoxGame {
  // Starting a fresh game when idle; resuming otherwise.
  if (game.status === "idle") {
    return { ...createGame(config), status: "running", updatedAt: Date.now() };
  }
  return { ...game, status: "running", updatedAt: Date.now() };
}

export function pauseGame(game: BoxGame): BoxGame {
  return { ...game, status: "paused", updatedAt: Date.now() };
}

export function resumeGame(game: BoxGame): BoxGame {
  return { ...game, status: "running", updatedAt: Date.now() };
}

export function resetGame(config: BoxConfig): BoxGame {
  return { ...createGame(config), status: "idle", updatedAt: Date.now() };
}

/** How many participants have not taken their turn in the current cycle yet. */
export function remainingThisCycle(game: BoxGame): number {
  return game.cycleQueue.length + (game.currentParticipant ? 1 : 0);
}

export interface DrawResult {
  game: BoxGame;
  /** The participant chosen, or null when nobody could be drawn. */
  participant: string | null;
  /** True when a new cycle started as a result of this draw. */
  newCycle: boolean;
}

/**
 * Draw the next participant.
 *
 * - Participants are consumed from a shuffled queue so nobody repeats until
 *   everyone has had exactly one turn (one full cycle).
 * - When the queue empties, a fresh cycle begins with a newly shuffled order.
 */
export function drawParticipant(game: BoxGame, config: BoxConfig): DrawResult {
  if (game.currentParticipant) {
    return { game, participant: game.currentParticipant, newCycle: false };
  }
  if (config.participants.length === 0) {
    return { game, participant: null, newCycle: false };
  }

  let queue = game.cycleQueue.filter((name) => config.participants.includes(name));
  let cycle = game.cycle;
  let newCycle = false;

  if (queue.length === 0) {
    queue = shuffle(config.participants);
    cycle += 1;
    newCycle = true;
  }

  const currentParticipant = queue[0];
  queue = queue.slice(1);

  return {
    game: {
      ...game,
      cycle,
      cycleQueue: queue,
      currentParticipant,
      phase: "selecting",
      updatedAt: Date.now(),
    },
    participant: currentParticipant,
    newCycle,
  };
}

export interface OpenResult {
  game: BoxGame;
  selection: BoxSelection | null;
  error?: string;
}

/**
 * Open a box for the current participant, record the result, and move the game
 * into the "revealed" phase. Guards against duplicate or out-of-turn actions.
 */
export function openBox(game: BoxGame, config: BoxConfig, boxIndex: number): OpenResult {
  if (game.status !== "running") {
    return { game, selection: null, error: "The game is not running." };
  }
  if (game.phase !== "selecting" || !game.currentParticipant) {
    return { game, selection: null, error: "Draw a participant first." };
  }
  if (!game.availableBoxes.includes(boxIndex)) {
    return { game, selection: null, error: "That box is already open." };
  }

  const content = game.contentsOrder[boxIndex] ?? EMPTY_BOX_CONTENT;
  const selection: BoxSelection = {
    id: uid("sel"),
    participant: game.currentParticipant,
    boxIndex,
    content,
    round: game.round,
    cycle: game.cycle,
    at: Date.now(),
  };

  return {
    game: {
      ...game,
      availableBoxes: game.availableBoxes.filter((i) => i !== boxIndex),
      phase: "revealed",
      currentParticipant: null,
      lastResult: selection,
      history: [...game.history, selection],
      updatedAt: Date.now(),
    },
    selection,
  };
}

/**
 * Refill the boxes for a new round with freshly shuffled content.
 * IMPORTANT: this never touches the participant cycle or its queue.
 */
export function repeatRound(game: BoxGame, config: BoxConfig): BoxGame {
  return {
    ...game,
    round: game.round + 1,
    availableBoxes: buildBoxIndexes(config.boxCount),
    contentsOrder: buildContentsOrder(config.contents, config.boxCount),
    updatedAt: Date.now(),
  };
}

export function allBoxesOpened(game: BoxGame): boolean {
  return game.availableBoxes.length === 0;
}

export function createEmptyConfig(): BoxConfig {
  const now = Date.now();
  return {
    id: uid("cfg"),
    name: "New box game",
    boxCount: 6,
    participants: [],
    contents: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Box numbers (1-based) that have no content yet — used for validation. */
export function emptyBoxNumbers(config: BoxConfig): number[] {
  return Array.from({ length: config.boxCount }, (_, i) => i + 1).filter(
    (n) => !(config.contents[n - 1]?.text.trim() ?? ""),
  );
}
