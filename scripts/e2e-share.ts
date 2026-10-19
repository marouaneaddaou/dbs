import { chromium, type Browser, type Locator, type Page } from "playwright";

/**
 * Share Quiz Room end-to-end check (Playwright, UI-driven).
 *
 * Requires the dev server on http://localhost:3000. Not part of `npm test`
 * (browser-dependent) — run manually:  npx tsx scripts/e2e-share.ts
 *
 * Covers the sharing contract:
 *  1. per-row "Teilen / Share Room" button on /admin (existing buttons intact)
 *  2. popup with room code + Copy Code, join link + Copy Link, WhatsApp share
 *  3. clipboard actually receives the code / link
 *  4. link is built from the live origin, prefills the code on /quiz, and only
 *     asks for a username (no password / sign-up)
 *  5. rooms stay independent (own code + link per room)
 *  6. a deleted room shows a clear error on the admin's browser (join page and
 *     direct room link) with a way back — while a fresh participant profile
 *     opening the same dead link never false-errors
 */

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const CODE_A = "11122";
const CODE_B = "33344";

const roomA = {
  code: CODE_A,
  title: "Share Quiz Alpha",
  description: "First room for share-link checks",
  correctVisibility: "atEnd",
  status: "published",
  createdAt: 1_700_000_100_000,
  questions: [
    {
      id: "a1",
      text: "Alpha: what is the answer?",
      points: 100,
      timeLimitSec: 60,
      speedBonus: false,
      answers: [
        { id: "a1_right", text: "right choice", correct: true },
        { id: "a1_wrong", text: "wrong choice", correct: false },
      ],
    },
  ],
};

const roomB = {
  code: CODE_B,
  title: "Share Quiz Beta",
  description: "Second room for share-link checks",
  correctVisibility: "atEnd",
  status: "published",
  createdAt: 1_700_000_200_000,
  questions: [
    {
      id: "b1",
      text: "Beta: what is the answer?",
      points: 100,
      timeLimitSec: 60,
      speedBonus: false,
      answers: [
        { id: "b1_right", text: "right choice", correct: true },
        { id: "b1_wrong", text: "wrong choice", correct: false },
      ],
    },
  ],
};

function log(step: string) {
  console.log(`  · ${step}`);
}

