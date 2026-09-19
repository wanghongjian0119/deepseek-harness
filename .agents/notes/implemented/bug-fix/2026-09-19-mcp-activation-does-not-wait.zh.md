# Agent Note: 激活 MCP 客户端时不再等待连接

Status: implemented

[English](2026-09-19-mcp-activation-does-not-wait.md) | 中文

## 问题

[连接尝试预算](2026-09-15-mcp-connection-attempt-budget.zh.md)约束了单个 MCP 服务器能把激活卡住多久，却保留了这次等待本身：`apply()` 在每次启动时都等待 `connection.ready`，于是激活的代价就是每台已配置服务器各一次完整的连接尝试。这样一来，一台不可达的服务器会让整条启动路径付掉它的 `startupTimeoutMs`——在桌面壳 60 秒的就绪预算里占去 15 秒（[`DEFAULT_READY_TIMEOUT_MS`](../../../../desktop-linux/src/server-launcher.ts)）——而且这些代价是并发付出还是叠加付出，取决于 loader 的顺序，而不是取决于有谁需要它们。在一个配置了十六台服务器的 profile 上，只要有一台主机在其端口上什么都不应答，就足以耗尽壳的全部预算并报出 `dsh web did not print its URL within 60000ms`，尽管 harness 本身是健康的。

这次等待只换来一项性质：Cordis 消费者在该服务器 fiber 激活的那一刻就能看到它的工具。没有任何消费者依赖这项性质。工具注册本来就允许迟到——重连路径就在激活之后注册代际，会话日志会记录它，而系统提示词通过 [server-context.ts](../../../../packages/mcp/mcp-client/src/server-context.ts) 中的惰性 thunk 读取服务器指令，因此迟到的连接既不会丢掉工具，也不会丢掉指令。

## 决定

激活不等待任何东西。[index.ts](../../../../packages/mcp/mcp-client/src/index.ts) 只在设置了 `failOnStartupError` 时才消费 `connection.ready`，因此默认启动立即返回，由 supervisor 的重连循环全权负责对外连接（[connection.ts](../../../../packages/mcp/mcp-client/src/connection.ts) 其余部分不变：代际、尝试预算与入口仍是致命路径同样使用的那份代码）。

`reconnect.maxAttempts` 由 10 降为 3，因此不可达的服务器会在一分钟内被报告并放弃，而不是花掉十次翻倍退避。稳定性窗口仍是 `maxDelayMs`，所以一台重连后存活满 30 秒的服务器照旧重置预算。

`startupTimeoutMs` 保持默认 `15000`。等待消失后它不再约束启动，剩下的职责只是判断一台健康的服务器会不会被误判为死掉；调低它买不到任何启动时间，只会收窄「来得及自我报告」的服务器集合。

## 考虑过的替代方案

**把不可达的配置项从 profile 中删掉。** 否决：这等于把一种网络状况当作配置缺陷。今天不可达的服务器在网络恢复后就可达了，而重连循环正是既有机制在处理的事情。

**把 `startupTimeoutMs` 调到 3 秒。** 依据证据否决，而非依据余量。`mcp-oracle-db` 的入口在构造 stdio 传输之前先 `await initPool(config)`，而 `initPool` 调用 `oracledb.createPool` 时带 `poolMin: 1`，这会在 resolve 之前开出一条真实的 Oracle 会话。因此该预算必须覆盖 spawn、原生模块加载、TCP 连接、认证与建会话，才轮到 `initialize` 握手发出——实测在十六台服务器同时启动时落在 +6 到 +7 秒。3 秒会把这台报告机器上的 8 台 Oracle 服务器全部永久判死并注销其工具。入口惰性的服务器则不受影响——例如 `mysql2` 的 `createPool`——而正是这一点使该取值成为服务器自身的属性，而非 harness 的属性。

**保留这次等待，另设一个只用于激活的超时。** 依 [require a current owner and need](../../../../packages/AGENTS.md) 否决：它为了维持一项无人依赖的保证而新增可配置字段，并且仍在启动路径上保留按服务器计的开销，只是让该字段把这个开销变小一点。

**把 `connection.ready` 放到后台并加 `.catch`。** 否决，因为不必要：supervisor 的尝试从不让 `ready` 拒绝，因此既没有未处理的拒绝需要吞掉，也没有任何可观察对象。

## 后果

Host 的就绪如今完全不依赖任何 MCP 服务器。不可达的服务器让启动只付出注册一个插件的时间，其缺席仅体现在 supervisor 本就会打印的日志行上——一次尝试失败，随后三次重试，然后 `giving up`。工具在连接建立时到达；相比之前，在健康的服务器上只有 loader 晚到足以产生影响时才会更晚，绝不会更早。

`failOnStartupError: true` 保留旧行为与旧代价，这也是所有挂载本插件的快照 fixture 仍设置它的原因：那些测试套件需要发现在首个轮次前已经结算，而它们并不是壳所计量的那条启动路径。尝试预算仍约束每一次尝试，因此致命启动会在 `startupTimeoutMs` 内失败，而不是等 SDK 默认值。

调高 `startupTimeoutMs` 不再有可换取的启动开销，调低它也不再买得到启动收益。它现在纯粹是「误判缓慢服务器」的阈值，README 也以这些措辞说明。
