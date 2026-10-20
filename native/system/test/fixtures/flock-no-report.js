/** Prove binding selection never builds a process report; runs in its own process. */
import assert from 'node:assert/strict';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let reports = 0;
const original = process.report.getReport;
process.report.getReport = function patched(...args) {
  reports += 1;
  return original.apply(this, args);
};

const root = mkdtempSync(join(tmpdir(), 'flock-no-report-'));
const fd = openSync(join(root, 'lock'), 'a+', 0o600);
try {
  const { tryLockExclusive } = await import('../../packages/entry/lib/flock.js');
  await tryLockExclusive(fd);
  // A process report serializes every thread and handle; on a busy host it
  // blocks the event loop for minutes, so the binding must not build one.
  assert.equal(reports, 0, 'flock binding selection must not generate a process report');
} finally {
  closeSync(fd);
  rmSync(root, { recursive: true, force: true });
}

await new Promise((resolve, reject) => {
  process.send({ type: 'ready' }, (error) => error ? reject(error) : resolve());
});
process.disconnect();
