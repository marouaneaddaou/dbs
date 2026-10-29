import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BOX_GROUPS } from "../lib/box-groups";
import { membershipNamesForIds, normalizeParticipantName } from "../lib/participants";
import type { SharedStateDocument } from "../lib/shared/schema";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "1234";
const GROUP = BOX_GROUPS[0];
const TEST_NAME = `E2E Persist ${Date.now()}`;

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failures.push(name);
    console.error(`  FAIL - ${name}`);
  }
}

async function login(context: BrowserContext) {
  const res = await context.request.post(`${BASE}/api/admin/login/`, {
    data: { password: ADMIN_PASSWORD },
  });
  if (!res.ok()) throw new Error(`admin login failed: ${res.status()}`);
}

async function openBoxes(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await login(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("  [pageerror]", error.message));
  await page.goto(`${BASE}/boxes/`);
  await page.getByRole("heading", { name: "Zufallsboxen" }).first().waitFor({ state: "visible", timeout: 30_000 });
  return { context, page };
}

async function openGroup(page: Page) {
  await page
    .getByRole("button", { name: new RegExp(GROUP.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    .first()
    .click();
  await page.getByText("Spieleinrichtung", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
}

async function readParticipants(page: Page) {
  const inputs = page.locator("li input:not([aria-label])");
  const values: string[] = [];
  for (let index = 0; index < (await inputs.count()); index += 1) {
    values.push(await inputs.nth(index).inputValue());
  }
  return values;
}

async function waitForParticipant(page: Page, name: string, present: boolean, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const values = await readParticipants(page).catch(() => [] as string[]);
    const found = values.some((value) => value === name);
    if (found === present) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function readSharedState(context: BrowserContext): Promise<SharedStateDocument> {
  const res = await context.request.get(`${BASE}/api/shared/`);
  if (!res.ok()) throw new Error(`shared state request failed: ${res.status()}`);
  const body = (await res.json()) as { state: SharedStateDocument };
  return body.state;
}

async function waitForSharedState(
  context: BrowserContext,
  predicate: (state: SharedStateDocument) => boolean,
  timeout = 20_000,
) {
  const deadline = Date.now() + timeout;
  let last: SharedStateDocument | null = null;
  while (Date.now() < deadline) {
    last = await readSharedState(context);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `shared state did not reach the expected condition: ${JSON.stringify(last?.data?.boxGroupMemberships?.[GROUP.id] ?? [])}`,
  );
}

function findParticipant(state: SharedStateDocument, name: string) {
  const normalized = normalizeParticipantName(name);
  return state.data.boxParticipants.find((participant) => participant.normalizedName === normalized);
}

function membershipNames(state: SharedStateDocument) {
  return membershipNamesForIds(
    state.data.boxParticipants,
    state.data.boxGroupMemberships[GROUP.id] ?? [],
  );
}

function configParticipants(state: SharedStateDocument) {
  return state.data.boxConfigs.find((config) => config.id === GROUP.id)?.participants ?? [];
}

async function addName(page: Page, name: string) {
  await page.getByPlaceholder("Einen Namen hinzufügen").fill(name);
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  const added = await waitForParticipant(page, name, true);
  if (!added) throw new Error("name was not added to the participant list");
}

async function removeName(page: Page, name: string) {
  await page.getByLabel(`${name} entfernen`).click();
  const removed = await waitForParticipant(page, name, false);
  if (!removed) throw new Error("name was not removed from the participant list");
}

async function run() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "msedge" });
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }

  const first = await openBoxes(browser);
  const second = await openBoxes(browser);

  try {
    await openGroup(first.page);
    const initialNames = await readParticipants(first.page);
    check(
      "group A opens with its saved database participants",
      initialNames.length > 0 && initialNames.includes(GROUP.names[0]),
    );
    check("the test name is not already present", !initialNames.includes(TEST_NAME));

    await addName(first.page, TEST_NAME);
    check("new participant appears in the group immediately", true);

    const withName = await waitForSharedState(
      first.context,
      (state) =>
        !!findParticipant(state, TEST_NAME) &&
        membershipNames(state).includes(TEST_NAME) &&
        configParticipants(state).includes(TEST_NAME),
    );
    const savedRecord = findParticipant(withName, TEST_NAME);
    check("new participant and membership are persisted on the server", !!savedRecord);

    await first.page.reload();
    await first.page.getByRole("heading", { name: "Zufallsboxen" }).first().waitFor({ state: "visible", timeout: 30_000 });
    await openGroup(first.page);
    check(
      "the name survives a page refresh",
      await waitForParticipant(first.page, TEST_NAME, true),
    );

    const pulled = await second.page.waitForFunction(
      ({ key, name }) => {
        const raw = window.localStorage.getItem(key);
        return typeof raw === "string" && raw.toLowerCase().includes(name.toLowerCase());
      },
      { key: "dbs_box_participants_v1", name: TEST_NAME },
      { timeout: 30_000 },
    );
    check("a second device pulls the new participant from the server", !!pulled);
    await openGroup(second.page);
    check(
      "the name is visible on the second device",
      await waitForParticipant(second.page, TEST_NAME, true),
    );

    await removeName(second.page, TEST_NAME);
    const afterRemoval = await waitForSharedState(
      first.context,
      (state) =>
        !membershipNames(state).includes(TEST_NAME) &&
        !configParticipants(state).includes(TEST_NAME) &&
        !!findParticipant(state, TEST_NAME),
    );
    check(
      "removing the name removes only the group membership and keeps the participant record",
      !!findParticipant(afterRemoval, TEST_NAME),
    );

    check(
      "the removal reaches the other device",
      await waitForParticipant(first.page, TEST_NAME, false, 30_000),
    );

    await addName(first.page, TEST_NAME);
    const reAdded = await waitForSharedState(
      first.context,
      (state) => membershipNames(state).includes(TEST_NAME),
    );
    const reAddedRecord = findParticipant(reAdded, TEST_NAME);
    const duplicateCount = reAdded.data.boxParticipants.filter(
      (participant) => participant.normalizedName === normalizeParticipantName(TEST_NAME),
    ).length;
    check(
      "re-adding reuses the existing database record (no duplicate)",
      duplicateCount === 1 && reAddedRecord?.id === savedRecord?.id,
    );

    await second.page.reload();
    await second.page.getByRole("heading", { name: "Zufallsboxen" }).first().waitFor({ state: "visible", timeout: 30_000 });
    await openGroup(second.page);
    check(
      "the re-added name synchronizes to the second device",
      await waitForParticipant(second.page, TEST_NAME, true),
    );

    await removeName(second.page, TEST_NAME);
    const finalState = await waitForSharedState(
      first.context,
      (state) =>
        !membershipNames(state).includes(TEST_NAME) &&
        !!findParticipant(state, TEST_NAME),
    );
    check(
      "the participant record remains in the database after the final removal",
      !!findParticipant(finalState, TEST_NAME),
    );
    check(
      "all pre-existing group members are preserved",
      initialNames.every((name) => membershipNames(finalState).includes(name)),
    );
  } finally {
    await first.context.close();
    await second.context.close();
    await browser?.close();
  }

  if (failures.length > 0) {
    console.error(`\nPARTICIPANT E2E FAILED: ${failures.length} check(s):`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${passed} participant persistence E2E checks passed.`);
  }
}

void run().catch((error) => {
  console.error("\nE2E ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
