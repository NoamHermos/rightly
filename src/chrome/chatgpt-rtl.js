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

  function processElement(element) {
    if (!isContent(element) || element.closest(CODE_OR_MATH)) return;
    const text = element.matches("textarea") ? element.value : proseText(element);
    setDirection(element, direction(text));
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
  document.documentElement.setAttribute("data-rightly-chatgpt-version", "1.0.7");
})();
