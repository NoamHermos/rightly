"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const repo = path.resolve(__dirname, "..");
  const extension = path.join(repo, "src", "chrome");
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://chatgpt.com/*", "https://chat.openai.com/*"]);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.background, undefined);
  const output = path.join(repo, "out", "chrome-rtl");
  fs.mkdirSync(output, { recursive: true });
  const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const executablePath = process.env.RIGHTLY_TEST_CHROME ||
    (fs.existsSync(systemChrome) ? systemChrome : chromium.executablePath());
  // This is a separate headless test browser; no user profile or tabs are used.
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1250 } });
    await page.setContent(fs.readFileSync(path.join(__dirname, "fixtures", "chatgpt-rtl.html"), "utf8"));
    const originalText = await page.locator("body").textContent();
    await page.addStyleTag({ path: path.join(extension, "chatgpt-rtl.css") });
    for (const script of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(extension, script) });
    let checks = 0;
    async function checkDirection(id, expected, expectedAlign) {
      await page.waitForFunction(({ id, expected, expectedAlign }) => {
        const node = document.getElementById(id);
        const css = getComputedStyle(node);
        return css.direction === expected && css.textAlign === expectedAlign;
      }, { id, expected, expectedAlign });
      checks++;
    }
    for (const id of ["mixed", "mixed-item", "list", "table", "inline", "user-message", "composer", "composer-mixed", "math-paragraph"]) {
      await checkDirection(id, "rtl", "right");
    }
    for (const id of ["english", "english-item", "english-cell", "code-only", "inline-code", "pre", "code", "composer-english", "stream"]) {
      await checkDirection(id, "ltr", "left");
    }
    // Inline formulas stay in the paragraph; display formulas center their
    // visible equation, not just their full-width wrapper's bounding box.
    await checkDirection("formula", "ltr", "right");
    async function checkCenteredMath() {
      for (const [containerId, equationId] of [
        ["display-formula", "display-base"], ["boxed-formula", "boxed-base"],
        ["hebrew-display", "hebrew-base"], ["mathjax-display", "mathjax-base"]
      ]) {
        const actual = await page.evaluate(({ containerId, equationId }) => {
          const container = document.getElementById(containerId);
          const equation = document.getElementById(equationId);
          const outer = container.getBoundingClientRect();
          const inner = equation.getBoundingClientRect();
          return {
            direction: getComputedStyle(container).direction,
            align: getComputedStyle(container).textAlign,
            offset: Math.abs((outer.left + outer.width / 2) - (inner.left + inner.width / 2))
          };
        }, { containerId, equationId });
        assert.equal(actual.direction, "ltr", containerId);
        assert.equal(actual.align, "center", containerId);
        assert.ok(actual.offset <= 1, `${equationId} is ${actual.offset}px away from the center`);
        checks++;
      }
    }
    await checkCenteredMath();
    await checkDirection("display-inner", "ltr", "center");
    // Cover a narrow viewport and a containing block that switches from RTL
    // to LTR, without changing the meaning of inline math or ordinary prose.
    await page.setViewportSize({ width: 600, height: 1250 });
    await checkCenteredMath();
    await page.locator("#display-math-parent").evaluate(el => el.dir = "ltr");
    await checkCenteredMath();
    await page.setViewportSize({ width: 1200, height: 1250 });
    assert.equal(await page.locator("body").textContent(), originalText, "Message text must not change");
    assert.equal(await page.locator("#navigation").getAttribute("data-rightly-chat-dir"), null);
    assert.equal(await page.locator("html").getAttribute("dir"), null);
    // Streaming tokens must flip an initially English paragraph to Hebrew.
    await page.locator("#stream").evaluate(el => el.append(" שלום"));
    await checkDirection("stream", "rtl", "right");
    await page.locator("#stream").evaluate(el => { el.textContent = "Hello again"; });
    await checkDirection("stream", "ltr", "left");
    // Site rerenders must not reset the managed direction to auto.
    await page.locator("#mixed").evaluate(el => el.setAttribute("dir", "auto"));
    await page.waitForFunction(() => document.querySelector("#mixed").getAttribute("dir") === "rtl");
    // SPA navigation/new messages and nested inline nodes.
    await page.locator("main").evaluate(el => {
      const message = document.createElement("div");
      message.innerHTML = '<div class="MarkdownRoot-new"><p id="new-message"><strong>PowerShell</strong> פקודה חדשה</p></div>';
      el.append(message);
    });
    await checkDirection("new-message", "rtl", "right");
    // A display formula inserted during streaming gets the same centering.
    await page.locator("#display-math-parent").evaluate(el => {
      el.insertAdjacentHTML("beforeend", '<span class="katex-display" id="streamed-display"><span class="katex"><span class="katex-html"><span class="base" id="streamed-base">R(h) = E[ℓ(h(x), y)]</span></span></span></span>');
    });
    await checkDirection("streamed-display", "ltr", "center");
    const streamedOffset = await page.locator("#streamed-base").evaluate(el => {
      const inner = el.getBoundingClientRect();
      const outer = el.closest(".katex-display").getBoundingClientRect();
      return Math.abs(inner.left + inner.width / 2 - outer.left - outer.width / 2);
    });
    assert.ok(streamedOffset <= 1);
    // Use actual keyboard input; verify contenteditable selection survives.
    await page.locator("#composer").fill("Windows בדיקת הקלדה");
    await checkDirection("composer", "rtl", "right");
    await page.locator("#composer").press("End");
    await page.locator("#composer").pressSequentially("!");
    await page.waitForFunction(() => document.querySelector("#composer").textContent.endsWith("!"));
    assert.equal(await page.locator("#composer").textContent(), "Windows בדיקת הקלדה!");
    await page.locator("#composer").fill("English input");
    await checkDirection("composer", "ltr", "left");
    await page.locator("#composer").fill("");
    await page.waitForFunction(() => !document.querySelector("#composer").hasAttribute("data-rightly-chat-dir"));
    assert.equal(await page.locator("#composer").getAttribute("dir"), null);
    await page.locator("#composer").fill("ChatGPT תיבת הכתיבה מסודרת מימין לשמאל");
    await checkDirection("composer", "rtl", "right");
    // A settled document must not cause an observer feedback loop.
    const count = await page.evaluate(() => new Promise(resolve => {
      let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; });
      observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
      setTimeout(() => { observer.disconnect(); resolve(mutations); }, 250);
    }));
    assert.equal(count, 0, "RTL processing should settle without repeated mutations");
    await page.screenshot({ path: path.join(output, "verified-demo.png"), fullPage: true });
    console.log(`Chrome RTL browser checks passed (${checks} direction/layout checks, unchanged text, centered display math, streaming, SPA, input, reset, idempotence).`);
    console.log(`Screenshot: ${path.join(output, "verified-demo.png")}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
