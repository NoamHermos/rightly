"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const payloadPath = path.join(__dirname, "..", "src", "gpt", "codex-rtl-payload.js");
let payload = fs.readFileSync(payloadPath, "utf8");

const hookPoint = "    function detectElDir(el) {";
assert.ok(payload.includes(hookPoint), "detectElDir hook point is missing");
payload = payload.replace(
    hookPoint,
    "    window.__RT_AI_TEST_DETECT_TEXT_DIR__ = detectTextDir;\n" +
    "    window.__RT_AI_TEST_APPLY_BLOCK_DIR__ = applyBlockDir;\n" +
    "    window.__RT_AI_TEST_CODE_LINE_DIRECTIONS__ = codeLineDirections;\n" +
    "    window.__RT_AI_TEST_FIND_CODE_LINES__ = findExistingCodeLineElements;\n" +
    "    window.__RT_AI_TEST_ENFORCE_APP_SHELL_LTR__ = enforceAppShellLtr;\n" +
    "    window.__RT_AI_TEST_PROCESS_SIDEBAR_TITLE__ = processSidebarTitleElement;\n" +
    "    window.__RT_AI_TEST_DIRECT_TEXT__ = directText;\n" +
    "    window.__RT_AI_TEST_IS_QUESTION_CLUSTER__ = isQuestionCluster;\n\n" + hookPoint
);

const context = {
    window: {},
    document: {
        readyState: "loading",
        addEventListener: function () {}
    }
};

vm.runInNewContext(payload, context, { filename: payloadPath });
const detectTextDir = context.window.__RT_AI_TEST_DETECT_TEXT_DIR__;
const applyBlockDir = context.window.__RT_AI_TEST_APPLY_BLOCK_DIR__;
const codeLineDirections = context.window.__RT_AI_TEST_CODE_LINE_DIRECTIONS__;
const findCodeLines = context.window.__RT_AI_TEST_FIND_CODE_LINES__;
const enforceAppShellLtr = context.window.__RT_AI_TEST_ENFORCE_APP_SHELL_LTR__;
const processSidebarTitle = context.window.__RT_AI_TEST_PROCESS_SIDEBAR_TITLE__;
const directText = context.window.__RT_AI_TEST_DIRECT_TEXT__;
const isQuestionCluster = context.window.__RT_AI_TEST_IS_QUESTION_CLUSTER__;

assert.equal(detectTextDir("Hello שלום"), "rtl");
assert.equal(detectTextDir("translate שלום please"), "rtl");
assert.equal(detectTextDir("Codex - בדיקה"), "rtl");
assert.equal(detectTextDir("Hello world"), "ltr");
assert.equal(detectTextDir("123 https://example.com"), "ltr");
assert.equal(detectTextDir("مرحبا بالعالم"), "rtl");
assert.equal(detectTextDir(""), null);
assert.deepEqual(
    Array.from(codeLineDirections("English only\nPowerShell פקודה\nssh nas-home\nWindows ועברית")),
    ["ltr", "rtl", "ltr", "rtl"]
);
assert.deepEqual(Array.from(codeLineDirections("مرحبا\n")), ["ltr", "ltr"]);

function makeDomElement(tagName, textContent, childNodes) {
    const element = {
        nodeType: 1,
        tagName,
        textContent,
        childNodes: childNodes || [],
        matches: function (selector) { return selector === "span" && tagName === "SPAN"; }
    };
    element.querySelectorAll = function (selector) {
        const matches = [];
        function visit(node) {
            if (!node || node.nodeType !== 1) return;
            if (node !== element && node.matches(selector)) matches.push(node);
            (node.childNodes || []).forEach(visit);
        }
        element.childNodes.forEach(visit);
        return matches;
    };
    return element;
}

const codeLineOne = makeDomElement("SPAN", "English only");
const codeLineTwo = makeDomElement("SPAN", "PowerShell פקודה");
const codeLineThree = makeDomElement("SPAN", "ssh nas-home");
const codeLineContainer = makeDomElement("SPAN", "", [
    codeLineOne,
    { nodeType: 3, nodeValue: "\n" },
    codeLineTwo,
    { nodeType: 3, nodeValue: "\n" },
    codeLineThree
]);
const codeRoot = makeDomElement("CODE", "", [codeLineContainer]);
const matchedCodeLines = findCodeLines(codeRoot, "English only\nPowerShell פקודה\nssh nas-home");
assert.equal(matchedCodeLines.container, codeLineContainer);
assert.deepEqual(Array.from(matchedCodeLines.lines), [codeLineOne, codeLineTwo, codeLineThree]);

function makeElement(tagName, initialAttributes) {
    const attributes = new Map(Object.entries(initialAttributes || {}));
    return {
        tagName,
        style: {},
        hasAttribute: function (name) { return attributes.has(name); },
        getAttribute: function (name) { return attributes.has(name) ? attributes.get(name) : null; },
        setAttribute: function (name, value) { attributes.set(name, String(value)); },
        removeAttribute: function (name) { attributes.delete(name); }
    };
}

const appShell = makeElement("HTML", { dir: "rtl" });
context.document.documentElement = appShell;
enforceAppShellLtr();
assert.equal(appShell.getAttribute("dir"), "ltr");
assert.equal(appShell.getAttribute("data-rt-ai-app-shell-ltr"), "true");

