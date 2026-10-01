/* Rightly for ChatGPT: local presentation only, no requests or stored messages. */
(() => {
  "use strict";
  if (window.__RIGHTLY_CHATGPT_RTL__) return;
  window.__RIGHTLY_CHATGPT_RTL__ = true;

  const DIR = "data-rightly-chat-dir";
  const CODE = "data-rightly-chat-code";
  const PROSE = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, ul, ol, table';
  const CONTENT = '[data-message-author-role], [class*="MarkdownRoot-"], .markdown, .prose, [data-chatgpt-selection-message-id]';
  const INPUT = '#prompt-textarea, main .ProseMirror[contenteditable="true"], main textarea, form [contenteditable="true"]';
  const USER_TEXT = 'main .whitespace-pre-wrap, [data-message-author-role="user"]';
  const CODE_OR_MATH = 'pre, code, .code, .cm-editor, .monaco-editor, .katex, .katex-display, .MathJax, .MathJax_Display, mjx-container, math, .inline-math, [data-language]';
  const SHELL = 'nav, aside, header, [role="navigation"], [role="menu"], [role="toolbar"], button';
  const TARGETS = `${PROSE}, ${INPUT}, ${USER_TEXT}`;
  const previousDir = new WeakMap();
  const proseArrows = new WeakMap();
  const HEBREW = /[\u05d0-\u05ea\u05ef-\u05f2\ufb1d-\ufb4f]/u;
  const ARROWS = new Map([["→", "←"], ["←", "→"], ["⇒", "⇐"], ["⇐", "⇒"],
    ["⟶", "⟵"], ["⟵", "⟶"], ["⟹", "⟸"], ["⟸", "⟹"]]);
  const INLINE = 'span, strong, b, em, i, a, s, del, mark, bdi';
  const pending = new Set();
  let framePending = false;

  // Any Hebrew letter takes precedence over the first English word. Do not use
  // dir="auto" or plaintext: both use the first strong character as the base.
  function direction(text) {
    if (/[\u05d0-\u05ea\u05ef-\u05f2\ufb1d-\ufb4f]/u.test(text)) return "rtl";
    if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(text)) return "rtl";
    return /\p{Letter}/u.test(text) ? "ltr" : null;
  }

  function proseText(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent || "";
      else if (node.nodeType === Node.ELEMENT_NODE && !node.matches(CODE_OR_MATH)) {
        text += proseText(node);
      }
    }
    return text;
  }

  function setDirection(element, dir) {
    if (dir) {
      if (!previousDir.has(element)) previousDir.set(element, element.getAttribute("dir"));
      if (element.getAttribute(DIR) !== dir) element.setAttribute(DIR, dir);
      if (element.getAttribute("dir") !== dir) element.setAttribute("dir", dir);
    } else if (previousDir.has(element)) {
      const oldDir = previousDir.get(element);
      if (oldDir === null) element.removeAttribute("dir");
      else if (element.getAttribute("dir") !== oldDir) element.setAttribute("dir", oldDir);
      element.removeAttribute(DIR);
      previousDir.delete(element);
    }
  }

  function isContent(element) {
    if (element.matches(INPUT) || element.closest(INPUT)) return true;
    if (element.closest(SHELL)) return false;
    return !!element.closest(CONTENT) || !!element.closest("main");
  }

  function separateEnglishOpening(element) {
    // Work on the logical paragraph opening, not on emphasis tags. The Latin
    // phrase and first Hebrew word can share a text node or span several nodes.
    const nodes = [];
    let opening = "";
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(`${TARGETS}, ${CODE_OR_MATH}, ${SHELL}, a, bdi, bdo, br, [contenteditable]`)) break;
      } else {
        nodes.push(node);
        opening += node.data;
        if (HEBREW.test(opening)) break;
      }
    }
    const latin = opening.match(/^[ \t]*\p{Script=Latin}[\p{Script=Latin}\p{Mark}\d \t\/-]*/u)?.[0];
    if (!latin || !/[\p{Script=Latin}\d]$/u.test(latin) || !HEBREW.test(opening[latin.length] || "")) return;
    let offset = latin.length;
    for (const node of nodes) {
      if (offset < node.length) {
        node.insertData(offset, " ");
        return;
      }
      offset -= node.length;
    }
  }

  function repairProse(element, text) {
    // Editors belong to React/ProseMirror. Only set their paragraph direction;
    // never change their nodes, selection or composing text.
    if (element.closest(`${INPUT}, [contenteditable]:not([contenteditable="false"])`)) return;
    const hebrew = HEBREW.test(text);
    if (hebrew) separateEnglishOpening(element);
    for (const inline of element.querySelectorAll(INLINE)) {
      if (inline.closest(TARGETS) !== element || inline.closest(`${CODE_OR_MATH}, ${SHELL}, a, bdo, [contenteditable]`) ||
        (inline.closest("bdi") && inline.closest("bdi") !== inline)) continue;
      let next = inline, following = "";
      while (next && next !== element) {
        if (next.nextSibling) {
          next = next.nextSibling;
          if (next.nodeType === Node.COMMENT_NODE) continue;
          if (next.nodeType === Node.ELEMENT_NODE && next.matches("br")) { following = "\n"; break; }
          following = next.textContent || "";
          if (following) break;
        } else next = next.parentNode;
      }
      const value = inline.textContent || "";
      const punctuationAtEnd = /[\p{Script=Latin}\d]\u200f?\p{P}+[ \t]*$/u.test(value);
      const punctuationThenHebrew = punctuationAtEnd && /^[ \t]*[\u05d0-\u05ea]/u.test(following) ||
        /[\p{Script=Latin}\d]\u200f?\p{P}+[ \t]*[\u05d0-\u05ea]/u.test(value);
      // A purely textual inline-block isolates English plus its punctuation,
      // keeping the punctuation on the English side. Let that text participate
      // in the RTL line when Hebrew follows; retain atomic English-English runs.
      const display = getComputedStyle(inline).display;
      const wasFlow = inline.getAttribute("data-rightly-prose-inline") === "flow";
      const flow = hebrew && (display === "inline-block" || wasFlow) && punctuationThenHebrew &&
        !inline.querySelector("img, svg, button, input, textarea, select, video, audio, code, pre, .katex, mjx-container, math");
      // ChatGPT also wraps a final English word and its dot in <bdi>. That
      // isolation keeps the dot on the English side even at the end of a
      // Hebrew sentence, so release only punctuation-bearing bdi runs.
      const bdiEnding = inline.localName === "bdi" && punctuationAtEnd &&
        (punctuationThenHebrew || !following.trim());
      const normalize = hebrew && (flow || (!wasFlow && display === "inline" &&
        (inline.localName !== "bdi" || bdiEnding)));
      if (normalize) {
        const mode = flow ? "flow" : "";
        if (inline.getAttribute("data-rightly-prose-inline") !== mode) inline.setAttribute("data-rightly-prose-inline", mode);
      } else inline.removeAttribute("data-rightly-prose-inline");
      // Some Markdown has no separating space at all: <strong>Train</strong>נלמדים.
      // Add visual clearance only at that formatting boundary. Existing spaces
      // and Hebrew prefixes before English words remain untouched.
      const gap = normalize && !inline.parentElement.closest("[data-rightly-prose-gap]") &&
        /[A-Za-z\d]$/u.test(value) && HEBREW.test(following[0] || "");
      if (gap) {
        if (!inline.hasAttribute("data-rightly-prose-gap")) inline.setAttribute("data-rightly-prose-gap", "");
      } else inline.removeAttribute("data-rightly-prose-gap");
    }
    function followingText(node) {
      let next = node;
      while (next && next !== element) {
        if (next.nextSibling) {
          next = next.nextSibling;
          if (next.nodeType === Node.COMMENT_NODE) continue;
          if (next.nodeType === Node.TEXT_NODE) return next.data;
          if (next.matches(`br, ${CODE_OR_MATH}, ${SHELL}, a, bdi, bdo, [contenteditable]`)) return "";
          return next.textContent || "";
        }
        next = next.parentNode;
      }
      return "";
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const previous = proseArrows.get(node);
      if (parent.closest(TARGETS) !== element || parent.closest(`${CODE_OR_MATH}, ${SHELL}, a, bdo, [contenteditable]`) ||
        (parent.closest("bdi") && !parent.closest("bdi").hasAttribute("data-rightly-prose-inline") && !previous)) continue;
      const value = node.data;
      if (!previous && !/[←→⇐⇒⟵⟶⟸⟹\p{P}]/u.test(value)) continue;
      let source = value;
      if (previous) {
        // Recover the unchanged portions of the original text when streaming
        // appends tokens to our displayed string. Arrow glyphs have the same
        // width; only marks inserted by us change character offsets.
        let prefix = 0, suffix = 0;
        while (prefix < value.length && prefix < previous.output.length && value[prefix] === previous.output[prefix]) prefix++;
        while (suffix < value.length - prefix && suffix < previous.output.length - prefix &&
          value[value.length - suffix - 1] === previous.output[previous.output.length - suffix - 1]) suffix++;
        const sourceOffset = offset => offset - (previous.inserted || []).filter(position => position < offset).length;
        source = previous.source.slice(0, sourceOffset(prefix)) + value.slice(prefix, value.length - suffix) +
          previous.source.slice(sourceOffset(previous.output.length - suffix));
      }
      let marked = "";
      const inserted = [];
      const afterNode = followingText(node);
      for (let index = 0; index < source.length; index++) {
        if (hebrew && index > 0 && /[\p{Script=Latin}\d]/u.test(source[index - 1]) && /\p{P}/u.test(source[index])) {
          const next = (source.slice(index).replace(/^[\p{P}\s]+/u, "") + afterNode).trimStart();
          if (HEBREW.test(next[0] || "") || !next) {
            inserted.push(marked.length);
            marked += "\u200f";
          }
        }
        marked += source[index];
      }
      const output = hebrew ? marked.replace(/[←→⇐⇒⟵⟶⟸⟹]/gu, arrow => ARROWS.get(arrow)) : marked;
      proseArrows.set(node, { source, output, inserted });
      if (output !== value) node.data = output;
    }
  }

  function processElement(element) {
    if (!isContent(element) || element.closest(CODE_OR_MATH)) return;
    const text = element.matches("textarea") ? element.value : proseText(element);
    setDirection(element, direction(text));
    repairProse(element, text);
  }

  function scan(root) {
    if (!root.isConnected && root !== document) return;
    if (window.__RIGHTLY_REPAIR_HEBREW_MATH__) window.__RIGHTLY_REPAIR_HEBREW_MATH__(root, isContent);
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(TARGETS)) processElement(root);
    root.querySelectorAll(TARGETS).forEach(processElement);
    const isolate = element => {
      // Accessible MathML is already isolated by the visible KaTeX container.
      // Keep the site's accessibility tree and original TeX untouched.
      if (element.closest(".katex-mathml")) return;
      if (isContent(element) && !element.hasAttribute(CODE)) element.setAttribute(CODE, "");
    };
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(CODE_OR_MATH)) isolate(root);
    root.querySelectorAll(CODE_OR_MATH).forEach(isolate);
  }

  function enqueue(node) {
    let root = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!root || !root.querySelectorAll) return;
    // Revisit the containing paragraph/list/table/composer for streamed tokens,
    // edits, and newly inserted inline code rather than rescanning the page.
    if (root.closest) {
      root = root.closest(`${INPUT}, table, ul, ol, ${PROSE}, ${USER_TEXT}`) || root;
      const composer = root.closest(INPUT);
      if (composer) root = composer;
      const formula = root.closest(".katex");
      if (formula) root = formula;
    }
    for (const queued of pending) {
      if (queued.contains(root)) return;
      if (root.contains(queued)) pending.delete(queued);
    }
    pending.add(root);
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      const roots = [...pending];
      pending.clear();
      roots.forEach(scan);
    });
  }

  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        enqueue(record.target);
        record.addedNodes.forEach(enqueue);
      } else enqueue(record.target);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["dir", "class"]
  });
  for (const event of ["input", "compositionend", "focusin"]) {
    document.addEventListener(event, e => {
      if (e.target instanceof Element && e.target.matches(INPUT)) enqueue(e.target);
    }, true);
  }
  document.documentElement.setAttribute("data-rightly-chatgpt-version", "1.0.15");
})();
