import { chromium, type Browser, type Page } from "playwright";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_SESSION_KEY = "dbs_admin_session_v1";
const ADMIN_PASSWORD = "123456";

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

async function adminPage(browser: Browser, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext(viewport ? { viewport } : undefined);
  await ctx.addInitScript(`(() => {
    sessionStorage.setItem("${ADMIN_SESSION_KEY}", JSON.stringify(true));
  })();`);
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("  [pageerror]", err.message));
  await page.goto(`${BASE}/admin/`);
  await waitForText(page, "Admin Dashboard", 30_000);
  return { ctx, page };
}

async function runDesktop(browser: Browser) {
  const { ctx, page } = await adminPage(browser);
  try {
    const modifier = page.getByRole("button", { name: "Modifier" });
    check("Modifier button is visible in the Admin header", await modifier.isVisible());

    await modifier.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    check("clicking Modifier opens the share-link dialog", await dialog.isVisible());

    const linkInput = dialog.getByLabel("Editing link");
    const expectedLink = `${BASE}/admin/`;
    check("dialog shows the real existing Admin route", (await linkInput.inputValue()) === expectedLink);
    check(
      "dialog honestly states that cross-device sync is not active",
      (await dialog.getByText("Cross-device sync is not active yet").count()) === 1,
    );

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await dialog.getByRole("button", { name: "Copier le lien" }).click();
    const clipboard = await page.evaluate("navigator.clipboard.readText()");
    check("Copier le lien copies the Admin link", clipboard === expectedLink);

    const untrusted = await browser.newContext();
    try {
      const phone = await untrusted.newPage();
      await phone.goto(`${BASE}/admin/`);
      await waitForText(phone, "Admin login", 20_000);
      check(
        "the link is protected by the existing admin login",
        (await phone.getByRole("heading", { name: "Admin login" }).count()) === 1 &&
          (await phone.getByText("Admin Dashboard").count()) === 0,
      );

      await phone.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await phone.getByRole("button", { name: "Login" }).click();
      await waitForText(phone, "Admin Dashboard", 20_000);
      check("after login the link opens the existing editing interface", true);
    } finally {
      await untrusted.close();
    }
  } finally {
    await ctx.close();
  }
}

async function runMobile(browser: Browser) {
  const { ctx, page } = await adminPage(browser, { width: 390, height: 844 });
  try {
    check("mobile: Modifier button is visible", await page.getByRole("button", { name: "Modifier" }).isVisible());
    await page.getByRole("button", { name: "Modifier" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    check(
      "mobile: link and copy button work in the dialog",
      (await dialog.getByLabel("Editing link").inputValue()) === `${BASE}/admin/` &&
        (await dialog.getByRole("button", { name: "Copier le lien" }).isVisible()),
    );
    const noHorizontalOverflow =
      (await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")) === true;
    check("mobile: Admin header and dialog fit without horizontal page scrolling", noHorizontalOverflow);
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
    console.error(`\nMODIFIER E2E FAILED: ${failures.length} check(s):`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${passed} modifier E2E checks passed.`);
  }
}

void run();
