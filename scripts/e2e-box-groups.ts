import { chromium, type Browser, type Page } from "playwright";
import { BOX_GROUPS, GROUP_BOX_COUNT } from "../lib/box-groups";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_SESSION_KEY = "dbs_admin_session_v1";
const CONFIGS_KEY = "dbs_random_boxes_configs_v1";
const GAMES_KEY = "dbs_random_boxes_games_v1";

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

async function waitForText(page: Page, text: string | RegExp, timeout = 30_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

async function readParticipants(page: Page) {
  const inputs = page.locator("li input:not([aria-label])");
  const values: string[] = [];
  for (let i = 0; i < (await inputs.count()); i += 1) {
    values.push(await inputs.nth(i).inputValue());
  }
  return values;
}

async function readBoxes(page: Page, count = GROUP_BOX_COUNT) {
  const values: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    values.push(await page.getByLabel(`Box ${i} content`).inputValue());
  }
  return values;
}

function sameList(actual: readonly string[], expected: readonly string[]) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function authenticatedPage(browser: Browser, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext(viewport ? { viewport } : undefined);
  await ctx.addInitScript(`(() => {
    sessionStorage.setItem("${ADMIN_SESSION_KEY}", JSON.stringify(true));
  })();`);
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("  [pageerror]", err.message));
  await page.goto(`${BASE}/boxes/`);
  await page.evaluate(`(() => {
    localStorage.removeItem("${CONFIGS_KEY}");
    localStorage.removeItem("${GAMES_KEY}");
  })();`);
  await page.reload();
  await waitForText(page, "Groups", 30_000);
  return { ctx, page };
}

