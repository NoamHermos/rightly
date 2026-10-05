/* Supply the Hebrew glyph metrics missing from KaTeX's mathematical fonts.
   The renderer and original metrics are bundled locally in an isolated world.
   Keep the site's TeX annotation/MathML and its fonts; repair visible HTML only. */
(() => {
  "use strict";
  const renderer = window.katex;
  const baseMetrics = window.__RIGHTLY_KATEX_BASE_METRICS__;
  if (!renderer || !baseMetrics) return;
  const HEBREW = /[\u05d0-\u05ea\u05ef-\u05f2\ufb1d-\ufb4f]/u;
  const REVERSED_ARROWS = new Map([
    ["→", "←"], ["←", "→"], ["⇒", "⇐"], ["⇐", "⇒"],
    ["⟶", "⟵"], ["⟵", "⟶"], ["⟹", "⟸"], ["⟸", "⟹"]
  ]);
  const processed = new WeakMap();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  let currentMetricsKey = "";

  function installHebrewMetrics(source, family) {
    const glyphs = [...new Set([...source].filter(char => /[\u0590-\u05ff\ufb1d-\ufb4f]/u.test(char)))].sort();
    const key = family + "\n" + glyphs.join("");
    if (key === currentMetricsKey) return;
    for (const [font, original] of Object.entries(baseMetrics)) {
      const italic = /Italic/.test(font) ? "italic" : "normal";
      const bold = /Bold/.test(font) ? "bold" : "normal";
      context.font = `${italic} ${bold} 100px ${family}`;
      const metrics = { ...original };
      for (const char of glyphs) {
        const measured = context.measureText(char);
        // Include clearance for fallback-font ascenders, descenders and vowel
        // marks. Unknown metrics previously became zero, clipping boxes/labels.
        const height = Math.max(0.7, (measured.actualBoundingBoxAscent || 0) / 100,
          (measured.fontBoundingBoxAscent || 0) / 100) + 0.04;
        const depth = Math.max(0.2, (measured.actualBoundingBoxDescent || 0) / 100,
          (measured.fontBoundingBoxDescent || 0) / 100) + 0.04;
        metrics[char.codePointAt(0)] = [depth, height, 0, 0, measured.width / 100];
      }
      renderer.__setFontMetrics(font, metrics);
    }
    currentMetricsKey = key;
  }

  // A Hebrew sentence containing math reads RTL as a sequence of parts. Keep
  // each adjacent mathematical run LTR so minus signs, fractions and indices
  // stay attached to their operands. A single Hebrew variable/label in an
  // algebraic expression is not enough to reverse that expression.
  function arrangeSentence(parent, parts, isHebrewPart) {
    const hebrewParts = parts.filter(isHebrewPart);
    const words = hebrewParts.flatMap(part => (part.textContent || "").match(/[\u05d0-\u05ea\u05ef-\u05f2\ufb1d-\ufb4f]+/gu) || []);
    const visibleParts = parts.filter(part => (part.textContent || "").replace(/[\s\u200b]/gu, ""));
    if (words.length < 2 || visibleParts.length < 2) return;
    // A directional connector follows the sentence when its parts move RTL.
    // Ignore KaTeX spacing and base boundaries, but not mathematical operands:
    // a Hebrew caption next to A -> B must not reverse that mathematical arrow.
    // Replace the displayed character, retaining the site's TeX and MathML.
    const tokens = parts.flatMap(part => part.matches(".base") ? [...part.children] : [part])
      .filter(part => !part.matches(".strut, .mspace"));
    for (let index = 0; index < tokens.length; index++) {
      const part = tokens[index];
      const reversed = REVERSED_ARROWS.get(part.textContent);
      if (part.matches(".mrel") && reversed && !part.hasAttribute("data-rightly-math-arrow") &&
          [tokens[index - 1], tokens[index + 1]].some(neighbor => neighbor?.matches('[data-rightly-math-text="rtl"]'))) {
        // A sentence may be visited at both its inner and outer base levels.
        // Store the original character so subsequent visits cannot flip twice.
        part.setAttribute("data-rightly-math-arrow", part.textContent);
        part.textContent = reversed;
      }
    }
    // A boundary relation (A = Hebrew phrase) belongs between the parts,
    // rather than at the far end of the isolated LTR mathematical run.
    const expanded = [];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part.matches(".base") && !isHebrewPart(part)) {
        const tokens = [...part.children].filter(child => !child.matches(".strut, .mspace"));
        const first = tokens[0], last = tokens[tokens.length - 1];
        if (index > 0 && isHebrewPart(parts[index - 1]) && first?.matches(".mrel, .mbin")) {
          first.remove(); expanded.push(first);
        }
        expanded.push(part);
        if (index + 1 < parts.length && isHebrewPart(parts[index + 1]) && last?.parentElement === part && last.matches(".mrel, .mbin")) {
          last.remove(); expanded.push(last);
        }
      } else expanded.push(part);
    }
    const flow = document.createElement("span");
    flow.setAttribute("data-rightly-math-flow", "rtl");
    // Boxed expressions keep relations beside separate spacing spans. Those
    // spans are presentation, not operands: MLE = Hebrew must split at the
    // equals sign just like an unboxed equation split into KaTeX bases.
    const contentParts = expanded.filter(part => !part.matches(".strut, .mspace"));
    const separators = new Set(contentParts.filter((part, index) => part.matches(".mrel, .mbin") &&
      [contentParts[index - 1], contentParts[index + 1]].some(neighbor => neighbor && isHebrewPart(neighbor))));
    let mathRun = null;
    for (let index = 0; index < expanded.length; index++) {
      const part = expanded[index];
      if (isHebrewPart(part)) {
        flow.append(part);
        mathRun = null;
      } else {
        const separator = separators.has(part);
        if (separator) mathRun = null;
        if (!mathRun) {
          mathRun = document.createElement("span");
          mathRun.setAttribute("data-rightly-math-part", "ltr");
          flow.append(mathRun);
        }
        mathRun.append(part);
        if (separator) mathRun = null;
      }
    }
    parent.replaceChildren(flow);
  }

  function arrangeTrailingHebrewLabel(html, source) {
    // A math value followed by \quad\text{Hebrew} is one LTR expression plus
    // an RTL caption. KaTeX may split p=0.4 across two .base spans; moving
    // those bases independently separates p, = and its value.
    if (!/\\(?:quad|qquad)\s*\\text\{/u.test(source)) return false;
    const bases = [...html.children];
    if (!bases.length || !bases.every(base => base.matches(".base"))) return false;
    const lastBase = bases[bases.length - 1];
    const label = lastBase.lastElementChild;
    const spacing = label?.previousElementSibling;
    if (!label?.matches('.text[data-rightly-math-text="rtl"]') ||
        !spacing?.matches(".mspace") || !["1em", "2em"].includes(spacing.style.marginRight) ||
        html.querySelectorAll('[data-rightly-math-text="rtl"]').length !== 1) return false;
    const flow = document.createElement("span");
    flow.setAttribute("data-rightly-math-flow", "rtl");
    const math = document.createElement("span");
    math.setAttribute("data-rightly-math-part", "ltr");
    for (const base of bases) math.append(base);
    flow.append(math, spacing, label);
    html.replaceChildren(flow);
    return true;
  }

  function isDelimitedHebrewMathExpression(source) {
    // Probability calls, data tuples, set assignments and membership keep LTR
    // order inside and outside \boxed{...}. Visible braces are \{ or \lbrace;
    // ordinary TeX grouping braces in \text{...} are not visible delimiters.
    // Hebrew outside the visible delimiters remains explanatory RTL prose.
    const expression = source.replace(/^\s*(?:\\displaystyle\s*|\\boxed\s*\{\s*)*/u, "");
    const probability = /(?:^|=)\s*P\s*(?:\\left\s*)?\(/u.test(expression);
    const relation = expression.match(/=|\\(?:notin|in)\b|[∈∉]/u);
    const subject = relation ? expression.slice(0, relation.index).trim() : "";
    const value = relation ? expression.slice(relation.index + relation[0].length) : "";
    // The subject may be a styled symbol such as \mathcal{H}, not only a
    // Latin letter. Keep prose labels out of this mathematical exception.
    const delimitedValue = !!subject && !HEBREW.test(subject) &&
      !/\\(?:text|mbox)\s*\{/u.test(subject) &&
      /^\s*(?:\\(?:left|bigl|Bigl|biggl|Biggl)\s*)?(?:\(|\\\{|\\lbrace\b)/u.test(value);
    if (!probability && !delimitedValue) return false;
    const delimiters = [];
    let hasHebrew = false;
    // Consume whole control sequences so escaped symbols cannot be mistaken
    // for a grouping brace; enforce matching types for nested sets/tuples.
    for (const [token] of source.matchAll(/\\(?:[A-Za-z]+|[^\r\n])|[()]|[\u05d0-\u05ea\u05ef-\u05f2\ufb1d-\ufb4f]/gu)) {
      if (token === "(") delimiters.push(")");
      else if (token === "\\{" || token === "\\lbrace") delimiters.push("}");
      else if (token === ")" || token === "\\}" || token === "\\rbrace") {
        if (delimiters.pop() !== (token === ")" ? ")" : "}")) return false;
      } else if (HEBREW.test(token)) {
        if (!delimiters.length) return false;
        hasHebrew = true;
      }
    }
    return hasHebrew && delimiters.length === 0;
  }

  function markTextDirection(html, source) {
    const parents = new Set();
    for (const text of html.querySelectorAll(".text")) {
      if (HEBREW.test(text.textContent || "")) {
        text.setAttribute("data-rightly-math-text", "rtl");
        if (text.parentElement.matches(".mord, .base")) parents.add(text.parentElement);
      }
      else text.removeAttribute("data-rightly-math-text");
    }
    if (arrangeTrailingHebrewLabel(html, source) || isDelimitedHebrewMathExpression(source)) return;
    for (const parent of parents) {
      arrangeSentence(parent, [...parent.children], part => part.matches('[data-rightly-math-text="rtl"]'));
    }
    // KaTeX splits ordinary equations into .base spans at relation/binary
    // operators. Join those presentation spans into the same sentence flow.
    // Only direct text qualifies; Hebrew arrow labels, matrix cells and
    // fractions must not reverse their surrounding mathematical expression.
    const bases = [...html.children];
    if (bases.length > 1 && bases.every(part => part.matches(".base"))) {
      arrangeSentence(html, bases, part => [...part.children].some(child =>
        child.matches('[data-rightly-math-text="rtl"], [data-rightly-math-flow="rtl"]')));
    }
  }

  function repairFormula(formula) {
    const annotation = formula.querySelector('annotation[encoding="application/x-tex"]');
    const html = formula.querySelector(".katex-html");
    const source = annotation && annotation.textContent;
    if (!source || !html) return;
    if (!HEBREW.test(source)) {
      formula.removeAttribute("data-rightly-hebrew-math");
      html.querySelectorAll("[data-rightly-math-text]").forEach(node => node.removeAttribute("data-rightly-math-text"));
      processed.delete(formula);
      return;
    }
    const text = [...html.querySelectorAll(".text")].find(node => HEBREW.test(node.textContent || ""));
    const family = getComputedStyle(text || formula).fontFamily;
    const displayMode = !!formula.closest(".katex-display");
    const key = source + "\n" + family + "\n" + displayMode;
    const previous = processed.get(formula);
    if (previous && previous.key === key && previous.html === html.innerHTML) return;
    try {
      installHebrewMetrics(source, family);
      const rendered = renderer.renderToString(source, {
        displayMode, output: "html", throwOnError: true,
        strict: "ignore", trust: false, maxExpand: 1000, maxSize: 20
      });
      const template = document.createElement("template");
      template.innerHTML = rendered;
      const replacement = template.content.querySelector(".katex-html");
      if (!replacement) return;
      markTextDirection(replacement, source);
      // Inner KaTeX markup is generated presentation, not an editor. Preserve
      // the existing formula root, accessible MathML, TeX source and controls.
      if (html.innerHTML !== replacement.innerHTML) html.innerHTML = replacement.innerHTML;
      formula.setAttribute("data-rightly-hebrew-math", "true");
      processed.set(formula, { key, html: html.innerHTML });
    } catch {
      // Site-specific macros or unsupported commands keep their original math.
      markTextDirection(html, source);
      processed.set(formula, { key, html: html.innerHTML });
    }
  }

  window.__RIGHTLY_REPAIR_HEBREW_MATH__ = (root, isContent) => {
    const repair = formula => { if (isContent(formula)) repairFormula(formula); };
    if (root instanceof Element && root.matches(".katex")) repair(root);
    root.querySelectorAll(".katex").forEach(repair);
  };
})();
