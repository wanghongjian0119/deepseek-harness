/**
 * Vitest configuration for the fork-only desktop shell.
 *
 * The shell sits outside the directories the repository's root vitest config
 * includes, so it carries its own. Every spec imports only `../src/*.ts`, Node
 * builtins, and vitest, so no workspace path facade is needed — but the shell
 * declares its own toolchain rather than resolving tsc, tsx, and vitest through
 * the repository root's hoisted install.
 * @module @deepseek-ai/dsh-desktop-linux/vitest.config
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