async function runDesktop(browser: Browser) {
  const { ctx, page } = await authenticatedPage(browser);
  try {
    const legacyGroup = BOX_GROUPS[0];
    const legacyConfig = {
      id: legacyGroup.id,
      name: legacyGroup.label,
      boxCount: legacyGroup.names.length,
      participants: [...legacyGroup.names],
      contents: legacyGroup.names.map((text, index) => ({
        id: `${legacyGroup.id}-legacy-${index + 1}`,
        type: "text",
        text,
      })),
      createdAt: 1,
      updatedAt: 1,
    };
    await page.evaluate(
      `localStorage.setItem("${CONFIGS_KEY}", ${JSON.stringify(JSON.stringify([legacyConfig]))});`,
    );
    await page.reload();
    await waitForText(page, "Groups", 30_000);

    check(
      "four group cards are shown",
      (await page.getByRole("button", { name: /^Open Gruppe / }).count()) === BOX_GROUPS.length,
    );

    const questionsByGroup: Record<string, string[]> = {};

    for (const group of BOX_GROUPS) {
      console.log(`  · ${group.label}`);
      await page
        .getByRole("button", {
          name: `Open ${group.label} with ${group.names.length} names`,
        })
        .click();
      await waitForText(page, "Game setup", 20_000);
      await waitForText(page, group.label, 20_000);

      const boxCount = Number(await page.locator('input[type="number"]').inputValue());
      check(`${group.label}: keeps the normal ${GROUP_BOX_COUNT}-box setup`, boxCount === GROUP_BOX_COUNT);

      const participants = await readParticipants(page);
      check(
        `${group.label}: participant list has its exact names, order and count`,
        sameList(participants, group.names),
      );

      const emptyBoxes = await readBoxes(page);
      check(
        `${group.label}: no participant name is inserted into any box`,
        emptyBoxes.every((text) => text.trim() === "" && !group.names.includes(text)),
      );

      if (group.id === legacyGroup.id) {
        check(
          `${group.label}: legacy auto-filled names are removed from the boxes`,
          boxCount === GROUP_BOX_COUNT && emptyBoxes.every((text) => text === ""),
        );
      }

      const questions = Array.from(
        { length: GROUP_BOX_COUNT },
        (_, index) => `Frage ${group.letter} ${index + 1}`,
      );
      questionsByGroup[group.id] = questions;
      for (let i = 0; i < questions.length; i += 1) {
        await page.getByLabel(`Box ${i + 1} content`).fill(questions[i]);
      }
      check(
        `${group.label}: boxes can be filled manually and stay independent of participants`,
        sameList(await readBoxes(page), questions),
      );

      await page.getByRole("button", { name: "Start Game" }).click();
      await waitForText(page, "Draw a random participant", 20_000);
      check(`${group.label}: random selection starts with the loaded participants`, true);

      await page.getByRole("button", { name: "All games" }).click();
      await waitForText(page, "Groups", 20_000);
      check(
        `${group.label}: group cards remain available afterwards`,
        (await page.getByRole("button", { name: /^Open Gruppe / }).count()) === BOX_GROUPS.length,
      );

      if (group.id === legacyGroup.id) {
        const gameBefore = await page.evaluate(`localStorage.getItem("${GAMES_KEY}")`);
        await page
          .getByRole("button", { name: `Open ${group.label} with ${group.names.length} names` })
          .click();
        await waitForText(page, "Game setup", 20_000);
        const gameAfter = await page.evaluate(`localStorage.getItem("${GAMES_KEY}")`);
        check(
          `${group.label}: reopening keeps the same participants and manual box questions`,
          sameList(await readParticipants(page), group.names) &&
            sameList(await readBoxes(page), questions) &&
            typeof gameBefore === "string" &&
            gameBefore.includes(`"${group.id}"`) &&
            typeof gameAfter === "string" &&
            gameAfter.includes(`"${group.id}"`),
        );
        await page.getByRole("button", { name: "All games" }).click();
        await waitForText(page, "Groups", 20_000);
      }
    }

    console.log("  · switching back to Gruppe A");
    const firstGroup = BOX_GROUPS[0];
    await page
      .getByRole("button", { name: `Open ${firstGroup.label} with ${firstGroup.names.length} names` })
      .click();
    await waitForText(page, "Game setup", 20_000);
    check(
      "switching groups never mixes participant names or changes earlier boxes",
      sameList(await readParticipants(page), firstGroup.names) &&
        sameList(await readBoxes(page), questionsByGroup[firstGroup.id]),
    );
    await page.getByRole("button", { name: "All games" }).click();
    await waitForText(page, "Groups", 20_000);

    console.log("  · manual game still available");
    await page.getByRole("button", { name: "New game" }).click();
    await waitForText(page, "Game setup", 20_000);
    check("manual New game still opens the normal setup", true);
    await page.getByRole("button", { name: "All games" }).click();
    await waitForText(page, "Groups", 20_000);
  } finally {
    await ctx.close();
  }
}

async function runMobile(browser: Browser) {
  const { ctx, page } = await authenticatedPage(browser, { width: 390, height: 844 });
  try {
    check(
      "mobile: all four group cards are visible",
      (await page.getByRole("button", { name: /^Open Gruppe / }).count()) === BOX_GROUPS.length,
    );
    const noHorizontalOverflow =
      (await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")) === true;
    check("mobile: cards fit without horizontal scrolling", noHorizontalOverflow);

    const group = BOX_GROUPS[0];
    await page
      .getByRole("button", { name: `Open ${group.label} with ${group.names.length} names` })
      .click();
    await waitForText(page, "Game setup", 20_000);
    check(
      "mobile: tapping a card loads participants into an independent empty box setup",
      Number(await page.locator('input[type="number"]').inputValue()) === GROUP_BOX_COUNT &&
        sameList(await readParticipants(page), group.names) &&
        (await readBoxes(page)).every((text) => text === ""),
    );
  } finally {
    await ctx.close();
  }
}

async function run() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "msedge" });
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }

  try {
    await runDesktop(browser);
    await runMobile(browser);
  } catch (err) {
    console.error("\nE2E ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }

  if (failures.length > 0) {
    console.error(`\nBOX GROUPS E2E FAILED: ${failures.length} check(s):`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${passed} box group E2E checks passed.`);
  }
}

void run();
