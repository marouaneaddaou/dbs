import { chromium, type Browser, type Page } from "playwright";

/**
 * Classroom end-to-end check (Playwright, real browsers over WebRTC).
 *
 * Requires the dev server on http://localhost:3000 and internet access for the
 * public PeerJS signaling server. Not part of `npm test` (network-dependent) —
 * run manually:  npx tsx scripts/e2e-classroom.ts
 *
 * Covers the full gameplay contract: top countdown timer bar, "Question X of
 * Y" indicator, per-student independent navigation with explicit Next /
 * Finish Quiz buttons, refresh resume, the German wait message (no reveal
 * until everyone finishes), and the final reveal on every screen.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const CODE = "12355";

const seededQuiz = {
  code: CODE,
  title: "E2E Classroom Quiz",
  description: "Playwright classroom run",
  correctVisibility: "atEnd",
  status: "published",
  createdAt: 1_700_000_000_000,
  questions: [1, 2, 3].map((i) => ({
    id: `q${i}`,
    text: `Question ${i}: what is the answer?`,
    points: 100,
    timeLimitSec: 60,
    speedBonus: false,
    answers: [
      { id: `q${i}_right`, text: `right choice ${i}`, correct: true },
      { id: `q${i}_wrong1`, text: `wrong choice ${i}a`, correct: false },
      { id: `q${i}_wrong2`, text: `wrong choice ${i}b`, correct: false },
    ],
  })),
};

function log(step: string) {
  console.log(`  · ${step}`);
}

async function waitFor(page: Page, text: string, timeout = 30_000): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

/** Pick an answer (saved instantly), then press Next / Finish Quiz. */
async function answerQuestion(page: Page, label: string, qIndex: number, action: "Next" | "Finish Quiz"): Promise<void> {
  await waitFor(page, `Question ${qIndex} of 3`, 30_000);
  await page.getByRole("button", { name: /right choice|wrong choice/ }).first().click();
  await page.getByRole("button", { name: action, exact: true }).click();
  log(`${label} answered question ${qIndex} → ${action}`);
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
    const context = await browser.newContext();
    await context.addInitScript((quiz) => {
      localStorage.setItem("dbs_quiz_rooms_v1", JSON.stringify([quiz]));
      sessionStorage.setItem("dbs_admin_session_v1", JSON.stringify(true));
    }, seededQuiz);

    /* ------------------------------- teacher ------------------------------- */
    const teacher = await context.newPage();
    teacher.on("pageerror", (err) => console.error("  [teacher pageerror]", err.message));

    log("opening teacher host screen");
    await teacher.goto(`${BASE}/quiz/room/?code=${CODE}&host=1`);
    await waitFor(teacher, CODE, 30_000);
    await waitFor(teacher, "Room open", 45_000);
    check("teacher: host room opens with code", (await teacher.getByText(CODE).count()) > 0);

    /* ------------------------------- students ------------------------------ */
    const studentA = await context.newPage();
    studentA.on("pageerror", (err) => console.error("  [A pageerror]", err.message));
    log("opening student A");
    await studentA.goto(`${BASE}/quiz/room/?code=${CODE}&name=StudentA`);
    await waitFor(studentA, "You're in!", 45_000);
    check("student A: joins the lobby", true);

    const studentB = await context.newPage();
    studentB.on("pageerror", (err) => console.error("  [B pageerror]", err.message));
    log("opening student B");
    await studentB.goto(`${BASE}/quiz/room/?code=${CODE}&name=StudentB`);
    await waitFor(studentB, "You're in!", 45_000);
    check("student B: joins the lobby", true);

    await waitFor(teacher, "2 joined", 30_000);
    check("teacher: sees both students in the lobby", true);

    /* -------------------------------- start -------------------------------- */
    log("teacher starts the quiz");
    await teacher.getByRole("button", { name: "Start quiz" }).click();
    await waitFor(teacher, "Per-question progress", 15_000);
    check("teacher: quiz started (progress monitor visible)", true);

    await waitFor(studentA, "Question 1 of 3", 30_000);
    check("student A: question flow begins with progress indicator", true);

    const aBody = await studentA.innerText("body");
    // The results review uses the label "Correct answer:"; the live question
    // screen must never show it (nor any per-option correctness marking).
    check("student A: no correctness info pre-reveal", !aBody.includes("Correct answer:"));

    /* -------------------- timer bar + live countdown ----------------------- */
    const timerBar = studentA.locator('[aria-label="Question timer"]');
    check("student A: timer bar visible above the question", await timerBar.isVisible());
    const secondsText = await timerBar.locator("span").innerText();
    check("student A: countdown seconds shown beside the bar", /^\d+s$/.test(secondsText.trim()));
    const barBox = await timerBar.boundingBox();
    const qBox = await studentA.locator("p.text-xl").first().boundingBox();
    check(
      "student A: timer bar sits above the question card",
      barBox !== null && qBox !== null && barBox.y < qBox.y,
    );
    const secs1 = Number.parseInt(secondsText, 10);
    await studentA.waitForTimeout(1_600);
    const secs2 = Number.parseInt(await timerBar.locator("span").innerText(), 10);
    check("student A: countdown ticks down live", secs1 > 0 && secs2 < secs1);

    /* ------------- A moves ahead while B still plays (Next) ---------------- */
    log("student A answers question 1 and presses Next");
    await waitFor(studentA, "Question 1 of 3", 30_000);
    await studentA.getByRole("button", { name: /right choice|wrong choice/ }).first().click();
    await studentA.waitForTimeout(700); // host feedback round-trip
    const aRightCls =
      (await studentA.getByRole("button", { name: /right choice 1/ }).getAttribute("class")) ?? "";
    const aWrongCls =
      (await studentA.getByRole("button", { name: /wrong choice 1a/ }).getAttribute("class")) ?? "";
    check("feedback: correct pick turns green", aRightCls.includes("bg-emerald-500"));
    check("feedback: wrong choices fade out after a correct pick", aWrongCls.includes("opacity-0"));
    await studentA.getByRole("button", { name: "Next", exact: true }).click();
    log("A answered question 1 → Next");
    await waitFor(studentA, "Question 2 of 3", 15_000);
    check("student A: Next advances to question 2", true);

    await waitFor(studentB, "Question 1 of 3", 15_000);
    const bMidBody = await studentB.innerText("body");
    check(
      "independent navigation: A on question 2 while B still on question 1",
      bMidBody.includes("Question 1 of 3"),
    );

    /* --------------------- A refreshes mid-question ------------------------ */
    log("student A refreshes the page on question 2");
    await studentA.reload();
    await waitFor(studentA, "Question 2 of 3", 45_000);
    check("refresh: A resumes at question 2 (no reset)", true);
    const teacherMid = await teacher.innerText("body");
    check(
      "refresh: A's Q1 answer persisted on the host (1/3 answered)",
      teacherMid.includes("1/3 answered"),
    );

    /* ------------------- A finishes → German wait screen -------------------- */
    log("student A finishes the quiz");
    await answerQuestion(studentA, "A", 2, "Next");
    await answerQuestion(studentA, "A", 3, "Finish Quiz");
    await waitFor(studentA, "Du hast den Quiz beendet", 20_000);
    check("student A: German wait message after Finish Quiz", true);
    const aMidBody = await studentA.innerText("body");
    check(
      "student A: no reveal while B is unfinished",
      !aMidBody.includes("Results revealed") && !aMidBody.includes("Top 3"),
    );

    /* --------------------------- B finishes → reveal ------------------------ */
    log("student B answers everything (wrong pick on Q1 to verify red/green feedback)");
    await waitFor(studentB, "Question 1 of 3", 30_000);
    await studentB.getByRole("button", { name: /wrong choice 1a/ }).click();
    await studentB.waitForTimeout(700);
    const bWrongCls =
      (await studentB.getByRole("button", { name: /wrong choice 1a/ }).getAttribute("class")) ?? "";
    const bRightCls =
      (await studentB.getByRole("button", { name: /right choice 1/ }).getAttribute("class")) ?? "";
    const bOtherCls =
      (await studentB.getByRole("button", { name: /wrong choice 1b/ }).getAttribute("class")) ?? "";
    check("feedback: wrong pick turns red", bWrongCls.includes("bg-rose-500"));
    check("feedback: correct answer stays visible in green", bRightCls.includes("bg-emerald-500"));
    check("feedback: other wrong choice fades out", bOtherCls.includes("opacity-0"));
    check(
      "feedback: faded card is non-interactive",
      await studentB.getByRole("button", { name: /wrong choice 1b/ }).isDisabled(),
    );
    await studentB.getByRole("button", { name: "Next", exact: true }).click();
    log("B answered question 1 (wrong) → Next");
    await answerQuestion(studentB, "B", 2, "Next");
    await answerQuestion(studentB, "B", 3, "Finish Quiz");

    log("waiting for reveal on every screen");
    await waitFor(studentA, "Results revealed", 30_000);
    check("student A: reveal arrives when everyone finishes", true);
    await waitFor(studentB, "Results revealed", 30_000);
    check("student B: reveal arrives", true);

    const aResult = await studentA.innerText("body");
    check("student A: sees the shared leaderboard", aResult.includes("StudentB"));
    check("student A: sees answer key after reveal", aResult.includes("Correct answer"));
    check("student A: podium visible", aResult.includes("Top 3"));
    check(
      "no answer was lost across refresh — nothing shows Unanswered",
      !aResult.includes("Unanswered"),
    );

    await waitFor(teacher, "Results revealed", 30_000);
    check("teacher: sees the reveal + leaderboard", (await teacher.getByText("Leaderboard").count()) > 0);

    const teacherBody = await teacher.innerText("body");
    check("teacher: saved-run confirmation", teacherBody.includes("saved"));

    /* ------------------------------ summary -------------------------------- */
    await studentA.close();
    await studentB.close();
    await teacher.close();

    if (failures.length > 0) {
      console.error(`\nE2E FAILED: ${failures.length} check(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll classroom E2E checks passed.");
    }
  } catch (err) {
    console.error("\nE2E ERROR:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

void run();
