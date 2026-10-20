import { chromium, type Browser, type Locator, type Page } from "playwright";

/**
 * Random Boxes — "create a 6-box party" end-to-end check (Playwright).
 *
 * Requires the dev server on http://localhost:3000. Not part of `npm test`
 * (browser-dependent) — run manually:  npx tsx scripts/e2e-boxes.ts
 *
 * Covers the box-content entry contract:
 *  1. choosing the box count shows exactly that many labelled fields
 *     (Box 1 … Box 6) and the fields follow count changes
 *  2. starting with empty boxes is blocked and the toast names them
 *  3. the list-view Play button is disabled while boxes are empty
 *  4. pasting a list ("Box 1: …" one per line) fills every field
 *  5. a single field can be edited by hand
 *  6. the game starts, draws a participant and opening all 6 boxes uses each
 *     entered item exactly once (existing random assignment, no repeats)
 *  7. everything is persisted to localStorage and survives a reload
 */

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const BOX_KEYS = {
  configs: "dbs_random_boxes_configs_v1",
  games: "dbs_random_boxes_games_v1",
  admin: "dbs_admin_session_v1",
};

/** The pasted list from the requirement — "Box N:" labels must be stripped. */
const PASTED_LIST = [
  "Box 1: Der Vorname",
  "Box 2: Die Gitarre",
  "Box 3: Das Buch",
  "Box 4: Die Schule",
  "Box 5: Der Lehrer",
  "Box 6: Die Tasche",
].join("\n");

/** What the six fields must contain after the paste. */
const PASTED_VALUES = ["Der Vorname", "Die Gitarre", "Das Buch", "Die Schule", "Der Lehrer", "Die Tasche"];

/** Box 1 gets edited by hand before playing. */
const EXPECTED_VALUES = ["Das Fahrrad", "Die Gitarre", "Das Buch", "Die Schule", "Der Lehrer", "Die Tasche"];

function log(step: string) {
  console.log(`  · ${step}`);
}

async function waitFor(page: Page, text: string | RegExp, timeout = 30_000): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

/** Poll until the locator matches exactly `n` elements. */
async function waitForCount(locator: Locator, n: number, timeout = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) === n) return true;
    await locator.page().waitForTimeout(150);
  }
  return false;
}

/** Poll an input until it holds the expected value. */
async function waitForValue(locator: Locator, expected: string, timeout = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await locator.inputValue().catch(() => "");
    if (value === expected) return true;
    await locator.page().waitForTimeout(150);
  }
  return false;
}

function boxInputs(page: Page): Locator {
  return page.locator('input[aria-label$=" content"]');
}

