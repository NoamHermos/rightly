"use strict";

// Real KaTeX regression coverage. Setup: npm ci --prefix tests
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const repo = path.resolve(__dirname, "..");
const output = path.join(repo, "out", "chrome-rtl");
const katex = require("katex");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const samples = [
    ["hebrew", String.raw`\boxed{\text{שגיאת אימון גבוהה}}`],
    ["hebrew-test", String.raw`\boxed{\text{שגיאת מבחן גבוהה}}`],
    ["mixed-text", String.raw`\boxed{\text{Empirical risk — סיכון אמפירי}}`],
    ["english", String.raw`\boxed{\text{Underfitting}}`],
    ["fraction", String.raw`\boxed{\hat R_S(h)=\frac{1}{n}\sum_{i=1}^n \ell(h(x_i),y_i)}`],
    ["formula-with-text", String.raw`\boxed{x^2+\text{שגיאה}}`],
    ["inline", String.raw`\boxed{\text{תוצאה בעברית}}`],
    ["gradient", String.raw`\boxed{
-\nabla f
\text{ הוא כיוון הירידה המהירה ביותר}
}`],
    ["gradient-spaced", String.raw`\boxed{-\nabla f\ \text{הוא כיוון הירידה המהירה ביותר}}`],
    ["gradient-unboxed", String.raw`-\nabla f\text{ הוא כיוון הירידה המהירה ביותר}`],
    ["gradient-equation", String.raw`-\nabla f = \text{כיוון הירידה המהירה ביותר}`],
    ["change", String.raw`\boxed{\text{שינוי כולל}\approx\text{השפעת התזוזה בציר הראשון}+\text{השפעת התזוזה בציר השני}}`],
    ["arrow", String.raw`S\xrightarrow{\text{אלגוריתם אימון}}\mathbf{w}`]
  ];
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).startsWith("No character metrics for")) warnings.push(args[0]);
    else originalWarn(...args);
  };
  const renderedSamples = samples.map(([id, source]) => [id, katex.renderToString(source, { displayMode: id !== "inline", strict: "ignore" })]);
  console.warn = originalWarn;
  const html = `<!doctype html><meta charset="utf-8"><title>Rightly — מסגרות בעברית</title>
    <link rel="stylesheet" href="${pathToFileURL(require.resolve("katex/dist/katex.min.css"))}">
    <style>body{margin:0;background:#faf9fd;color:#111;font:28px/1.65 Arial,sans-serif}
    main{max-width:880px;margin:32px auto;padding:24px 40px}p{direction:rtl;text-align:right}
    h1{font-size:28px;direction:rtl;text-align:right}
    .katex-display>.katex{overflow-x:auto;overflow-y:hidden}</style>
    <main><h1>מסגרות שמותאמות לגובה האותיות</h1><div class="MarkdownRoot-fixture">
    ${renderedSamples.map(([id, rendered]) => `<div id="${id}"><p>${id === "hebrew" ? "לכן בדרך כלל נקבל:" : id === "hebrew-test" ? "וגם:" : id === "gradient" ? "כלומר:" : "נוסחה או טקסט במסגרת:"}</p>${rendered}</div>`).join("\n")}
    </div></main>`;
  const fixture = path.join(output, "hebrew-box-demo.html");
  fs.writeFileSync(fixture, html);
  const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ executablePath: process.env.RIGHTLY_TEST_CHROME || (fs.existsSync(systemChrome) ? systemChrome : chromium.executablePath()), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
    await page.goto(pathToFileURL(fixture).href);
    await page.evaluate(() => document.fonts.ready);
    const initialText = await page.locator("body").textContent();
    const preserved = {};
    for (const id of ["english", "fraction"]) preserved[id] = await page.locator(`#${id} .katex-html`).innerHTML();
    const mathml = {};
    for (const [id] of samples) mathml[id] = await page.locator(`#${id} .katex-mathml`).innerHTML();
    // Establish the reported defect with the unmodified KaTeX renderer.
    const before = await page.locator("#hebrew .katex-html").evaluate(el => ({
      box: el.querySelector(".fbox").getBoundingClientRect().height,
      text: el.querySelector(".text").getBoundingClientRect().height
    }));
    assert.ok(before.box < before.text, "Fixture must reproduce a frame shorter than the Hebrew letters");
    await page.screenshot({ path: path.join(output, "hebrew-box-before.png"), fullPage: true });
    await page.locator("#gradient").screenshot({ path: path.join(output, "sentence-order-before.png") });
    await page.addStyleTag({ path: path.join(repo, "src", "chrome", "chatgpt-rtl.css") });
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, "src", "chrome", "manifest.json"), "utf8"));
    for (const script of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(repo, "src", "chrome", script) });
    let checks = 0;
    async function checkTextBox(id) {
      const actual = await page.locator(`#${id} .katex-html`).evaluate(el => {
        const owner = el.querySelector(".fbox");
        if (!owner) return null;
        const box = owner.getBoundingClientRect();
        const textNodes = [...el.querySelectorAll(".text")];
        const rects = textNodes.map(node => node.getBoundingClientRect());
        const text = { top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)), left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)) };
        const display = el.closest(".katex-display");
        const outer = display && display.getBoundingClientRect();
        return {
          top: text.top - box.top, bottom: box.bottom - text.bottom,
          left: text.left - box.left, right: box.right - text.right,
          centered: outer ? Math.abs((outer.left + outer.width / 2) - (box.left + box.width / 2)) : 0,
          fits: !outer || box.width <= outer.width,
          scrollable: getComputedStyle(el.closest(".katex")).overflowX === "auto",
          border: getComputedStyle(owner).borderTopWidth,
          rtlText: textNodes.every(node => getComputedStyle(node).direction === "rtl"),
          originalBorderVisible: getComputedStyle(owner.parentElement).display !== "none"
        };
      });
      assert.ok(actual, `Missing frame for ${id}`);
      assert.ok(actual.top >= 2 && actual.bottom >= 2, `${id}: border must clear the letters vertically: ${JSON.stringify(actual)}`);
      assert.ok(actual.left >= 2 && actual.right >= 2, `${id}: border must clear letters horizontally`);
      if (actual.fits) assert.ok(actual.centered <= 2, `${id}: display formula must stay centered (${actual.centered}px)`);
      else assert.equal(actual.scrollable, true, `${id}: oversized formulas must remain horizontally scrollable`);
      assert.ok(parseFloat(actual.border) > 0);
      assert.equal(actual.originalBorderVisible, true);
      assert.equal(actual.rtlText, true, `${id}: Hebrew text direction`);
      checks++;
    }
    for (const id of ["hebrew", "hebrew-test", "mixed-text", "formula-with-text", "inline", "gradient", "gradient-spaced", "change"]) await checkTextBox(id);
    async function checkSentenceOrder(id) {
      const actual = await page.locator(`#${id} .katex-html`).evaluate(el => {
        const text = el.querySelector(".text").getBoundingClientRect();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const glyphs = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement.closest(".text")) continue;
          for (let index = 0; index < node.length; index++) {
            if (!/[−∇f]/.test(node.textContent[index])) continue;
            const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
            const rect = range.getBoundingClientRect(); glyphs.push({char:node.textContent[index],left:rect.left,right:rect.right});
          }
        }
        const relation = [...el.querySelectorAll(".mrel")].find(node => node.textContent === "=")?.getBoundingClientRect();
        return { glyphs, gap: Math.min(...glyphs.map(g => g.left)) - text.right,
          relationBetween: !relation || (relation.left > text.right && relation.right < Math.min(...glyphs.map(g => g.left))) };
      });
      assert.equal(actual.glyphs.map(g => g.char).join(""), "−∇f");
      assert.ok(actual.glyphs.every((g, index, all) => !index || all[index - 1].left < g.left), `${id}: preserve minus/gradient/variable order`);
      assert.ok(actual.gap >= 2, `${id}: mathematical subject must sit right of the Hebrew phrase with a gap: ${JSON.stringify(actual)}`);
      assert.ok(actual.relationBetween, `${id}: equality must separate the mathematical subject and Hebrew phrase`);
      checks++;
    }
    for (const id of ["gradient", "gradient-spaced", "gradient-unboxed", "gradient-equation"]) await checkSentenceOrder(id);
    await page.locator("#gradient").screenshot({ path: path.join(output, "sentence-order-after.png") });
    const equationTextOrder = await page.locator("#change .text").evaluateAll(nodes => {
      const rects = nodes.map(node => node.getBoundingClientRect());
      return rects.every((rect, index) => !index || rects[index - 1].left > rect.right);
    });
    assert.equal(equationTextOrder, true, "Hebrew phrases in a textual equation must follow logical RTL order");
    const algebraOrder = await page.locator("#formula-with-text .katex-html").evaluate(el =>
      el.querySelector(".mathnormal").getBoundingClientRect().right < el.querySelector(".text").getBoundingClientRect().left);
    assert.equal(algebraOrder, true, "A single Hebrew label must preserve the surrounding algebra order");
    checks += 2;
    assert.equal(await page.locator("body").textContent(), initialText, "Do not rewrite math or accessible MathML");
    for (const id of ["english", "fraction"]) {
      assert.equal(await page.locator(`#${id} .katex-html`).innerHTML(), preserved[id], `${id}: preserve mathematical and English boxes`);
      assert.equal(await page.locator(`#${id} [data-rightly-hebrew-math]`).count(), 0);
      checks++;
    }
    for (const [id] of samples) assert.equal(await page.locator(`#${id} .katex-mathml`).innerHTML(), mathml[id], `${id}: preserve accessible math and TeX source`);
    // Actual glyph ordering, not just CSS direction: the first Hebrew letter
    // must appear to the right of the last letter inside its text run.
    const glyphOrder = await page.locator("#hebrew .text").evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/[א-ת]/.test(node.textContent)) nodes.push(node);
      const first = document.createRange(); first.setStart(nodes[0], 0); first.setEnd(nodes[0], 1);
      const lastNode = nodes[nodes.length - 1]; const last = document.createRange();
      last.setStart(lastNode, lastNode.length - 1); last.setEnd(lastNode, lastNode.length);
      return first.getBoundingClientRect().left > last.getBoundingClientRect().left;
    });
    assert.equal(glyphOrder, true, "Hebrew glyphs must be read right to left");
    checks++;
    async function checkArrow() {
      await page.locator("#arrow").screenshot({ path: path.join(output, "arrow-current.png") });
      const actual = await page.locator("#arrow .katex-html").evaluate(el => {
        const label = el.querySelector(".text");
        const labelRect = label.getBoundingClientRect();
        const formula = el.closest(".katex").getBoundingClientRect();
        const arrow = el.querySelector(".hide-tail svg")?.getBoundingClientRect();
        return { top: labelRect.top - formula.top, bottom: formula.bottom - labelRect.bottom, aboveArrow: arrow && labelRect.bottom < arrow.top + arrow.height / 2, direction: getComputedStyle(label).direction };
      });
      assert.ok(actual.top >= -1 && actual.bottom >= -1, `Arrow label must fit within its formula: ${JSON.stringify(actual)}`);
      assert.ok(actual.aboveArrow, "Arrow label must sit above the arrow");
      assert.equal(actual.direction, "rtl");
      checks++;
    }
    await checkArrow();
    const arrowDirection = await page.locator("#arrow .katex-html").evaluate(el =>
      el.querySelector(".mathnormal").getBoundingClientRect().right < el.querySelector(".mathbf").getBoundingClientRect().left);
    assert.equal(arrowDirection, true, "Hebrew labels must not reverse the mathematical arrow");
    checks++;
    await page.setViewportSize({ width: 680, height: 1200 });
    await page.locator("main").evaluate(el => { el.style.fontSize = "36px"; });
    for (const id of ["hebrew", "hebrew-test", "inline"]) await checkTextBox(id);
    await checkTextBox("gradient");
    await checkSentenceOrder("gradient");
    await checkArrow();
    // Streaming updates to the same formula root remove the fix for English
    // and restore it for Hebrew, while newly inserted roots are repaired too.
    const streamedEnglish = renderedSamples.find(([id]) => id === "english")[1];
    await page.locator("#hebrew .katex").evaluate((el, rendered) => {
      const template = document.createElement("template"); template.innerHTML = rendered;
      el.innerHTML = template.content.querySelector(".katex").innerHTML;
    }, streamedEnglish);
    await page.waitForFunction(() => !document.querySelector("#hebrew [data-rightly-hebrew-math]"));
    assert.equal(await page.locator("#hebrew .katex-html").innerHTML(), preserved.english);
    checks++;
    const streamedHebrew = renderedSamples.find(([id]) => id === "hebrew")[1];
    await page.locator("#hebrew .katex").evaluate((el, rendered) => {
      const template = document.createElement("template"); template.innerHTML = rendered;
      el.innerHTML = template.content.querySelector(".katex").innerHTML;
    }, streamedHebrew);
    await page.waitForFunction(() => !!document.querySelector("#hebrew [data-rightly-hebrew-math]"));
    await checkTextBox("hebrew");
    await page.locator("#hebrew").evaluate((el, rendered) => { el.innerHTML = rendered; }, streamedHebrew);
    await page.waitForFunction(() => !!document.querySelector("#hebrew [data-rightly-hebrew-math]"));
    await checkTextBox("hebrew");
    await page.setViewportSize({ width: 1100, height: 1200 });
    await page.locator("main").evaluate(el => { el.style.fontSize = ""; });
    await page.screenshot({ path: path.join(output, "hebrew-box-after.png"), fullPage: true });
    const mutations = await page.evaluate(() => new Promise(resolve => {
      let count = 0; const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { observer.disconnect(); resolve(count); }, 250);
    }));
    assert.equal(mutations, 0, "Math repair must settle without a rendering loop");
    console.log(`Real KaTeX Hebrew checks passed (${checks} layout/preservation checks; frame clearance, RTL glyph order, arrow labels, centering, enlarged text, streaming, original MathML).`);
    console.log(`Original frame: ${before.box.toFixed(1)}px; original Hebrew text: ${before.text.toFixed(1)}px.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