async function waitFor(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

/**
 * The `?code=` prefill is applied by a useEffect after hydration, so the
 * input can be visible before its value lands — poll until it matches.
 */
async function waitForValue(locator: Locator, expected: string, timeout = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await locator.inputValue().catch(() => "");
    if (value === expected) return true;
    await locator.page().waitForTimeout(150);
  }
  return false;
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
    /* ================================================================
     * Context 1 — an admin browser that stores both quiz rooms
     * ============================================================== */
    const ctx1 = await browser.newContext();
    await ctx1.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await ctx1.addInitScript(
      (seed) => {
        localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(seed.rooms));
        sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      },
      { rooms: [roomA, roomB] },
    );

    const admin = await ctx1.newPage();
    admin.on("pageerror", (err) => console.error("  [admin pageerror]", err.message));

    log("opening the admin quiz dashboard");
    await admin.goto(`${BASE}/admin/`);
    await admin
      .getByRole("button", { name: `Teilen / Share Room ${CODE_A}` })
      .waitFor({ timeout: 30_000 });
    check('admin: every quiz row has a labeled "Teilen / Share Room" button', true);

    const rowA = admin.getByRole("row").filter({ hasText: CODE_A });
    check(
      "regression: existing row actions (Copy code / Host / Edit) are intact",
      (await rowA.getByRole("button", { name: "Copy code" }).count()) === 1 &&
        (await rowA.getByRole("button", { name: "Host" }).count()) === 1 &&
        (await rowA.getByRole("button", { name: "Edit" }).count()) === 1,
    );

    /* ------------------------ share popup: room A ------------------------ */
    log("opening the share popup for room A");
    await admin.getByRole("button", { name: `Teilen / Share Room ${CODE_A}` }).click();
    const dialogA = admin.getByRole("dialog");
    await dialogA.waitFor({ state: "visible", timeout: 10_000 });

    check(
      "popup: titled “Teilen / Share Room”",
      await dialogA.getByRole("heading", { name: "Teilen / Share Room" }).isVisible(),
    );
    check("popup: shows the room code", await dialogA.getByText(CODE_A, { exact: true }).isVisible());
    check("popup: names the quiz being shared", (await dialogA.innerText()).includes("Share Quiz Alpha"));

    const linkInput = dialogA.getByLabel("Share link", { exact: true });
    const expectedLink = `${BASE}/quiz/?code=${CODE_A}`;
    check(
      "popup: share link built from the live origin + room code",
      (await linkInput.inputValue()) === expectedLink,
    );
    check("popup: share link is read-only", !(await linkInput.isEditable()));

    log("clicking Copy Code");
    await dialogA.getByRole("button", { name: "Copy code" }).click();
    await waitFor(admin, `Copied code ${CODE_A}.`, 5_000);
    const clipCode = await admin.evaluate(() => navigator.clipboard.readText());
    check("Copy Code → clipboard receives the room code", clipCode === CODE_A);

    log("clicking Copy Link");
    await dialogA.getByRole("button", { name: "Copy share link" }).click();
    await waitFor(admin, "Share link copied.", 5_000);
    const clipLink = await admin.evaluate(() => navigator.clipboard.readText());
    check("Copy Link → clipboard receives the join link", clipLink === expectedLink);

    const waHref = (await dialogA.getByRole("link", { name: "Share via WhatsApp" }).getAttribute("href")) ?? "";
    const waPayload = decodeURIComponent(waHref.split("?text=")[1] ?? "");
    check("popup: WhatsApp button uses the wa.me share scheme", waHref.startsWith("https://wa.me/?text="));
    check(
      "popup: WhatsApp message carries the link and the code",
      waPayload.includes(expectedLink) && waPayload.includes(CODE_A),
    );
    check("popup: states that no account is needed", (await dialogA.innerText()).includes("No account needed"));

    log("closing the popup via the footer button");
    await dialogA.getByRole("button", { name: "Close" }).last().click();
    await dialogA.waitFor({ state: "hidden", timeout: 5_000 });
    check("popup: footer Close button dismisses it", true);

    /* ------------------------ share popup: room B ------------------------ */
    log("opening the share popup for room B (independence)");
    await admin.getByRole("button", { name: `Teilen / Share Room ${CODE_B}` }).click();
    const dialogB = admin.getByRole("dialog");
    await dialogB.waitFor({ state: "visible", timeout: 10_000 });
    const linkB = await dialogB.getByLabel("Share link", { exact: true }).inputValue();
    check(
      "room independence: room B gets its own code and link",
      linkB === `${BASE}/quiz/?code=${CODE_B}` &&
        (await dialogB.getByText(CODE_B, { exact: true }).isVisible()) &&
        !linkB.includes(CODE_A),
    );
    check("room independence: popup names room B's quiz", (await dialogB.innerText()).includes("Share Quiz Beta"));

    await admin.keyboard.press("Escape");
    await dialogB.waitFor({ state: "hidden", timeout: 5_000 });
    check("popup: Escape closes it", true);

    log("regression: the row's original Copy code button");
    await rowA.getByRole("button", { name: "Copy code" }).click();
    const clipRow = await admin.evaluate(() => navigator.clipboard.readText());
    check("regression: row Copy code still puts the code on the clipboard", clipRow === CODE_A);

    /* ------------------- participant follows the shared link -------------- */
    log("opening the share link as a participant");
    const join = await ctx1.newPage();
    join.on("pageerror", (err) => console.error("  [join pageerror]", err.message));
    await join.goto(expectedLink);
    const codeField = join.getByPlaceholder("e.g. 12355");
    await codeField.waitFor({ state: "visible", timeout: 15_000 });
    check("shared link prefills the room code", await waitForValue(codeField, CODE_A));
    await join
      .getByText("Link filled in room code", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    check("join page explains where the code came from", true);
    check(
      "join page asks only for a username (no password / sign-up)",
      !/password|sign ?up|register/i.test(await join.innerText("body")),
    );

    log("trying to join without a username");
    await join.getByRole("button", { name: "Join quiz", exact: true }).click();
    check("username is required before joining", await join.getByText("Enter a username to play with.").isVisible());

    log("entering a username and joining");
    await join.getByPlaceholder("e.g. Sam").fill("Mia");
    await join.getByRole("button", { name: "Join quiz", exact: true }).click();
    await join.waitForURL(
      (u) => u.pathname.includes("/quiz/room") && u.searchParams.get("code") === CODE_A && u.searchParams.get("name") === "Mia",
      { timeout: 15_000 },
    );
    check("join lands on /quiz/room with the shared code + username", true);

    await join.close();
    await admin.close();
    await ctx1.close();

    /* ================================================================
     * Context 2 — admin deletes the room, then opens its old link.
     * The seed only runs when the key is absent, so the deletion sticks
     * across navigations.
     * ============================================================== */
    const ctx2 = await browser.newContext();
    await ctx2.addInitScript(
      (seed) => {
        if (localStorage.getItem("dbs_quiz_rooms_v1") === null) {
          localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(seed.rooms));
        }
        sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      },
      { rooms: [roomB] },
    );

    const admin2 = await ctx2.newPage();
    admin2.on("pageerror", (err) => console.error("  [admin2 pageerror]", err.message));
    log("deleting room B through the existing admin flow");
    await admin2.goto(`${BASE}/admin/`);
    await admin2.getByRole("button", { name: `Teilen / Share Room ${CODE_B}` }).waitFor({ timeout: 30_000 });
    const rowB = admin2.getByRole("row").filter({ hasText: CODE_B });
    await rowB.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = admin2.getByRole("dialog");
    await confirm.waitFor({ state: "visible", timeout: 10_000 });
    check("delete confirmation names the room", (await confirm.innerText()).includes(CODE_B));
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await rowB.waitFor({ state: "hidden", timeout: 10_000 });
    check("room removed from the admin table", true);

    const deadLink = `${BASE}/quiz/?code=${CODE_B}`;
    log("opening the deleted room's join link");
    await admin2.goto(deadLink);
    await admin2.getByRole("heading", { name: "This quiz room no longer exists" }).waitFor({ timeout: 15_000 });
    const errBody = await admin2.innerText("body");
    check("deleted-room error names the missing room", errBody.includes(CODE_B));
    check("deleted-room error explains it may have been deleted", /may have been deleted/i.test(errBody));

    log("choosing Enter a different code");
    await admin2.getByRole("button", { name: "Enter a different code" }).click();
    await admin2.getByPlaceholder("e.g. 12355").waitFor({ state: "visible", timeout: 10_000 });
    check("“Enter a different code” returns to a blank form", (await admin2.getByPlaceholder("e.g. 12355").inputValue()) === "");
    await admin2.waitForURL((u) => u.searchParams.get("code") === null, { timeout: 10_000 });
    check("URL query cleared when picking a new code", new URL(admin2.url()).search === "");

    log("opening the dead link again and choosing Open anyway");
    await admin2.goto(deadLink);
    await admin2.getByRole("heading", { name: "This quiz room no longer exists" }).waitFor({ timeout: 15_000 });
    await admin2.getByRole("button", { name: "Open the room anyway" }).click();
    await admin2.getByPlaceholder("e.g. 12355").waitFor({ state: "visible", timeout: 10_000 });
    check(
      "“Open the room anyway” keeps the original code in the form",
      (await admin2.getByPlaceholder("e.g. 12355").inputValue()) === CODE_B,
    );

    log("opening a direct room link for the deleted room");
    await admin2.goto(`${BASE}/quiz/room/?code=${CODE_B}&name=Mia`);
    await waitFor(admin2, "This quiz room no longer exists", 15_000);
    check("direct /quiz/room link for a deleted room shows the error", true);
    await admin2.getByRole("link", { name: /Back to join page/ }).click();
    await admin2.waitForURL(
      (u) => u.pathname.includes("/quiz") && !u.pathname.includes("/room"),
      { timeout: 10_000 },
    );
    check("error screen links back to the join page", true);

    await admin2.close();
    await ctx2.close();

    /* ================================================================
     * Context 3 — a fresh participant profile (no quiz-room data at all)
     * ============================================================== */
    const ctx3 = await browser.newContext();
    const fresh = await ctx3.newPage();
    fresh.on("pageerror", (err) => console.error("  [fresh pageerror]", err.message));

    log("opening the same dead link in a fresh participant profile");
    await fresh.goto(deadLink);
    const freshCode = fresh.getByPlaceholder("e.g. 12355");
    await freshCode.waitFor({ state: "visible", timeout: 15_000 });
    check("participant: code still prefilled from the link", await waitForValue(freshCode, CODE_B));
    await fresh
      .getByText("Link filled in room code", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    const freshBody = await fresh.innerText("body");
    check("participant: dead link opens the normal join form (no false error)", !freshBody.includes("no longer exists"));
    check("participant: sees where the code came from", freshBody.includes("Link filled in room code"));

    await fresh.goto(`${BASE}/quiz/room/?code=${CODE_B}&name=Mia`);
    await fresh.waitForTimeout(2_500);
    const freshRoomBody = await fresh.innerText("body");
    check(
      "participant: room link never claims the room was deleted",
      !freshRoomBody.includes("no longer exists"),
    );

    await fresh.close();
    await ctx3.close();

    /* ------------------------------ summary ------------------------------ */
    if (failures.length > 0) {
      console.error(`\nSHARE E2E FAILED: ${failures.length} check(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll share-room E2E checks passed.");
    }
  } catch (err) {
    console.error("\nE2E ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

void run();