async function run(): Promise<void> {
  let browser: Browser | null = null;
  const failures: string[] = [];
  const check = (name: string, cond: boolean) => {
    if (cond) console.log(`  ok - ${name}`);
    else {
      console.error(`  FAIL - ${name}`);
      failures.push(name);
    }
  };

  try {
    browser = await chromium.launch({ channel: "msedge" });
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }

  try {
    const ctx = await browser.newContext();
    // String form avoids esbuild's function transform breaking in the browser.
    // Only session state lives here — it re-runs on every navigation and must
    // never touch localStorage (the persistence check reloads the page).
    await ctx.addInitScript(`(() => {
      sessionStorage.setItem("${BOX_KEYS.admin}", JSON.stringify(true));
    })();`);

    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.error("  [pageerror]", err.message));

    log("opening the Random Boxes page with a clean slate");
    await page.goto(`${BASE}/boxes/`);
    await page.evaluate(`(() => {
      localStorage.removeItem("${BOX_KEYS.configs}");
      localStorage.removeItem("${BOX_KEYS.games}");
    })();`);
    await page.reload();
    await waitFor(page, "Random Boxes", 30_000);
    check("boxes page opens for the admin", true);

    log("creating a new game (defaults to 6 boxes)");
    await page.getByRole("button", { name: /Create your first game|New game/ }).first().click();
    await waitFor(page, "Game setup");
    check("new game opens the setup form", true);

    /* ------------------------- 6 fields, labelled ------------------------- */
    check("exactly 6 content fields for the default 6 boxes", (await boxInputs(page).count()) === 6);
    let labelsVisible = true;
    for (let n = 1; n <= 6; n += 1) {
      const visible = await page.getByText(`Box ${n}`, { exact: true }).first().isVisible().catch(() => false);
      if (!visible) labelsVisible = false;
    }
    check("every field is labelled Box 1 … Box 6", labelsVisible);

    log("changing the box count to 4 and back to 6");
    await page.locator('input[type="number"]').fill("4");
    check("box count 4 shows exactly 4 fields", (await boxInputs(page).count()) === 4);
    await page.locator('input[type="number"]').fill("6");
    check("box count 6 shows exactly 6 fields again", (await boxInputs(page).count()) === 6);

    /* --------------------------- validation ------------------------------ */
    log("trying to start with empty boxes");
    await page.getByRole("button", { name: "Start Game" }).click();
    await waitFor(page, /Box 1, Box 2, Box 3.*still empty/, 10_000);
    check("starting with empty boxes is blocked and the toast names them", true);
    check("still on the setup form after the blocked start", await page.getByText("Game setup").isVisible());
    await waitFor(page, "6 of 6 boxes still empty", 10_000);
    check("the empty-boxes hint is shown under the fields", true);

    log("checking the list-view Play button while boxes are empty");
    await page.getByRole("button", { name: "All games" }).click();
    await waitFor(page, "Random Boxes");
    check("list Play button is disabled while a box is empty", await page.getByRole("button", { name: "Play" }).isDisabled());
    await page.getByRole("button", { name: "Edit" }).click();
    await waitFor(page, "Game setup");

    /* ------------------------- paste one per line ------------------------- */
    log("pasting the 6-line list into the textarea");
    await page.locator('textarea[placeholder*="Der Vorname"]').fill(PASTED_LIST);
    await page.getByRole("button", { name: "Fill boxes from list" }).click();
    await waitFor(page, "Filled all 6 boxes", 10_000);
    let pasteOk = true;
    for (let n = 1; n <= 6; n += 1) {
      const ok = await waitForValue(page.getByLabel(`Box ${n} content`), PASTED_VALUES[n - 1]);
      if (!ok) pasteOk = false;
    }
    check("all 6 fields hold the pasted items (Box N: labels stripped)", pasteOk);

    log("editing Box 1 by hand");
    await page.getByLabel("Box 1 content").fill("Das Fahrrad");
    check(
      "individual field edit is applied",
      (await page.getByLabel("Box 1 content").inputValue()) === "Das Fahrrad",
    );

    /* --------------------------- participant ------------------------------ */
    log("adding a participant");
    await page.getByPlaceholder("Add one name").fill("Alice");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Participant rows render a plain input (no aria-label) inside a <li>.
    const participantInputs = page.locator("li input:not([aria-label])");
    check(
      "participant Alice is in the list",
      (await participantInputs.count()) === 1 && (await participantInputs.first().inputValue()) === "Alice",
    );

    /* ------------------------------ playing ------------------------------- */
    log("starting the game");
    await page.getByRole("button", { name: "Start Game" }).click();
    // onPlay creates the game with status "running" — the board opens ready to draw.
    await waitFor(page, "Draw a random participant", 20_000);
    check("setup Start Game passes validation and opens the running board", true);

    await page.getByRole("button", { name: "Draw participant" }).click();
    await waitFor(page, "Pick any unopened box", 20_000);
    check("participant drawn — the 6 boxes are clickable", true);

    log("opening all 6 boxes");
    const historyRows = page.locator("ul.max-h-96 > li");
    let openedOk = true;
    for (let i = 1; i <= 6; i += 1) {
      await page.locator('button[aria-label^="Box "]:not([disabled])').first().click();
      const counted = await waitForCount(historyRows, i);
      if (!counted) openedOk = false;
      if (i < 6) {
        await page.getByRole("button", { name: "Next turn" }).click();
        await waitFor(page, "Pick any unopened box", 20_000);
      } else {
        await page.getByRole("button", { name: "Close" }).click();
      }
    }
    check("all 6 boxes opened (history shows 6 selections)", openedOk && (await historyRows.count()) === 6);
    await waitFor(page, "All boxes open", 10_000);
    check("round ends with the repeat-round call to action", true);

    const historyTexts = (await page.locator("ul.max-h-96 > li p.text-xs").allTextContents()).map((t) => t.trim());
    check(
      "the 6 revealed contents are exactly the 6 entered items, each used once",
      JSON.stringify(historyTexts.slice().sort()) === JSON.stringify(EXPECTED_VALUES.slice().sort()),
    );

    /* --------------------------- persistence ------------------------------ */
    log("reloading the page to verify localStorage persistence");
    await page.reload();
    // Poll until the hydrated list renders the saved card (isVisible does not wait).
    await waitFor(page, "6 boxes", 30_000);
    check("saved game card shows 6 boxes after reload", true);
    await waitFor(page, "6 contents", 10_000);
    check("saved game card shows 6 contents after reload", true);
    await page.getByRole("button", { name: "Edit" }).click();
    await waitFor(page, "Game setup");
    check("reloaded setup still shows exactly 6 fields", (await boxInputs(page).count()) === 6);
    check(
      "edited Box 1 value survived the reload",
      (await page.getByLabel("Box 1 content").inputValue()) === "Das Fahrrad",
    );
    check(
      "pasted Box 6 value survived the reload",
      (await page.getByLabel("Box 6 content").inputValue()) === "Die Tasche",
    );

    await page.close();
    await ctx.close();

    /* ------------------------------ summary ------------------------------ */
    if (failures.length > 0) {
      console.error(`\nBOXES E2E FAILED: ${failures.length} check(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll Boxes E2E checks passed.");
    }
  } catch (err) {
    console.error("\nE2E ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

void run();
