/** Load the private callback API to test native completion independently of its Promise wrapper. */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** @returns The built addon's private callback binding for this host. */
export function loadFlockBinding() {
  // Try the host's builds in preference order instead of asking
  // `process.report.getReport()`, which serializes the whole test process.
  const candidates = process.platform === 'linux'
    ? ['glibc/system.node', 'musl/system.node']
    : ['system.node'];
  const directory = new URL(`../../packages/${process.platform}-${process.arch}/bin/`, import.meta.url);
  for (const candidate of candidates) {
    const binary = new URL(candidate, directory);
    if (existsSync(binary)) return createRequire(import.meta.url)(fileURLToPath(binary));
  }
  throw new Error(`flock: no built binding for ${process.platform}-${process.arch}`);
}
