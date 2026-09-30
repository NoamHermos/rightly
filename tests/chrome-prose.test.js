"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const repo = path.resolve(__dirname, "..");
  const extension = path.join(repo, "src", "chrome");
  const output = path.join(repo, "out", "chrome-rtl");
  fs.mkdirSync(output, { recursive: true });
  const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ executablePath: process.env.RIGHTLY_TEST_CHROME || (fs.existsSync(systemChrome) ? systemChrome : chromium.executablePath()), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1250, height: 1200 } });
    await page.setContent(`<!doctype html><meta charset="utf-8">
      <style>body{font:28px/1.65 Arial;background:#faf9fd;color:#111}main{padding:20px}p{direction:rtl;margin:20px 0}.isolated{direction:ltr;unicode-bidi:isolate}</style>
      <nav id="nav">תפריט →</nav><main><div class="markdown" id="examples">
      <p id="missing"><strong>Train</strong>נלמדים על Parameters.</p>
      <p id="trailing"><strong class="isolated">Validation / Cross Validation </strong>נבחרים באמצעות Hyperparameters.</p>
      <p id="existing"><strong>Train</strong> נלמדים על Parameters.</p>
      <p id="nested"><strong><span>Train</span></strong>נלמדים על Parameters.</p>
      <p id="plain-start">Trainנלמדים על Parameters.</p>
      <p id="plain-start-spaced">Train נלמדים על Parameters.</p>
      <p id="plain-long-start">Validation / Cross Validationנבחרים באמצעות Hyperparameters.</p>
      <p id="split-start">Train<!-- streaming boundary -->נלמדים על Parameters.</p>
      <p id="line-boundary">Train<br>נלמדים על Parameters.</p>
      <p id="start-code"><code>Trainנלמדים</code> קוד מקורי.</p>
      <p id="period">לא לפי Train — כי אז בדרך כלל נעדיף את המודל שמתאים הכי חזק ל־<span dir="ltr">train.</span></p>
      <p id="quote">ולא לפי Test — כי אז אנחנו &quot;מלמדים את ה־<span class="isolated">test&quot;.</span></p>
      <p id="plain-period">המודל נבדק על train.</p>
      <p id="arrow">אם ניקח training set קצת אחר ונקבל מודל שונה מאוד → variance גבוה.</p>
      <p id="nested-arrow">שינוי קטן <strong>⇒</strong> תוצאה גדולה.</p>
      <p id="english">English → text. <span dir="ltr">Keep me.</span></p>
      <p id="protected">עברית <code>train. → x</code> <span class="katex">x → y</span> <a href="https://example.com/">קישור →</a></p>
      <p id="stream">התחלה → תוצאה</p>
      <p id="prefix">ל<strong>train</strong> יש שימוש.</p>
      <div contenteditable="true" id="prompt-textarea">כתיבה <strong dir="ltr">train.</strong> → בדיקה</div>
      </div></main>`);
    const originals = await page.locator("#examples > *, nav").evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.id, n.textContent])));
    // Geometry of individual glyphs proves spacing and punctuation placement;
    // CSS attributes alone do not establish what a reader actually sees.
    async function chars(id) {
      return page.locator(`#${id}`).evaluate(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), chars = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let i = 0; i < node.length; i++) {
          const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
          const rect = r.getBoundingClientRect(); chars.push({ char: node.data[i], left: rect.left, right: rect.right, top: rect.top });
        }
        return chars;
      });
    }
    async function gap(id) {
      const all = await chars(id), hebrew = all.findIndex(c => /[א-ת]/u.test(c.char));
      const latin = all.slice(0, hebrew).filter(c => /[A-Za-z]/.test(c.char));
      return Math.min(...latin.map(c => c.left)) - all[hebrew].right;
    }
    assert.ok(await gap("missing") < 3, "Fixture reproduces missing boundary space");
    const beforeDot = await chars("period");
    assert.ok(beforeDot.at(-1).left > beforeDot.at(-6).left, "Fixture reproduces English-isolated trailing dot");
    await page.locator("#examples").screenshot({ path: path.join(output, "prose-before.png") });
    await page.addStyleTag({ path: path.join(extension, "chatgpt-rtl.css") });
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
    for (const script of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(extension, script) });
    for (const id of ["missing", "trailing", "existing", "nested", "plain-start", "plain-start-spaced", "plain-long-start", "split-start"]) assert.ok(await gap(id) >= 4, `${id}: English word needs a visible gap before Hebrew`);
    assert.equal(await page.locator("#plain-start").textContent(), await page.locator("#plain-start-spaced").textContent(), "Plain text needs exactly one separating space, regardless of formatting");
    assert.ok(Math.abs(await gap("missing") - await gap("nested")) <= 1, "Nested emphasis must not duplicate the added gap");
    async function checkDot(id) {
      const all = await chars(id), dot = all.at(-1);
      const ending = all.slice(-6, -1).filter(c => /[a-z]/.test(c.char));
      assert.equal(dot.char, ".");
      assert.ok(dot.right <= Math.min(...ending.map(c => c.left)) + 1, `${id}: period must finish the Hebrew sentence left of its English ending`);
    }
    for (const id of ["period", "quote", "plain-period"]) await checkDot(id);
    const quote = await chars("quote");
    assert.ok(quote.at(-1).right <= quote.at(-2).left + 1, "Closing quote comes before the final period in RTL reading order");
    const expected = { ...originals, arrow: originals.arrow.replace("→", "←"), "nested-arrow": originals["nested-arrow"].replace("⇒", "⇐"), stream: originals.stream.replace("→", "←") };
    for (const id of ["missing", "nested", "plain-start", "split-start"]) expected[id] = "Train נלמדים על Parameters.";
    expected["plain-long-start"] = "Validation / Cross Validation נבחרים באמצעות Hyperparameters.";
    for (const [id, text] of Object.entries(expected)) assert.equal(await page.locator(`#${id}`).textContent(), text, `${id}: preserve wording, whitespace and protected arrows`);
    assert.equal(await page.locator("#protected [data-rightly-prose-inline], #prompt-textarea [data-rightly-prose-inline], #prefix [data-rightly-prose-gap]").count(), 0);
    assert.equal(await page.locator("#english span").getAttribute("data-rightly-prose-inline"), null);
    await page.locator("#examples").screenshot({ path: path.join(output, "prose-after.png") });
    await page.locator("#plain-start").evaluate(el => { el.firstChild.data = "Train"; });
    await page.waitForFunction(() => document.querySelector("#plain-start").getAttribute("dir") === "ltr");
    await page.locator("#plain-start").evaluate(el => el.firstChild.appendData("נלמדים מחדש."));
    await page.waitForFunction(() => document.querySelector("#plain-start").textContent === "Train נלמדים מחדש.");
    await page.locator("#plain-start").evaluate(el => el.firstChild.appendData(" עוד טקסט"));
    await page.waitForFunction(() => document.querySelector("#plain-start").textContent === "Train נלמדים מחדש. עוד טקסט");
    // Preserve element identity and events while changing a displayed arrow.
    await page.locator("#nested-arrow strong").evaluate(el => { el.addEventListener("click", () => el.setAttribute("data-clicked", "yes")); });
    await page.locator("#nested-arrow strong").click();
    assert.equal(await page.locator("#nested-arrow strong").getAttribute("data-clicked"), "yes");
    // Append to the already corrected text, then rerender from original text.
    await page.locator("#stream").evaluate(el => el.firstChild.appendData(" → המשך"));
    await page.waitForFunction(() => document.querySelector("#stream").textContent === "התחלה ← תוצאה ← המשך");
    await page.locator("#stream").evaluate(el => { el.firstChild.data = "התחלה → תוצאה חדשה"; });
    await page.waitForFunction(() => document.querySelector("#stream").textContent === "התחלה ← תוצאה חדשה");
    await page.locator("#stream").evaluate(el => { el.firstChild.data = "English → next"; });
    await page.waitForFunction(() => document.querySelector("#stream").getAttribute("dir") === "ltr");
    assert.equal(await page.locator("#stream").textContent(), "English → next");
    await page.locator("#missing").evaluate(el => { el.innerHTML = '<strong>Train</strong> נלמדים מחדש.'; });
    await page.waitForFunction(() => document.querySelector("#missing strong").hasAttribute("data-rightly-prose-inline"));
    assert.equal(await page.locator("#missing [data-rightly-prose-gap]").count(), 0, "A real space must not get an additional artificial gap");
    await page.setViewportSize({ width: 680, height: 1600 });
    for (const id of ["period", "quote", "plain-period"]) await checkDot(id);
    await page.setViewportSize({ width: 1250, height: 1200 });
    await page.locator("#period").evaluate(el => { el.firstChild.data = "Now English: "; });
    await page.waitForFunction(() => !document.querySelector("#period span").hasAttribute("data-rightly-prose-inline"));
    assert.equal(await page.locator("#period span").getAttribute("dir"), "ltr", "Leave the site's original inline direction available when Hebrew disappears");
    const mutations = await page.evaluate(() => new Promise(resolve => {
      let count = 0; const observer = new MutationObserver(records => count += records.length);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      setTimeout(() => { observer.disconnect(); resolve(count); }, 250);
    }));
    assert.equal(mutations, 0, "Prose repair must settle without repeated arrow swaps or mutations");
    console.log("Chrome prose checks passed: whitespace, trailing punctuation, sentence arrows, protected content, streaming and idempotence.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
