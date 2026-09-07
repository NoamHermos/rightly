'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyAsar } = require('../src/claude/verify-asar');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rightly-claude-asar-'));
const archive = path.join(temp, 'app.asar');
const payloadPath = path.join(__dirname, '../src/claude/claude-rtl-payload.js');
const payload = fs.readFileSync(payloadPath, 'utf8').trimEnd();

function fixture({ renderer = payload + '\noriginal();', main = "// CLAUDE RTL MAIN PATCH START\napp.commandLine.appendSwitch('force-ui-direction', 'ltr');" } = {}) {
  const header = { files: {} };
  const contents = [];
  let offset = 0;
  for (const [name, text] of Object.entries({ 'package.json': '{"main":".vite/build/index.pre.js"}', '.vite/build/mainView.js': renderer, '.vite/build/index.pre.js': main })) {
    const parts = name.split('/');
    let item = header;
    for (const part of parts.slice(0, -1)) item = item.files[part] ||= { files: {} };
    const content = Buffer.from(text);
    item.files[parts.at(-1)] = { offset: String(offset), size: content.length };
    contents.push(content);
    offset += content.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const aligned = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16 + aligned);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + aligned, 4);
  prefix.writeUInt32LE(4 + aligned, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  fs.writeFileSync(archive, Buffer.concat([prefix, ...contents]));
}

try {
  fixture();
  assert.equal(verifyAsar(archive, payloadPath).verified, true);
  fixture({ renderer: payload.replace(/\r?\n/g, '\r\n') + '\r\noriginal();' });
  assert.equal(verifyAsar(archive, payloadPath).verified, true);
  fixture({ renderer: '// RT-AI CLAUDE RTL PATCH START\nstalePayload();' });
  assert.throws(() => verifyAsar(archive, payloadPath), /missing or outdated/);
  fixture({ renderer: 'unpatched();' });
  assert.throws(() => verifyAsar(archive, payloadPath), /missing or outdated/);
  fixture({ main: 'unpatched();' });
  assert.throws(() => verifyAsar(archive, payloadPath), /Main-process/);
  fs.writeFileSync(archive, Buffer.alloc(16, 255));
  assert.throws(() => verifyAsar(archive, payloadPath), /Invalid ASAR/);
  fs.writeFileSync(archive, Buffer.alloc(2));
  assert.throws(() => verifyAsar(archive, payloadPath), /Invalid ASAR/);
  console.log('Claude ASAR verification tests passed (current/stale/missing payload, main entry, CRLF, corrupt archives).');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
