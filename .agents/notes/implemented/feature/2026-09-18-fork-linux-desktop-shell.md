# Agent Note: Fork-only Linux desktop shell

Status: implemented

English | [中文](2026-09-18-fork-linux-desktop-shell.zh.md)

## Problem

The upstream desktop shell in `apps/desktop` ships no Linux target: `scripts/package-target.ts` packages `mac-arm64`, `mac-x64`, and `win-x64` only. Every part of the repository the shell drives is platform-independent, and a local checkout builds a working Linux shell against the same payload contract, so a Linux user needs a shell of their own that keeps taking upstream code.

## Decision

The Linux shell lives at the repository root in `desktop-linux/`, not in `apps/desktop-linux/`. Each `apps/*` directory is a publishable release member — `scripts/check-workspace-constraints.ts` matches it with `standardReleaseMemberDirectory`, which binds it to the workspace version and pulls it into every gate that globs `apps/*`. A root-level directory falls outside `workspaceGlobs`, so `pnpm-workspace.yaml` names it and its deploy root explicitly; that file is the only edit this fork shares with upstream. The package is `@deepseek-ai/dsh-desktop-linux`, `private: true`, and carries its own version.

Upstream stays the source of code. `DEFAULT_UPDATE_REPO` remains `deepseek-ai/deepseek-harness`, the in-app updater assembles each new payload from an upstream tarball, and `src/ensure-deploy-root.ts` writes the deploy root inside that checkout because it carries no `desktop-linux` workspace entry of its own.

Moving the shell to the repository root changed three paths: `tsconfig.json` extends `../tsconfig.base.json`, the build scripts resolve the repository root one level up (`../..`), and `scripts/generate-deploy-root.ts` reads the deploy root's version from `@deepseek-ai/dsh` instead of a hardcoded literal.

Two build-time paths gained a network-independent escape hatch. `DSH_DESKTOP_NODE_MIRROR` overrides the base URL `downloadNodeRuntime` fetches the pinned Node archive and its `SHASUMS256.txt` from; the checksum check is unchanged, so a mirror is verified against the publisher's own manifest. `scripts/dsh-desktop-launcher` starts the binary beside itself rather than an absolute `/opt` path, so the packaging layout alone decides which build runs — `/opt/DeepSeek Harness` under the `.deb`, the mount point inside the AppImage.

## Alternatives considered

Placing the shell in `apps/desktop-linux/` keeps it under the same directory convention as the upstream shell but makes it a publishable release member, bound to the workspace version and pulled into every `apps/*` gate — constraints that serve the upstream release process and cost this fork maintenance for nothing.

Editing `apps/desktop/` in place avoids a second tree but collides with upstream on the same files at every merge, and needs each local change replayed after each upstream release.

A separate repository would give the shell its own history but cut it off from the payload contract, the deploy-root generator, and the workspace toolchain it shares with the harness.

## Consequences

The fork merges upstream cleanly: the only shared-file edit is `pnpm-workspace.yaml` (two workspace entries, and `sharp: true` in `allowBuilds` for the icon set the shell renders from SVG at package time). Upstream work on `apps/desktop` never flows into this shell automatically — the two are separate trees that share no code, and keeping the Linux shell current means re-applying its changes by hand.

The shell sits outside the upstream release gates, so it carries its own toolchain and vitest configuration. Its brand patches are idempotent: upstream 0.1.6-alpha.2 already ships the `DeepSeek Harness` label and the 17px brand row these patches write, so they became no-ops rather than breakage. Their log lines now separate "already at the target value" from "the markup moved", which is the case that calls for re-checking the patterns.

The `.deb` entry point reaches the launcher through `scripts/deb-after-install.sh`, which rewrites the `Exec` key after installation: electron-builder derives `Exec` from `linux.executableName` and rejects an override in `linux.desktop.entry`.

## Testing

AppImage and the packaged directory both reach a working window on Linux: the shell opens a 1280x800 window whose `WM_CLASS` is `deepseek-ai-dsh-desktop-linux.deepseek-ai-dsh-desktop-linux`, matching the `StartupWMClass` the desktop entry sets, and the spawned backend prints the readiness line the shell waits for (`dsh web: http://127.0.0.1:<port>/?token=…`) before serving. The packaged payload was also booted directly under `DSH_DESKTOP_PAYLOAD`, which exercises the same path with the shell's own bundled code rather than an already-installed payload.
