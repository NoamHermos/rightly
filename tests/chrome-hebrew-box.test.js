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
  const sentenceArrows = [
    ["single", String.raw`\to`, "→", "←"],
    ["double", String.raw`\Rightarrow`, "⇒", "⇐"],
    ["long-single", String.raw`\longrightarrow`, "⟶", "⟵"],
    ["long-double", String.raw`\implies`, "⟹", "⟸"],
    ["left-single", String.raw`\leftarrow`, "←", "→"],
    ["left-double", String.raw`\Leftarrow`, "⇐", "⇒"],
    ["long-left-single", String.raw`\longleftarrow`, "⟵", "⟶"],
    ["long-left-double", String.raw`\Longleftarrow`, "⟸", "⟹"]
  ];
  const arrowReplacements = [
    ...sentenceArrows.flatMap(([id, , original, replacement]) =>
      [[`sentence-${id}`, original, replacement], [`boxed-${id}`, original, replacement]]),
    ["short-sentence-arrow", "→", "←"],
    ["user-simple", "⇒", "⇐"],
    ["user-complex", "⇒", "⇐"]
  ];
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
    ["boxed-mle", String.raw`\boxed{MLE = \text{מה הכי מסביר את הנתונים}}`],
    ["boxed-map", String.raw`\boxed{MAP = \text{מה הכי סביר אחרי הנתונים}}`],
    ["boxed-gradient-equation", String.raw`\boxed{-\nabla f = \text{כיוון הירידה המהירה ביותר}}`],
    ["boxed-math-definition", String.raw`\boxed{MLE=A+B=\text{מה הכי מסביר את הנתונים}}`],
    ["p-low", String.raw`p=0.4 \quad \text{קצת סביר}`],
    ["p-mid", String.raw`p=0.5 \quad \text{סביר}`],
    ["p-high", String.raw`p=0.7 \quad \text{מאוד סביר}`],
    ["conditional-probability", String.raw`P(\text{מחלה}\mid\text{בדיקה חיובית})`],
    ["conditional-reverse", String.raw`P(\text{בדיקה חיובית}\mid\text{מחלה})`],
    ["probability-event", String.raw`P(\text{בדיקה חיובית})`],
    ["probability-left-right", String.raw`P\left(\text{בדיקה חיובית}\mid\text{מחלה}\right)`],
    ["probability-one-word", String.raw`P(\text{גשם})=0.7`],
    ["probability-two-words", String.raw`P(\text{אין גשם})=0.3`],
    ["boxed-theta-probability", String.raw`\boxed{\theta^*=P(\text{האוטובוס יאחר})}`],
    ["boxed-probability-two-words", String.raw`\boxed{P(\text{אין גשם})=0.3}`],
    ["hebrew-data-tuple", String.raw`D=(\text{איחר},\text{איחר},\text{איחר},\text{לא איחר})`],
    ["hebrew-data-tuple-left-right", String.raw`D=\left(\text{איחר},\text{איחר},\text{איחר},\text{לא איחר}\right)`],
    ["boxed-hebrew-data-tuple", String.raw`\boxed{D=(\text{איחר},\text{איחר},\text{איחר},\text{לא איחר})}`],
    ["hebrew-set-rain", String.raw`A=\{\text{ירד גשם היום}\}`],
    ["hebrew-set-bus", String.raw`B=\{\text{האוטובוס יאחר}\}`],
    ["hebrew-set-left-right", String.raw`A=\left\{\text{ירד גשם היום}\right\}`],
    ["hebrew-set-lbrace", String.raw`B=\lbrace\text{האוטובוס יאחר}\rbrace`],
    ["hebrew-set-sized", String.raw`A=\bigl\{\text{ירד גשם היום}\bigr\}`],
    ["boxed-hebrew-set", String.raw`\boxed{A=\{\text{ירד גשם היום}\}}`],
    ["hebrew-set-mathcal", String.raw`\mathcal{H}=\{\text{כל הישרים האפשריים במישור}\}`],
    ["hebrew-set-mathcal-left-right", String.raw`\mathcal H=\left\{\text{כל הישרים האפשריים במישור}\right\}`],
    ["hebrew-set-nested", String.raw`A=\{(\text{ירד גשם היום},\text{האוטובוס יאחר})\}`],
    ["hebrew-set-caption", String.raw`A=\{\text{ירד גשם היום}\}\quad\text{הגדרת מאורע}`],
    ["change", String.raw`\boxed{\text{שינוי כולל}\approx\text{השפעת התזוזה בציר הראשון}+\text{השפעת התזוזה בציר השני}}`],
    ["arrow", String.raw`S\xrightarrow{\text{אלגוריתם אימון}}\mathbf{w}`],
    ["english-arrow", String.raw`\text{Simple model}\Rightarrow\text{high Bias, low Variance}`],
    ["math-arrow", String.raw`A\to B\quad\text{העתקה}`],
    ["bidirectional-arrow", String.raw`\text{תנאי ראשון}\Leftrightarrow\text{תנאי שני}`],
    ["vertical-arrow", String.raw`\text{כיוון השינוי}\uparrow\text{ערך גבוה}`],
    ...sentenceArrows.flatMap(([id, command]) => {
      const source = String.raw`\text{מודל פשוט}\ ${command}\ \text{Bias גבוה, Variance נמוך}`;
      return [[`sentence-${id}`, source], [`boxed-${id}`, String.raw`\boxed{${source}}`]];
    }),
    ["short-sentence-arrow", String.raw`\text{קלט}\to\text{פלט}`],
    ["user-simple", String.raw`\text{מודל פשוט} \Rightarrow \text{Bias גבוה, Variance נמוך}`],
    ["user-complex", String.raw`\text{מודל מורכב} \Rightarrow \text{Bias נמוך, Variance גבוה}`]
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
    // Only the displayed connector characters may change; accessible math,
    // TeX, Hebrew wording, and all other text must remain exactly the same.
    const expectedText = await page.locator("body").evaluate((body, replacements) => {
      const expected = body.cloneNode(true);
      for (const [id, original, replacement] of replacements) {
        const arrow = [...expected.querySelectorAll(`#${id} .katex-html .mrel`)].find(node => node.textContent === original);
        arrow.textContent = replacement;
      }
      return expected.textContent;
    }, arrowReplacements);
    const preserved = {};
    for (const id of ["english", "fraction"]) preserved[id] = await page.locator(`#${id} .katex-html`).innerHTML();
    const mathml = {};
    for (const [id] of samples) mathml[id] = await page.locator(`#${id} .katex-mathml`).innerHTML();
    preserved["english-arrow"] = await page.locator("#english-arrow .katex-html").innerHTML();
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
    async function checkSentenceOrder(id, expectedGlyphs = "−∇f") {
      const actual = await page.locator(`#${id} .katex-html`).evaluate((el, expectedGlyphs) => {
        const text = el.querySelector(".text").getBoundingClientRect();
        const relationNode = [...el.querySelectorAll(".mrel")].filter(node => node.textContent === "=").at(-1);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const glyphs = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement.closest(".text") || relationNode?.contains(node)) continue;
          for (let index = 0; index < node.length; index++) {
            if (!expectedGlyphs.includes(node.textContent[index])) continue;
            const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
            const rect = range.getBoundingClientRect(); glyphs.push({char:node.textContent[index],left:rect.left,right:rect.right});
          }
        }
        const relation = relationNode?.getBoundingClientRect();
        return { glyphs, gap: Math.min(...glyphs.map(g => g.left)) - text.right,
          relationBetween: !relation || (relation.left > text.right && relation.right < Math.min(...glyphs.map(g => g.left))) };
      }, expectedGlyphs);
      assert.equal(actual.glyphs.map(g => g.char).join(""), expectedGlyphs);
      assert.ok(actual.glyphs.every((g, index, all) => !index || all[index - 1].left < g.left), `${id}: preserve the internal mathematical order`);
      assert.ok(actual.gap >= 2, `${id}: mathematical subject must sit right of the Hebrew phrase with a gap: ${JSON.stringify(actual)}`);
      assert.ok(actual.relationBetween, `${id}: equality must separate the mathematical subject and Hebrew phrase`);
      checks++;
    }
    for (const id of ["gradient", "gradient-spaced", "gradient-unboxed", "gradient-equation"]) await checkSentenceOrder(id);
    for (const [id, glyphs] of [["boxed-mle", "MLE"], ["boxed-map", "MAP"], ["boxed-gradient-equation", "−∇f"], ["boxed-math-definition", "MLE=A+B"]]) {
      await checkSentenceOrder(id, glyphs);
      await checkTextBox(id);
    }
    await page.locator("#boxed-mle").screenshot({ path: path.join(output, "boxed-mle-after.png") });
    await page.locator("#boxed-map").screenshot({ path: path.join(output, "boxed-map-after.png") });
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
    for (const [id, value] of [["p-low", "0.4"], ["p-mid", "0.5"], ["p-high", "0.7"]]) {
      const positions = await page.locator(`#${id} .katex-html`).evaluate((el, value) => {
        const math = el.querySelector('[data-rightly-math-part="ltr"]');
        const symbol = [...math?.querySelectorAll(".mathnormal") || []].find(node => node.textContent === "p");
        const equals = [...math?.querySelectorAll(".mrel") || []].find(node => node.textContent === "=");
        const number = [...math?.querySelectorAll(".mord") || []].find(node => node.textContent === value);
        const label = el.querySelector('[data-rightly-math-text="rtl"]');
        return [symbol, equals, number, label].map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
      }, value);
      assert.ok(positions.every(Boolean), `${id}: all formula parts remain present`);
      assert.ok(positions[0].right <= positions[1].left + 1 &&
        positions[1].right <= positions[2].left + 1 &&
        positions[3].right <= positions[0].left + 1,
        `${id}: p = ${value} must stay together to the right of the Hebrew label: ${JSON.stringify(positions)}`);
      checks++;
    }
    for (const id of ["conditional-probability", "conditional-reverse", "probability-left-right"]) {
      const positions = await page.locator(`#${id} .katex-html`).evaluate(el => {
        const nodes = [el.querySelector(".mathnormal"), el.querySelector(".mopen"),
          ...el.querySelectorAll('[data-rightly-math-text="rtl"]'),
          el.querySelector(".mrel"), el.querySelector(".mclose")];
        const ordered = [nodes[0], nodes[1], nodes[2], nodes[4], nodes[3], nodes[5]];
        return ordered.map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
      });
      assert.ok(positions.every(Boolean), `${id}: probability notation remains intact`);
      assert.ok(positions.every((rect, index) => !index || positions[index - 1].right <= rect.left + 1),
        `${id}: P(event | condition) must keep its LTR mathematical order: ${JSON.stringify(positions)}`);
      assert.equal(await page.locator(`#${id} [data-rightly-math-flow]`).count(), 0,
        `${id}: do not reverse a conditional probability into an RTL sentence`);
      checks++;
    }
    const eventOrder = await page.locator("#probability-event .katex-html").evaluate(el =>
      [el.querySelector(".mathnormal"), el.querySelector(".mopen"),
        el.querySelector('[data-rightly-math-text="rtl"]'), el.querySelector(".mclose")]
        .map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right })));
    assert.ok(eventOrder.every(Boolean) && eventOrder.every((rect, index) => !index || eventOrder[index - 1].right <= rect.left + 1),
      "P(Hebrew event) must retain its mathematical parenthesis order");
    checks++;
    for (const [id, value] of [["probability-one-word", "0.7"], ["probability-two-words", "0.3"],
      ["boxed-probability-two-words", "0.3"]]) {
      const positions = await page.locator(`#${id} .katex-html`).evaluate((el, value) => {
        const nodes = [el.querySelector(".mathnormal"), el.querySelector(".mopen"),
          el.querySelector('[data-rightly-math-text="rtl"]'), el.querySelector(".mclose"),
          [...el.querySelectorAll(".mrel")].find(node => node.textContent === "="),
          [...el.querySelectorAll(".mord")].find(node => node.textContent === value)];
        return nodes.map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
      }, value);
      assert.ok(positions.every(Boolean) && positions.every((rect, index) => !index || positions[index - 1].right <= rect.left + 1),
        `${id}: P(Hebrew event) = ${value} must keep the same LTR mathematical order: ${JSON.stringify(positions)}`);
      assert.equal(await page.locator(`#${id} [data-rightly-math-flow]`).count(), 0);
      checks++;
    }
    await page.locator("#probability-two-words").screenshot({ path: path.join(output, "probability-two-words-after.png") });
    const thetaProbability = await page.locator("#boxed-theta-probability .katex-html").evaluate(el => {
      const nodes = [el.querySelector(".mathnormal"), el.querySelector(".mrel"),
        [...el.querySelectorAll(".mathnormal")].at(-1), el.querySelector(".mopen"),
        el.querySelector('[data-rightly-math-text="rtl"]'), el.querySelector(".mclose")];
      return nodes.map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
    });
    assert.ok(thetaProbability.every(Boolean) && thetaProbability.every((rect, index) => !index || thetaProbability[index - 1].right <= rect.left + 1),
      `boxed-theta-probability: theta*=P(Hebrew event) must stay mathematical LTR: ${JSON.stringify(thetaProbability)}`);
    assert.equal(await page.locator("#boxed-theta-probability [data-rightly-math-flow]").count(), 0);
    checks++;
    await page.locator("#boxed-theta-probability").screenshot({ path: path.join(output, "boxed-theta-probability-after.png") });
    for (const id of ["hebrew-data-tuple", "hebrew-data-tuple-left-right", "boxed-hebrew-data-tuple",
      "hebrew-set-rain", "hebrew-set-bus", "hebrew-set-left-right", "hebrew-set-lbrace", "hebrew-set-sized", "boxed-hebrew-set"]) {
      const positions = await page.locator(`#${id} .katex-html`).evaluate(el => {
        const nodes = [el.querySelector(".mathnormal"), el.querySelector(".mrel"),
          el.querySelector(".mopen"), ...el.querySelectorAll('[data-rightly-math-text="rtl"]'),
          el.querySelector(".mclose")];
        return nodes.map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
      });
      assert.ok(positions.every(Boolean) && positions.every((rect, index) => !index || positions[index - 1].right <= rect.left + 1),
        `${id}: the assignment and delimited Hebrew labels must keep mathematical order: ${JSON.stringify(positions)}`);
      assert.equal(await page.locator(`#${id} [data-rightly-math-flow]`).count(), 0,
        `${id}: a mathematical tuple or set must not be rearranged like prose`);
      checks++;
    }
    await page.locator("#hebrew-data-tuple").screenshot({ path: path.join(output, "hebrew-data-tuple-after.png") });
    for (const id of ["hebrew-set-mathcal", "hebrew-set-mathcal-left-right"]) {
      const positions = await page.locator(`#${id} .katex-html`).evaluate(el => {
        const nodes = [el.querySelector(".mathcal"), el.querySelector(".mrel"),
          el.querySelector(".mopen"), el.querySelector('[data-rightly-math-text="rtl"]'),
          el.querySelector(".mclose")];
        return nodes.map(node => node?.getBoundingClientRect()).map(rect => rect && ({ left: rect.left, right: rect.right }));
      });
      assert.ok(positions.every(Boolean) && positions.every((rect, index) => !index || positions[index - 1].right <= rect.left + 1),
        `${id}: calligraphic H and Hebrew set braces must keep mathematical LTR order: ${JSON.stringify(positions)}`);
      assert.equal(await page.locator(`#${id} [data-rightly-math-flow]`).count(), 0);
      checks++;
    }
    await page.locator("#hebrew-set-mathcal").screenshot({ path: path.join(output, "hebrew-set-mathcal-after.png") });
    await page.locator("#p-low").screenshot({ path: path.join(output, "p-value-hebrew-after.png") });
    await page.locator("#conditional-probability").screenshot({ path: path.join(output, "conditional-probability-after.png") });
    assert.equal(await page.locator("body").textContent(), expectedText, "Only replace displayed Hebrew sentence arrows; preserve all other text and MathML");
    assert.equal(await page.locator('#hebrew-set-nested [data-rightly-math-flow]').count(), 0,
      "Nested parentheses inside set braces retain mathematical order");
    assert.ok(await page.locator('#hebrew-set-caption [data-rightly-math-flow="rtl"]').count() > 0,
      "Hebrew outside visible braces remains explanatory prose, not part of the set");
    checks += 2;
    await page.locator("#hebrew-set-rain").screenshot({ path: path.join(output, "hebrew-set-rain-after.png") });
    await page.locator("#hebrew-set-bus").screenshot({ path: path.join(output, "hebrew-set-bus-after.png") });
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
    async function checkSentenceArrow(id, original, replacement) {
      const actual = await page.locator(`#${id} .katex-html`).evaluate((el, original) => {
        const arrow = [...el.querySelectorAll(".mrel")].find(node => node.getAttribute("data-rightly-math-arrow") === original);
        if (!arrow) return null;
        const rect = arrow.getBoundingClientRect();
        const text = [...el.querySelectorAll(".text")].map(node => node.getBoundingClientRect());
        return { glyph: arrow.textContent, transform: getComputedStyle(arrow).transform,
          between: text[0].left >= rect.right && rect.left >= text[1].right };
      }, original);
      assert.ok(actual, `${id}: missing corrected arrow`);
      assert.equal(actual.glyph, replacement, `${id}: replace the actual arrow character with its opposite`);
      assert.equal(actual.transform, "none", `${id}: the opposite character must display without CSS mirroring`);
      assert.equal(actual.between, true, `${id}: arrow must separate the RTL subject and result`);
      checks++;
    }
    for (const replacement of arrowReplacements) await checkSentenceArrow(...replacement);
    for (const id of ["arrow", "english-arrow", "math-arrow", "bidirectional-arrow", "vertical-arrow"]) {
      const transforms = await page.locator(`#${id} .mrel`).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).transform));
      assert.ok(transforms.length > 0 && transforms.every(transform => transform === "none"), `${id}: keep mathematical, English, bidirectional and vertical arrows unchanged`);
      assert.equal(await page.locator(`#${id} [data-rightly-math-arrow]`).count(), 0, `${id}: no arrow substitution`);
      checks++;
    }
    assert.equal(await page.locator("#english-arrow .katex-html").innerHTML(), preserved["english-arrow"]);
    await page.locator("#sentence-double").screenshot({ path: path.join(output, "sentence-arrow-double.png") });
    await page.locator("#sentence-single").screenshot({ path: path.join(output, "sentence-arrow-single.png") });
    await page.locator("#user-simple").screenshot({ path: path.join(output, "user-simple-arrow.png") });
    await page.locator("#user-complex").screenshot({ path: path.join(output, "user-complex-arrow.png") });
    await page.evaluate(() => {
      for (let pass = 0; pass < 2; pass++) window.__RIGHTLY_REPAIR_HEBREW_MATH__(document.querySelector("main"), () => true);
    });
    assert.equal(await page.locator("body").textContent(), expectedText, "Repeated scans must not reverse a corrected arrow again");
    checks++;
    await page.setViewportSize({ width: 680, height: 1200 });
    await page.locator("main").evaluate(el => { el.style.fontSize = "36px"; });
    for (const id of ["hebrew", "hebrew-test", "inline"]) await checkTextBox(id);
    await checkTextBox("gradient");
    await checkSentenceOrder("gradient");
    await checkSentenceOrder("boxed-mle", "MLE");
    await checkTextBox("boxed-mle");
    await checkArrow();
    await checkSentenceArrow("sentence-double", "⇒", "⇐");
    await checkSentenceArrow("boxed-single", "→", "←");
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
    const streamedSentence = renderedSamples.find(([id]) => id === "user-complex")[1];
    await page.locator("#user-simple .katex").evaluate((el, rendered) => {
      const template = document.createElement("template"); template.innerHTML = rendered;
      el.innerHTML = template.content.querySelector(".katex").innerHTML;
    }, streamedSentence);
    await page.waitForFunction(() => document.querySelector("#user-simple .katex-html .mrel")?.textContent === "⇐");
    await checkSentenceArrow("user-simple", "⇒", "⇐");
    assert.equal(await page.locator("#user-simple .katex-mathml").innerHTML(), mathml["user-complex"], "A streamed formula retains its new original TeX and MathML");
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
