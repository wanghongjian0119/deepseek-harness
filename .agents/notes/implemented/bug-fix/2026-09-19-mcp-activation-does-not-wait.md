# Agent Note: Activate the MCP client without waiting for a connection

Status: implemented

English | [中文](2026-09-19-mcp-activation-does-not-wait.zh.md)

## Problem

[The connection-attempt budget](2026-09-15-mcp-connection-attempt-budget.md) bounded how long one MCP server could hold activation open, but left the wait itself in place: `apply()` awaited `connection.ready` on every startup, so activation cost one full connection attempt per configured server. An unreachable server therefore charged the whole startup path its `startupTimeoutMs` — 15 seconds of a 60-second readiness budget on the desktop shell ([`DEFAULT_READY_TIMEOUT_MS`](../../../../desktop-linux/src/server-launcher.ts)) — and servers were charged concurrently or not depending on loader order, not on whether anyone needed them. On a profile with sixteen configured servers, one host that answers nothing on its port was enough to spend the shell's entire budget and report `dsh web did not print its URL within 60000ms`, even though the harness itself was healthy.

The wait bought one property: Cordis consumers observed a server's tools the moment its fiber activated. No consumer depended on it. Tool registration has always been allowed to land late — the reconnect path registers generations after activation, the session log records that, and the system prompt reads server instructions through a lazy thunk in [server-context.ts](../../../../packages/mcp/mcp-client/src/server-context.ts), so a late connection loses neither its tools nor its instructions.

## Decision

Activation waits for nothing. [index.ts](../../../../packages/mcp/mcp-client/src/index.ts) consumes `connection.ready` only when `failOnStartupError` is set, so the default startup returns at once and the supervisor's reconnect loop owns all outreach ([connection.ts](../../../../packages/mcp/mcp-client/src/connection.ts) is otherwise unchanged: the generations, the attempt budget, and the entry point are the same code the fatal path still uses).

`reconnect.maxAttempts` drops from 10 to 3, so an unreachable server is reported and given up on inside a minute instead of spending ten doubling backoffs. The stability window stays `maxDelayMs`, so a server that reconnects and then survives 30 seconds resets the budget as before.

`startupTimeoutMs` keeps its default `15000`. With the wait gone it no longer bounds startup, so its remaining job is to decide whether a healthy server is misjudged as dead; lowering it buys no startup time and only narrows the set of servers that can report themselves in time.

## Alternatives considered

**Trim the unreachable entries from the profile.** Rejected: it treats a network condition as a configuration defect. A server that is unreachable today is reachable when the network returns, and the reconnect loop is the mechanism that already handles exactly that.

**Lower `startupTimeoutMs` to 3 seconds.** Rejected on evidence rather than on margin. `mcp-oracle-db`'s entry point awaits `initPool(config)` before it constructs its stdio transport, and `initPool` calls `oracledb.createPool` with `poolMin: 1`, which opens a real Oracle session before resolving. The budget must therefore cover spawn, native module load, TCP connect, authentication, and session creation before the `initialize` handshake is even sent — measured at +6 to +7 seconds when sixteen servers start together. Three seconds would permanently classify all eight Oracle servers on the reporting machine as dead and unregister their tools. Servers whose entry point is lazy — `mysql2`'s `createPool`, for one — would have been unaffected, which is what makes the value a property of the server rather than of the harness.

**Keep the await under a separate activation-only timeout.** Rejected under [require a current owner and need](../../../../packages/AGENTS.md): it adds a configurable field to preserve a guarantee no consumer relies on, and it keeps a per-server cost on the startup path that the field would only make smaller.

**Await `connection.ready` in the background with a `.catch`.** Rejected as unnecessary: the supervisor's attempt never rejects `ready`, so there is no unhandled rejection to swallow and nothing to observe.

## Consequences

The Host's readiness now depends on no MCP server at all. Unreachable servers cost startup the time to register a plugin, and their absence is visible only in the log lines the supervisor already emits — a failed attempt, then three retries, then `giving up`. Tools arrive when a connection lands, which is later than activation on a healthy server only if the loader reaches it late enough to matter, and never earlier than before.

`failOnStartupError: true` keeps the old behavior and the old cost, which is why every snapshot fixture that mounts this plugin still sets it: those suites need discovery to have settled before the first turn, and they are not the startup path the shell measures. The attempt budget still bounds each try, so a fatal startup fails within `startupTimeoutMs` rather than waiting on the SDK default.

Raising `startupTimeoutMs` no longer has a startup cost to trade against, and lowering it no longer has a startup benefit to buy. It is now purely a threshold for misjudging a slow server, and the README says so in those terms.