const sidebarChild = { id: "react-owned-marquee" };
const sidebarTitle = makeElement("SPAN");
sidebarTitle.textContent = "YouTube תקיעות";
sidebarTitle.childNodes = [sidebarChild];
sidebarTitle.querySelector = function () {
    return { textContent: "YouTube תקיעות" };
};
processSidebarTitle(sidebarTitle);
assert.equal(sidebarTitle.textContent, "YouTube תקיעות");
assert.equal(sidebarTitle.childNodes[0], sidebarChild);
assert.equal(sidebarTitle.getAttribute("data-rt-ai-sidebar-rtl"), "true");

sidebarTitle.textContent = "English title";
sidebarTitle.querySelector = function () { return { textContent: "English title" }; };
processSidebarTitle(sidebarTitle);
assert.equal(sidebarTitle.hasAttribute("data-rt-ai-sidebar-rtl"), false);

const block = makeElement("P");
applyBlockDir(block, detectTextDir("Hello שלום"));
assert.equal(block.dir, "rtl");
assert.equal(block.getAttribute("data-rt-ai-dir"), "rtl");
assert.equal(block.style.direction, "rtl");
assert.equal(block.style.textAlign, "right");
assert.equal(block.style.unicodeBidi, "isolate");

const list = makeElement("UL");
const listItem = makeElement("LI");
listItem.closest = function () { return list; };
applyBlockDir(listItem, detectTextDir("Mongo מכיל מוצרים"));
assert.equal(listItem.dir, "rtl");
assert.equal(listItem.style.unicodeBidi, "isolate");
assert.equal(listItem.style.listStylePosition, "outside");
assert.equal(list.dir, "rtl");
assert.equal(list.style.textAlign, "right");

const appManagedElement = makeElement("P", { dir: "rtl" });
appManagedElement.style.textAlign = "center";
applyBlockDir(appManagedElement, null);
assert.equal(appManagedElement.getAttribute("dir"), "rtl");
assert.equal(appManagedElement.style.textAlign, "center");

const restoredElement = makeElement("P", { dir: "auto" });
restoredElement.style.textAlign = "center";
applyBlockDir(restoredElement, "rtl");
applyBlockDir(restoredElement, null);
assert.equal(restoredElement.getAttribute("dir"), "auto");
assert.equal(restoredElement.style.textAlign, "center");
assert.equal(restoredElement.hasAttribute("data-rt-ai-dir"), false);

const table = makeElement("TABLE");
applyBlockDir(table, detectTextDir("Status מצב"));
assert.equal(table.dir, "rtl");
assert.equal(table.getAttribute("data-rt-ai-dir"), "rtl");
assert.equal(table.style.textAlign, "right");

console.log("RTL direction tests passed.");

// Interactive question panels. Codex builds these from plain div/span elements,
// so the prose pass never reaches them; they are matched as a control cluster
// instead. Mirrors a panel with a reply box and Skip/Send buttons.
function makeQuestionNode(tagName, options) {
    const config = options || {};
    const attributes = new Map();
    const node = {
        nodeType: 1,
        tagName,
        style: {},
        hasAttribute: function (name) { return attributes.has(name); },
        getAttribute: function (name) { return attributes.has(name) ? attributes.get(name) : null; },
        setAttribute: function (name, value) { attributes.set(name, String(value)); },
        removeAttribute: function (name) { attributes.delete(name); },
        textContent: config.textContent || "",
        childNodes: config.childNodes || [],
        children: (config.childNodes || []).filter((child) => child.nodeType === 1),
        matches: function (selector) {
            return (config.roles || []).some((role) => selector.indexOf(role) !== -1);
        },
        querySelectorAll: function (selector) {
            const matches = [];
            (function visit(current) {
                (current.childNodes || []).forEach((child) => {
                    if (child.nodeType !== 1) return;
                    if (child.matches(selector)) matches.push(child);
                    visit(child);
                });
            })(node);
            return matches;
        }
    };
    return node;
}

const questionButtons = ["Skip", "Send", "Close"].map((label) =>
    makeQuestionNode("BUTTON", { textContent: label, roles: ["button"] }));
const questionBody = makeQuestionNode("DIV", {
    childNodes: [
        { nodeType: 3, nodeValue: "נפרד: קריאת פרטי חשבון",
          textContent: "נפרד: קריאת פרטי חשבון" },
        makeQuestionNode("SPAN", { textContent: "Cloudflare" })
    ]
});
questionBody.textContent = directTextSeed();
function directTextSeed() {
    return "נפרד: קריאת פרטי חשבון Cloudflare";
}
const questionPanel = makeQuestionNode("DIV", {
    textContent: questionBody.textContent + " Skip Send Close",
    childNodes: [questionBody].concat(questionButtons)
});

assert.equal(isQuestionCluster(questionPanel), true, "a Hebrew panel with reply controls is a question cluster");
assert.equal(
    isQuestionCluster(makeQuestionNode("DIV", { textContent: "Skip Send Close", childNodes: questionButtons })),
    false,
    "an English-only panel must not be redirected"
);

// Only the element that directly owns the Hebrew text is redirected, so the
// buttons keep their original order.
assert.equal(directText(questionPanel), "");
applyBlockDir(questionBody, detectTextDir(directText(questionBody)));
assert.equal(questionBody.dir, "rtl");
assert.equal(questionBody.style.textAlign, "right");
