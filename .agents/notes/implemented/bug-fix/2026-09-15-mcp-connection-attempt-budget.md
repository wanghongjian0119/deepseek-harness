# Agent Note: Bound one MCP connection attempt so a silent server cannot hold activation open

Status: implemented

English | [中文](2026-09-15-mcp-connection-attempt-budget.zh.md)

Followed by [Activate the MCP client without waiting for a connection](2026-09-19-mcp-activation-does-not-wait.md): the budget below still bounds every connection attempt, but an ordinary startup no longer waits for one, so it is no longer a startup cost.

## Problem

An MCP server can complete its handshake and then never answer `tools/list`. The bridge issued both requests without a timeout of its own, so each inherited the transport's default request timeout of 60 seconds. `apply()` awaited `connection.ready` so that Cordis consumers would observe the server's tools the moment its fiber activated; that wait therefore became the plugin's activation latency, and every dependent fiber — including whatever prints the Host's readiness signal — waited with it. `toolCallTimeoutMs` could not help: it is consulted only for `tools/call` and resource requests, while `syncTools` passed no timeout at all to its discovery read. The plugin's startup latency was consequently owned by the MCP SDK rather than by this harness.

## Decision

`startupTimeoutMs` (default `15000`, `DEFAULT_STARTUP_TIMEOUT_MS` in [connection.ts](../../../../packages/mcp/mcp-client/src/connection.ts)) bounds one connection attempt: the transport handshake and the `tools/list` read that follows it. The supervisor passes it to `connect()` and, through `ToolBridgeOptions.listTimeoutMs`, to the `tools/list` call in [tools.ts](../../../../packages/mcp/mcp-client/src/tools.ts). Every connection attempt carries this budget, including the initial one when `failOnStartupError` makes activation await it; a re-sync triggered by `tools/list_changed` on an established connection is an ordinary read and keeps the transport default.

The budget changes no failure path. An attempt that exceeds it fails where an attempt has always failed: `apply()` rejects when `failOnStartupError` is set, and otherwise logs and activates without that server's tools while the reconnect policy retries on its configured backoff. The field follows `maxInstructionBytes` — optional in the Config interfaces, materialized by the schema, resolved with `?? DEFAULT_STARTUP_TIMEOUT_MS` in the owning implementation — so programmatic construction that omits it is bounded too.

## Alternatives considered

**Lower `toolCallTimeoutMs` instead.** Rejected because discovery never reads it. Lowering it would shorten every `tools/call` without bounding the handshake or the list that actually stalls.

**Bound re-syncs on established connections too.** Rejected because a live connection's re-sync has no startup cost to bound, and a bound there would drop a working server's tool generation for a slow-but-successful list. The budget is scoped to attempts, where the latency is charged to startup.

**Race `connection.ready` against a timer in `apply()`.** Rejected because it abandons the attempt rather than ending it: the pending request still owns the generation, the reconnect loop never starts, and disposal must then wait out the very request the timer was meant to stop. Bounding the requests fails the attempt through the existing path and reuses the existing retry budget.

**Bound the handshake only.** Rejected because the handshake is not where the stall was observed: a server that answers `initialize` and then goes quiet on `tools/list` would still hold activation for the transport default.

## Consequences

A stalled server's attempt latency became a configured property of this plugin rather than a third-party default, and the Host's readiness stopped depending on that default for any startup that awaited a connection. The cost is a behavior change for servers that legitimately need longer than the budget to finish discovery: they no longer publish tools at activation, and their tools appear only once a reconnect attempt succeeds — visible in the logs as the existing failed-attempt and reconnect lines. The default sits well below the transport's 60-second request timeout so that the failure is reported before a Host would conclude the harness never started, while remaining far above the sub-second discovery measured for responsive servers.
