import { chromium, type Browser, type Locator, type Page } from "playwright";

/**
 * "Share Room" end-to-end check (Playwright).
 *
 * Requires the dev server on http://localhost:3000. Not part of `npm test`
 * (browser-dependent) — run manually:  npx tsx scripts/e2e-share.ts
 *
 * Covers the share contract:
 *  1. each quiz row has a "Share Room" button; the existing "Copy code" button is unchanged
 *  2. with the Web Share API available, clicking Share Room calls navigator.share with the join link
 *  3. without the Web Share API, the link is copied to the clipboard and a success toast is shown
 *  4. the link is `<origin>/quiz/join?room=CODE`, built from the live origin (no hardcoded host)
 *  5. opening the link forwards to the join page with the code prefilled (username only, no account)
 *  6. rooms stay independent (each room gets its own code + link)
 *  7. a deleted room still shows the clear error on a quiz-managing browser, while a fresh
 *     participant profile opening the same link never false-errors
 *  8. the room details page has a "Share room" button next to Copy code, opening a popup with
 *     Copy room link / WhatsApp / Facebook / native options — each producing the exact
 *     `<origin>/quiz/room/?code=CODE&host=1` link (also the native fallback without the API)
 *  9. that link opens the host controls for an admin, and the username + join screen for a
 *     student on a fresh device (never a password wall)
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

/** The room-page share link the popup must produce for room A. */
const ROOM_LINK_A = `${BASE}/quiz/room/?code=${CODE_A}&host=1`;

