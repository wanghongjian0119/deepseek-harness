# Agent Note: Desktop update network routes and persistent package caches

Status: implemented

English | [中文](2026-09-20-desktop-update-network-routes.zh.md)

## Problem

One update job takes two different routes to the network. The update check and the source archive download run on Electron's `net.fetch`, which follows the host's proxy configuration (GNOME's network settings, `gsettings`, a PAC file — wherever Chromium finds it). The subprocesses the job starts — pnpm, npm, git — read only the environment, and a GUI launch hands them an environment with no proxy variables at all. On a host behind a proxy the archive therefore arrives and every registry request goes direct, which is what a fetch timeout looks like: the job is not offline, it is on the wrong wire. The reverse also bites — an `https_proxy` left over from a shell that exited, or a proxy client that is no longer listening, routes every subprocess request into a closed port.

Resolution had a second, independent cost. Each package-resolving command ran with the store pnpm derives from `PNPM_HOME` and with no metadata cache directory, both under the update work directory that the job deletes at the start of every run: one update re-resolved and re-downloaded the whole dependency graph from scratch. A registry that stopped answering failed the job outright with `ERR_PNPM_META_FETCH_FAIL` / `ETIMEDOUT` even though the other three built-in mirrors were answering, and the user's only recourse was to reopen the Update Center.

## Decision

`desktop-linux/src/updater/electron-net.ts` owns the route between the shell and the network:

- **`chromiumFetch()`** returns `net.fetch`, so the update check and the source download resolve the system proxy the way the application window does.
- **`resolveSystemProxy(urls)`** asks `session.defaultSession.resolveProxy` for each endpoint the job will reach and maps the first usable rule to `http_proxy`/`https_proxy`. A `DIRECT` rule and a SOCKS-only configuration name no route pnpm can take — pnpm 11 ships no SOCKS agent and exposes no hook for one — so both leave the job direct.
- **`isProxyReachable(proxyUrl)`** opens a TCP connection to the proxy endpoint before the job hands it to any subprocess. A configured address that no longer accepts connections is not a route, so a stopped VPN or proxy client leaves the update direct instead of failing every request behind it.

`update-job.ts` composes these: `resolveUpdateProxy` logs the chosen route and returns the proxy for `buildUpdateChildEnv`, which writes both `http_proxy`/`https_proxy` and `HTTP_PROXY`/`HTTPS_PROXY` (pnpm reads the lowercase pair, git also consults the uppercase one), overriding inherited values. `pnpmRegistryArgs(registryUrl, storeDir, cacheDir)` carries the registry, the persistent store, a persistent metadata cache, `--prefer-offline`, and the slow-network fetch tuning as CLI flags on **every** command that resolves packages — the bootstrap install, the build install, and the payload's closure deploy, which reaches pnpm through `AssemblePayloadOptions.pnpmFlags`. The store (`$DSH_HOME/desktop/pnpm-store`) and the metadata cache (`$DSH_HOME/desktop/pnpm-cache`) are the same for every update, both outside the work directory the job wipes.

`update-center.ts` settles the registry the same way before install: it health-checks the candidate list (`<registry>/-/ping` over `chromiumFetch`) and uses the first mirror that answers, naming it in the log panel. The mirror the user selected in the UI is left as they set it; a failed health check changes this run, not their setting. The probe runs on Chromium's stack because install then runs on the same route — probing over one and installing over another would report a healthy mirror that the install cannot reach.

## Alternatives considered

**Rely on the environment, as the job did.** A GUI launch has no proxy variables to inherit; the setting lives with Chromium, in the desktop's network configuration. Reading the environment is not a fallback here, it is the empty case.

**Hand pnpm a SOCKS agent.** pnpm 11 takes no agent option and reads no `.npmrc` line for one. A SOCKS-only host therefore leaves the subprocesses direct, which is logged rather than silently attempted.

**Put the route in `.npmrc` or `npm_config_*`.** pnpm 11 ignores both for the store and the cache — those two paths exist only as CLI flags — and the checkout's `.npmrc` is a file the fetched source owns, which the job already writes for the registry alone.

**Probe the mirrors with Node's global fetch.** It would report the reachability of a route the install does not use, and on a proxied host it would find every mirror unreachable.

**Keep the metadata cache under the work directory.** A cache deleted at the start of every run never produces a hit. The store already had a migration path out of `update-work` from an earlier change; the cache needs the same home, and `--prefer-offline` needs both to exist.

**Warn on an unreachable mirror and continue.** That is the reported failure: minutes of retries ending in `ETIMEDOUT` while other mirrors answered.

## Consequences

A repeat update reuses what the previous one fetched. Measured on this host: the closure deploy fell from 1 m 45 s with a cold cache directory to 9.53 s (`reused 482, downloaded 0`), and the full pipeline — registry preflight, source download, bootstrap, frozen install (`reused 1312, downloaded 0`), build, payload assembly with the boot smoke, pointer flip — completed end to end in 279 s where the same job previously failed after 7 m 38 s.

The costs: preflight adds up to six seconds per unreachable candidate before install starts; `--prefer-offline` answers from the cache and falls back to the registry for anything missing, so a lockfile pinned to a newer commit still resolves; a proxy that accepts connections but cannot route them still ends in a fetch error the job reports rather than masking; the persistent directories add the metadata cache (~125 MB here) to the store's multi-gigabytes under `$DSH_HOME`; and the shell must be reinstalled for a change to this code to reach the updater that is already running — the updater cannot update itself.

## Verification

`desktop-linux/tests/electron-net.spec.ts` covers proxy-rule parsing (a `PROXY`/`HTTPS` rule, `DIRECT`, a SOCKS-only list, the first usable entry of a PAC list) and proxy liveness against a real listening socket and a closed one. `npm-mirrors.spec.ts` covers candidate order, the ping URL, and fallback when the selection does not answer or the probe itself throws. `update-job.spec.ts` covers the child environment (a resolved proxy overriding an inherited one under both spellings, and an inherited one kept when no system proxy resolves) and the pnpm argv.

The pipeline also ran end to end against the real upstream archive and registry on this host, through the same calls the Update Center makes, including the boot smoke and the pointer flip; the activated payload served `dsh web: http://127.0.0.1:<port>/?token=…`.
