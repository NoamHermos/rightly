'use strict';

// Read only the packaged entry points. No extraction, execution, or npm download.
const fs = require('node:fs');

function verifyAsar(archivePath, payloadPath) {
  const fd = fs.openSync(archivePath, 'r');
  try {
    const length = fs.fstatSync(fd).size;
    function read(position, size) {
      if (!Number.isSafeInteger(position) || !Number.isSafeInteger(size) ||
          position < 0 || size < 0 || size > 64 * 1024 * 1024 || position + size > length) {
        throw new Error('Invalid ASAR extent');
      }
      const buffer = Buffer.alloc(size);
      if (fs.readSync(fd, buffer, 0, size, position) !== size) throw new Error('Truncated ASAR');
      return buffer;
    }
    const prefix = read(0, 16);
    const headerSize = prefix.readUInt32LE(4);
    const jsonSize = prefix.readUInt32LE(12);
    if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || jsonSize > headerSize - 8) {
      throw new Error('Invalid ASAR header');
    }
    const header = JSON.parse(read(16, jsonSize).toString('utf8'));
    function entry(name) {
      const parts = name.replace(/\\/g, '/').replace(/^\.\//, '').split('/');
      if (parts.some(part => !part || part === '..')) throw new Error('Invalid ASAR entry path');
      let item = header;
      for (const part of parts) item = item.files && item.files[part] || {};
      if (item.unpacked || item.link || item.offset === undefined) throw new Error(`Missing packed entry: ${name}`);
      return read(8 + headerSize + Number(item.offset), item.size).toString('utf8');
    }
    const normalize = text => text.replace(/\r\n/g, '\n').trim();
    const payload = normalize(fs.readFileSync(payloadPath, 'utf8'));
    if (!payload.includes('RT-AI CLAUDE RTL PATCH START')) throw new Error('Invalid expected payload');
    const renderer = normalize(entry('.vite/build/mainView.js'));
    if (!renderer.startsWith(payload + '\n')) throw new Error('Current Rightly renderer payload is missing or outdated');
    const main = JSON.parse(entry('package.json')).main;
    if (typeof main !== 'string') throw new Error('Missing main entry');
    const source = entry(main);
    if (!source.includes('CLAUDE RTL MAIN PATCH START') || !source.includes("force-ui-direction', 'ltr")) {
      throw new Error('Main-process direction patch is missing');
    }
    return { verified: true, main };
  } finally {
    fs.closeSync(fd);
  }
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(verifyAsar(process.argv[2], process.argv[3])));
  } catch (error) {
    process.stdout.write(JSON.stringify({ verified: false, reason: error.message }));
    process.exitCode = 1;
  }
}
module.exports = { verifyAsar };
