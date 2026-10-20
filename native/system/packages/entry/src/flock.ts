/** Lazy POSIX flock entry; importing it does not load a native addon. */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getSystemErrorName } from 'node:util'

interface FlockBinding {
  tryLock(fd: number, callback: (errno: number) => void): void
}

let binding: FlockBinding | undefined
let loadFailure: unknown

/**
 * Load the platform binding once.
 *
 * On Linux the glibc build is tried first and the musl build second. Selecting
 * by attempting the load avoids `process.report.getReport()`: that report
 * serializes every thread, handle, and child-process channel in the process,
 * and on a host already running MCP stdio children it can hold the event loop
 * for minutes. The first failure is cached so a broken install cannot repeat
 * module resolution on every lock attempt.
 * @returns The native binding exposing the private `tryLock` callback.
 */
function loadBinding(): FlockBinding {
  if (binding) return binding
  if (loadFailure !== undefined) throw loadFailure
  const { platform, arch } = process
  if (platform !== 'linux' && platform !== 'darwin') {
    throw Object.assign(new Error(`flock is not supported on ${platform}-${arch}`), {
      code: 'ERR_FLOCK_UNSUPPORTED_PLATFORM',
      syscall: 'flock',
    })
  }

  let firstError: unknown
  try {
    const require = createRequire(import.meta.url)
    const manifest = require.resolve(`@deepseek-ai/node-addon-system-${platform}-${arch}/package.json`)
    const binDir = join(dirname(manifest), 'bin')
    const candidates = platform === 'linux'
      ? [join(binDir, 'glibc', 'system.node'), join(binDir, 'musl', 'system.node')]
      : [join(binDir, 'system.node')]
    for (const candidate of candidates) {
      try {
        binding = require(candidate) as FlockBinding
        return binding
      } catch (error) {
        firstError ??= error
      }
    }
  } catch (error) {
    firstError = error
  }
  loadFailure = firstError ?? new Error(`flock: no usable native binding for ${platform}-${arch}`)
  throw loadFailure
}

/**
 * Attempt an exclusive, nonblocking POSIX flock on the caller's descriptor.
 * The syscall runs in asynchronous work, so acquisition can occur after this
 * call returns. Keep fd open until the promise settles; the binding never
 * opens, duplicates, or closes it. Closing the locked descriptor releases the
 * lock once all descriptors for its open file description are closed.
 * @param fd - Open file descriptor to lock; ownership remains with the caller.
 * @returns A promise resolving to void on acquisition. Contention rejects with
 *   EAGAIN/EWOULDBLOCK; other syscall failures also reject. Syscall errors carry
 *   code, positive errno, and syscall='flock'. Native setup errors, unsupported
 *   platforms, and addon loading failures reject; importing alone does not load it.
 */
export async function tryLockExclusive(fd: number): Promise<void> {
  const errno = await new Promise<number>((resolve) => {
    loadBinding().tryLock(fd, resolve)
  })
  if (errno === 0) return
  const code = getSystemErrorName(-errno)
  throw Object.assign(new Error(`${code}: flock failed`), {
    code,
    errno,
    syscall: 'flock',
  })
}
