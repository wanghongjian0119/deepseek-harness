# Agent Note: 为单次 MCP 连接尝试设预算，使沉默的服务器无法拖住激活

Status: implemented

[English](2026-09-15-mcp-connection-attempt-budget.md) | 中文

后续：[激活 MCP 客户端时不再等待连接](2026-09-19-mcp-activation-does-not-wait.zh.md)。下文这个预算仍约束每一次连接尝试，但普通启动不再等待任何一次尝试，因此它不再是启动开销。

## 问题

MCP 服务器可以完成握手，然后永不回应 `tools/list`。桥接层发出这两个请求时都没有自己的超时，于是各自继承了传输层 60 秒的默认请求超时。`apply()` 会等待 `connection.ready`，以便 Cordis 消费者在该 fiber 激活的那一刻就能看到服务器工具；这一等待因此变成了插件的激活时延，所有依赖它的 fiber——包括负责打印 Host 就绪信号的那个——都在一同等待。`toolCallTimeoutMs` 帮不上忙：它只在 `tools/call` 与资源请求上被读取，而 `syncTools` 给发现请求根本没有传超时。插件的启动时延因此由 MCP SDK 而非本 harness 掌握。

## 决定

`startupTimeoutMs`（默认 `15000`，定义于 [connection.ts](../../../../packages/mcp/mcp-client/src/connection.ts) 的 `DEFAULT_STARTUP_TIMEOUT_MS`）为单次连接尝试设预算：传输层握手，以及紧随其后的 `tools/list` 读取。supervisor 把它传给 `connect()`，并通过 `ToolBridgeOptions.listTimeoutMs` 传给 [tools.ts](../../../../packages/mcp/mcp-client/src/tools.ts) 中的 `tools/list` 调用。每一次连接尝试都携带该预算，包括 `failOnStartupError` 使激活等待的那次初次尝试；已建立连接上由 `tools/list_changed` 触发的重同步属于普通读取，保留传输层默认值。

该预算不改变任何失败路径。超出预算的尝试在尝试一贯失败的地方失败：设置了 `failOnStartupError` 时 `apply()` 拒绝，否则记录日志并在不带该服务器工具的情况下激活，同时重连策略按配置的退避重试。该字段沿用 `maxInstructionBytes` 的做法——在 Config 接口中可选、由 schema 物化默认值、在拥有它的实现里以 `?? DEFAULT_STARTUP_TIMEOUT_MS` 解析——因此省略该字段的程序化构造同样受到约束。

## 考虑过的替代方案

**改为调低 `toolCallTimeoutMs`。** 否决：发现请求从不读取它。调低它只会缩短每次 `tools/call`，而不会约束握手或真正卡住的那次列表读取。

**对已建立连接上的重同步也设预算。** 否决：活动连接的重同步没有需要约束的启动开销，在那里设限会让一个缓慢但最终成功的列表读取丢掉可用服务器的工具代际。预算被限定在尝试上，因为延迟正是在启动时被计入的。

**在 `apply()` 中用计时器与 `connection.ready` 竞速。** 否决：那等于放弃这次尝试而不是结束它——挂起的请求仍占着该代际，重连循环永不启动，随后 dispose 还必须等完那个计时器本要终止的请求。约束请求本身则让尝试经由既有路径失败，并复用既有的重试预算。

**只约束握手。** 否决：握手不是观察到卡顿的位置。一个回应了 `initialize` 随后在 `tools/list` 上沉默的服务器，仍会拖住激活直到传输层默认值。

## 后果

卡住的服务器其单次尝试时延从此成为本插件的一项可配置属性，而非第三方默认值；对于任何等待过连接的启动，Host 的就绪不再取决于那个默认值。代价是针对那些确实需要超过预算才完成发现的服务器，行为发生了变化：它们不再在激活时发布工具，其工具要等某次重连尝试成功后才出现——在日志中表现为既有的尝试失败行与重连行。默认值远低于传输层 60 秒的请求超时，使失败在任何 Host 判定 harness 从未启动之前就被报告出来，同时仍远高于实测中响应正常服务器亚秒级的发现耗时。