async function waitFor(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

/** The ?room= prefill is applied by a useEffect after hydration — poll until it lands. */
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
     * Context 1 — Web Share API unavailable → clipboard fallback
     * ============================================================== */
    const ctx1 = await browser.newContext();
    await ctx1.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    // String form avoids esbuild's function transform breaking in the browser.
    await ctx1.addInitScript(`(() => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(${JSON.stringify([roomA, roomB])}));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      try { Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }); } catch (e) {}
    })();`);

    const admin = await ctx1.newPage();
    admin.on("pageerror", (err) => console.error("  [admin pageerror]", err.message));

    log("opening the admin quiz dashboard");
    await admin.goto(`${BASE}/admin/`);
    await admin.getByRole("button", { name: `Share Room ${CODE_A}` }).waitFor({ timeout: 30_000 });
    check('admin: every quiz row has a "Share Room" button', true);

    const rowA = admin.getByRole("row").filter({ hasText: CODE_A });
    check(
      "regression: existing Copy code / Host / Edit buttons are intact",
      (await rowA.getByRole("button", { name: "Copy code" }).count()) === 1 &&
        (await rowA.getByRole("button", { name: "Host" }).count()) === 1 &&
        (await rowA.getByRole("button", { name: "Edit" }).count()) === 1,
    );

    log("clicking Share Room for room A (no Web Share API → clipboard fallback)");
    await admin.getByRole("button", { name: `Share Room ${CODE_A}` }).click();
    await waitFor(admin, "Share link copied", 10_000);
    const clipA = await admin.evaluate(() => navigator.clipboard.readText());
    check(
      "fallback: join link copied to the clipboard in the /quiz/join?room= form",
      clipA === `${BASE}/quiz/join?room=${CODE_A}`,
    );
    check("fallback: a success message is shown", (await admin.innerText("body")).includes("Share link copied"));

    log("clicking Share Room for room B (independence)");
    await admin.getByRole("button", { name: `Share Room ${CODE_B}` }).click();
    await waitFor(admin, "Share link copied", 10_000);
    const clipB = await admin.evaluate(() => navigator.clipboard.readText());
    check(
      "room independence: room B gets its own code and link",
      clipB === `${BASE}/quiz/join?room=${CODE_B}` && !clipB.includes(CODE_A),
    );

    log("regression: the row's original Copy code button");
    await rowA.getByRole("button", { name: "Copy code" }).click();
    await waitFor(admin, `Copied code ${CODE_A}.`, 5_000);
    const clipCode = await admin.evaluate(() => navigator.clipboard.readText());
    check("regression: Copy code still puts the room code on the clipboard", clipCode === CODE_A);

    /* ------------------- participant follows the shared link -------------- */
    log("opening the shared /quiz/join link as a participant");
    const join = await ctx1.newPage();
    join.on("pageerror", (err) => console.error("  [join pageerror]", err.message));
    await join.goto(`${BASE}/quiz/join?room=${CODE_A}`);
    const codeField = join.getByPlaceholder("e.g. 12355");
    await codeField.waitFor({ state: "visible", timeout: 15_000 });
    check("shared link forwards to the join page with the code prefilled", await waitForValue(codeField, CODE_A));
    await join
      .getByText("Link filled in room code", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    check("join page explains where the code came from", true);
    check(
      "join page asks only for a username (no password / sign-up)",
      !/password|sign ?up|register/i.test(await join.innerText("body")),
    );

    log("joining without a username, then with one");
    await join.getByRole("button", { name: "Join quiz", exact: true }).click();
    check("username is required before joining", await join.getByText("Enter a username to play with.").isVisible());
    await join.getByPlaceholder("e.g. Sam").fill("Mia");
    await join.getByRole("button", { name: "Join quiz", exact: true }).click();
    await join.waitForURL(
      (u) =>
        u.pathname.includes("/quiz/room") &&
        u.searchParams.get("code") === CODE_A &&
        u.searchParams.get("name") === "Mia",
      { timeout: 15_000 },
    );
    check("join lands on /quiz/room with the shared code + username", true);

    await join.close();
    await admin.close();
    await ctx1.close();

    /* ================================================================
     * Context 2 — Web Share API available → navigator.share is used
     * ============================================================== */
    const ctx2 = await browser.newContext();
    await ctx2.addInitScript(`(() => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(${JSON.stringify([roomA])}));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      window.__shared = [];
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: (data) => { window.__shared.push(data); return Promise.resolve(); },
      });
    })();`);

    const admin2 = await ctx2.newPage();
    admin2.on("pageerror", (err) => console.error("  [admin2 pageerror]", err.message));
    log("opening the dashboard with the Web Share API available");
    await admin2.goto(`${BASE}/admin/`);
    await admin2.getByRole("button", { name: `Share Room ${CODE_A}` }).waitFor({ timeout: 30_000 });

    log("clicking Share Room (native share path)");
    await admin2.getByRole("button", { name: `Share Room ${CODE_A}` }).click();
    await admin2.waitForFunction("window.__shared && window.__shared.length > 0", undefined, { timeout: 10_000 });
    const shared = (await admin2.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)) as {
      title?: string;
      text?: string;
      url?: string;
    }[];
    check("native: navigator.share was called once", shared.length === 1);
    check(
      "native: shared url is the room's /quiz/join?room= link",
      shared[0]?.url === `${BASE}/quiz/join?room=${CODE_A}`,
    );
    check(
      "native: shared payload carries the quiz title and code",
      (shared[0]?.title ?? "").includes("Share Quiz Alpha") &&
        (shared[0]?.text ?? "").includes(CODE_A),
    );
    check(
      "native: no clipboard copy when the share sheet succeeds",
      !(await admin2.innerText("body")).includes("Share link copied"),
    );

    await admin2.close();
    await ctx2.close();

    /* ================================================================
     * Context 3 — deleted room: admin browser errors, participant does not
     * ============================================================== */
    const ctx3 = await browser.newContext();
    // Only room B exists, so room A's link is dead.
    await ctx3.addInitScript(`(() => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(${JSON.stringify([roomB])}));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
    })();`);

    const admin3 = await ctx3.newPage();
    admin3.on("pageerror", (err) => console.error("  [admin3 pageerror]", err.message));
    log("opening a deleted room's shared link on the admin browser");
    await admin3.goto(`${BASE}/quiz/join?room=${CODE_A}`);
    await admin3.getByRole("heading", { name: "This quiz room no longer exists" }).waitFor({ timeout: 15_000 });
    const errBody = await admin3.innerText("body");
    check("deleted-room error names the missing room", errBody.includes(CODE_A));
    check("deleted-room error explains it may have been deleted", /may have been deleted/i.test(errBody));

    await admin3.close();
    await ctx3.close();

    // Fresh participant profile — same dead link, no false error.
    const ctx4 = await browser.newContext();
    const fresh = await ctx4.newPage();
    fresh.on("pageerror", (err) => console.error("  [fresh pageerror]", err.message));
    log("opening the same dead link in a fresh participant profile");
    await fresh.goto(`${BASE}/quiz/join?room=${CODE_A}`);
    const freshCode = fresh.getByPlaceholder("e.g. 12355");
    await freshCode.waitFor({ state: "visible", timeout: 15_000 });
    check("participant: dead link still prefills the code", await waitForValue(freshCode, CODE_A));
    await fresh
      .getByText("Link filled in room code", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    check(
      "participant: no false deletion error on a device without quiz data",
      !(await fresh.innerText("body")).includes("no longer exists"),
    );

    await fresh.close();
    await ctx4.close();

    /* ================================================================
     * Context 5 — room details page: "Share room" popup, all four options
     * ============================================================== */
    const ctx5 = await browser.newContext();
    await ctx5.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    // String form avoids esbuild's function transform breaking in the browser.
    await ctx5.addInitScript(`(() => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(${JSON.stringify([roomA])}));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      window.__opened = [];
      window.open = (u) => { window.__opened.push(String(u)); return null; };
      window.__shared = [];
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: (data) => { window.__shared.push(data); return Promise.resolve(); },
      });
    })();`);

    const roomPage = await ctx5.newPage();
    roomPage.on("pageerror", (err) => console.error("  [room pageerror]", err.message));

    log("opening the room details page as the host");
    await roomPage.goto(`${BASE}/quiz/room/?code=${CODE_A}&host=1`);
    await waitFor(roomPage, "Room code — share with students", 30_000);
    check(
      "room page: Share room button sits next to the unchanged Copy code button",
      (await roomPage.getByRole("button", { name: "Share room", exact: true }).count()) === 1 &&
        (await roomPage.getByRole("button", { name: "Copy code", exact: true }).count()) === 1,
    );

    log("opening the Share room popup");
    await roomPage.getByRole("button", { name: "Share room", exact: true }).click();
    const roomDialog = roomPage.getByRole("dialog");
    await roomDialog.waitFor({ state: "visible", timeout: 10_000 });
    check(
      "popup: all four share options are offered",
      (await roomDialog.getByRole("button", { name: "Copy room link" }).count()) === 1 &&
        (await roomDialog.getByRole("button", { name: "Share on WhatsApp" }).count()) === 1 &&
        (await roomDialog.getByRole("button", { name: "Share on Facebook" }).count()) === 1 &&
        (await roomDialog.getByRole("button", { name: "Share via other apps" }).count()) === 1,
    );
    check(
      "popup: shows the exact /quiz/room/?code=…&host=1 link from the live origin",
      (await roomDialog.innerText()).includes(ROOM_LINK_A),
    );

    log("clicking Copy room link");
    await roomDialog.getByRole("button", { name: "Copy room link" }).click();
    await waitFor(roomPage, "Room link copied", 10_000);
    const roomClip = await roomPage.evaluate(() => navigator.clipboard.readText());
    check("copy link: clipboard gets the exact room URL", roomClip === ROOM_LINK_A);
    check(
      "copy link: a success message is shown",
      (await roomPage.innerText("body")).includes(`Room link copied — ${ROOM_LINK_A}`),
    );

    log("clicking Share on WhatsApp");
    await roomDialog.getByRole("button", { name: "Share on WhatsApp" }).click();
    await roomPage.waitForFunction(
      "window.__opened && window.__opened.some((u) => u.includes('wa.me'))",
      undefined,
      { timeout: 10_000 },
    );
    const openedUrls = (await roomPage.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    )) as string[];
    const waUrl = openedUrls.find((u) => u.includes("wa.me")) ?? "";
    check(
      "whatsapp: opens wa.me with a message containing the room link",
      waUrl.startsWith("https://wa.me/?text=") &&
        decodeURIComponent(waUrl.slice("https://wa.me/?text=".length)).includes(ROOM_LINK_A),
    );

    log("clicking Share on Facebook");
    await roomDialog.getByRole("button", { name: "Share on Facebook" }).click();
    await roomPage.waitForFunction(
      "window.__opened && window.__opened.some((u) => u.includes('facebook.com/sharer'))",
      undefined,
      { timeout: 10_000 },
    );
    const openedAll = (await roomPage.evaluate(
      () => (window as unknown as { __opened: string[] }).__opened,
    )) as string[];
    const fbUrl = openedAll.find((u) => u.includes("facebook.com/sharer")) ?? "";
    check(
      "facebook: opens the sharer dialog with the room link",
      fbUrl.includes(`u=${encodeURIComponent(ROOM_LINK_A)}`),
    );

    log("clicking Share via other apps (native path)");
    await roomDialog.getByRole("button", { name: "Share via other apps" }).click();
    await roomPage.waitForFunction("window.__shared && window.__shared.length > 0", undefined, {
      timeout: 10_000,
    });
    const nativeShares = (await roomPage.evaluate(
      () => (window as unknown as { __shared: unknown[] }).__shared,
    )) as { title?: string; text?: string; url?: string }[];
    check(
      "native: navigator.share receives the exact room link",
      nativeShares.length === 1 && nativeShares[0]?.url === ROOM_LINK_A,
    );
    check(
      "native: payload carries the quiz title and room code",
      (nativeShares[0]?.title ?? "").includes("Share Quiz Alpha") &&
        (nativeShares[0]?.text ?? "").includes(CODE_A),
    );

    log("regression: closing the popup, then using the room page's Copy code button");
    await roomPage.keyboard.press("Escape");
    await roomDialog.waitFor({ state: "hidden", timeout: 5_000 });
    await roomPage.getByRole("button", { name: "Copy code", exact: true }).click();
    await waitFor(roomPage, `Copied code ${CODE_A}.`, 5_000);
    check(
      "room page: Copy code still puts just the room code on the clipboard",
      (await roomPage.evaluate(() => navigator.clipboard.readText())) === CODE_A,
    );

    log("opening the copied link as the host (admin session)");
    const hostView = await ctx5.newPage();
    hostView.on("pageerror", (err) => console.error("  [hostView pageerror]", err.message));
    await hostView.goto(ROOM_LINK_A);
    await waitFor(hostView, "Room code — share with students", 30_000);
    const hostBody = await hostView.innerText("body");
    check("host: the link opens that room's host controls", hostBody.includes(CODE_A));
    check("host: no login wall for an active admin session", !hostBody.includes("Host login required"));
    await hostView.close();

    /* ================================================================
     * Context 6 — popup fallback when the Web Share API is unavailable
     * ============================================================== */
    const ctx6 = await browser.newContext();
    await ctx6.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await ctx6.addInitScript(`(() => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify(${JSON.stringify([roomA])}));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
      try { Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }); } catch (e) {}
    })();`);

    const noShare = await ctx6.newPage();
    noShare.on("pageerror", (err) => console.error("  [noShare pageerror]", err.message));
    log("opening the room page without the Web Share API");
    await noShare.goto(`${BASE}/quiz/room/?code=${CODE_A}&host=1`);
    await waitFor(noShare, "Room code — share with students", 30_000);
    await noShare.getByRole("button", { name: "Share room", exact: true }).click();
    const noShareDialog = noShare.getByRole("dialog");
    await noShareDialog.waitFor({ state: "visible", timeout: 10_000 });
    await noShareDialog.getByRole("button", { name: "Share via other apps" }).click();
    await waitFor(noShare, "room link copied instead", 10_000);
    check(
      "native fallback: without Web Share the popup copies the link with a clear message",
      (await noShare.evaluate(() => navigator.clipboard.readText())) === ROOM_LINK_A,
    );
    await noShare.close();
    await ctx6.close();

    /* ================================================================
     * Context 7 — student on a fresh device opens the copied link
     * ============================================================== */
    const ctx7 = await browser.newContext();
    const student = await ctx7.newPage();
    student.on("pageerror", (err) => console.error("  [student pageerror]", err.message));
    log("opening the copied link as a student (fresh device, no admin session)");
    await student.goto(ROOM_LINK_A);
    await waitFor(student, "What's your name?", 30_000);
    const studentBody = await student.innerText("body");
    check("student: the link opens the username form for that exact room", studentBody.includes(`Room ${CODE_A}`));
    check("student: never blocked by a password or host login wall", !studentBody.includes("Host login required"));
    check(
      "student: no password field at all",
      (await student.locator('input[type="password"]').count()) === 0,
    );
    check("student: no false deletion error on a device without quiz data", !studentBody.includes("no longer exists"));

    log("entering a username and joining the room");
    await student.getByPlaceholder("e.g. Alex").fill("Mia");
    await student.getByRole("button", { name: "Join the quiz" }).click();
    await student.getByText("What's your name?").waitFor({ state: "hidden", timeout: 10_000 });
    // The student shell header always shows "Room <code>" once the name is accepted.
    await student.getByText(/Room\s*11122/).first().waitFor({ state: "visible", timeout: 15_000 });
    check("student: username accepted and the room opens for that code", true);

    await student.close();
    await ctx7.close();
    await roomPage.close();
    await ctx5.close();

    /* ------------------------------ summary ------------------------------ */
    if (failures.length > 0) {
      console.error(`\nSHARE E2E FAILED: ${failures.length} check(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll Share Room E2E checks passed.");
    }
  } catch (err) {
    console.error("\nE2E ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

void run();
