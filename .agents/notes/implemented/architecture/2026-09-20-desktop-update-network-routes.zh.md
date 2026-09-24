# Agent Note: Desktop 更新的网络路径与持久包缓存

Status: implemented

[English](2026-09-20-desktop-update-network-routes.md) | 中文

## Problem

同一次更新任务会走两条不同的网络路径。更新检查和源码包下载运行在 Electron 的 `net.fetch` 上，它遵循宿主机的代理配置（GNOME 网络设置、`gsettings`、PAC 文件，即 Chromium 能找到的任何来源）。而任务启动的子进程 pnpm、npm、git 只读环境变量，GUI 启动给出的环境里根本没有代理变量。于是在配置了代理的宿主机上，源码包能到达，而每一次 registry 请求都直连——一次 fetch 超时看起来就是这样：任务并非离线，而是接错了线。反过来同样会出问题：某个已退出的 shell 遗留的 `https_proxy`，或已停止监听的代理客户端，会把子进程的每个请求都送进一个关闭的端口。

依赖解析还有第二项独立的开销。每条解析包的命令都在 pnpm 从 `PNPM_HOME` 推导出的 store 下运行，且没有元数据缓存目录，两者都位于任务每次运行开头就删除的更新工作目录内：一次更新会从头重新解析并重新下载整个依赖图。某个 registry 停止响应时，即使其余三个内置镜像都能响应，任务也会直接以 `ERR_PNPM_META_FETCH_FAIL` / `ETIMEDOUT` 失败，用户唯一的补救办法是重新打开更新中心。

## Decision

`desktop-linux/src/updater/electron-net.ts` 负责外壳与网络之间的路径：

- **`chromiumFetch()`** 返回 `net.fetch`，使更新检查与源码下载按应用窗口的方式解析系统代理。
- **`resolveSystemProxy(urls)`** 对任务将访问的每个端点调用 `session.defaultSession.resolveProxy`，并把第一条可用规则映射为 `http_proxy`/`https_proxy`。`DIRECT` 规则和仅 SOCKS 的配置都没有给出 pnpm 能走的路径——pnpm 11 不带 SOCKS agent，也不提供接入 agent 的钩子——两种情况都让任务直连。
- **`isProxyReachable(proxyUrl)`** 在任务把代理交给任何子进程之前，先与代理端点建立 TCP 连接。已配置但不再接受连接的地址不算路径，因此停止的 VPN 或代理客户端会让更新直连，而不是让它身后的每个请求失败。

`update-job.ts` 组合这三者：`resolveUpdateProxy` 记录所选路径，并把代理交给 `buildUpdateChildEnv`；后者写入 `http_proxy`/`https_proxy` 与 `HTTP_PROXY`/`HTTPS_PROXY` 两种拼写（pnpm 读小写这一对，git 还会查大写这一对），并覆盖继承来的值。`pnpmRegistryArgs(registryUrl, storeDir, cacheDir)` 以 CLI 参数形式携带 registry、持久 store、持久元数据缓存、`--prefer-offline` 以及慢网抓取调优，附加到**每一条**解析包的命令上——引导安装、构建安装，以及 payload 的闭包部署（它经 `AssemblePayloadOptions.pnpmFlags` 到达 pnpm）。store（`$DSH_HOME/desktop/pnpm-store`）与元数据缓存（`$DSH_HOME/desktop/pnpm-cache`）对每次更新都相同，且都位于任务会清空的工作目录之外。

`update-center.ts` 在安装前用同样的方式确定 registry：通过 `chromiumFetch` 对候选列表做健康检查（`<registry>/-/ping`），使用第一个有响应的镜像，并在日志面板中指明它。用户在界面上选择的镜像保持原样；健康检查失败只改变本次运行，不改变用户的设置。探测走 Chromium 的栈，因为安装随后走同一条路径——用一条路径探测、用另一条安装，会报出一个安装根本够不到的“健康”镜像。

## Alternatives considered

**沿用环境变量，即任务原有的做法。** GUI 启动没有可继承的代理变量；该设置属于 Chromium，存在于桌面环境的网络配置中。在这里读环境变量不是退路，而是空集。

**给 pnpm 接 SOCKS agent。** pnpm 11 没有 agent 选项，也不读任何相关 `.npmrc` 行。因此仅 SOCKS 的宿主机上子进程保持直连，这是被记录下来的事实，而不是被默默尝试的路径。

**把路径写进 `.npmrc` 或 `npm_config_*`。** pnpm 11 对 store 和缓存都忽略这两者——这两个路径只以 CLI 参数存在——而 checkout 的 `.npmrc` 属于拉取到的源码所有，该文件目前只承载 registry。

**用 Node 全局 fetch 探测镜像。** 那样报出的是安装并不会走的那条路径的可达性；在配置了代理的宿主机上，它会认为每个镜像都不可达。

**把元数据缓存留在工作目录下。** 每次运行开头就被删除的缓存永远不会命中。store 在此前的改动中已有迁出 `update-work` 的路径；缓存需要同样的归宿，而 `--prefer-offline` 需要两者都存在。

**镜像不可达时告警并继续。** 那正是被报告的失败：数分钟重试后以 `ETIMEDOUT` 结束，而其他镜像是有响应的。

## Consequences

重复更新会复用上一次已抓取的内容。在本机实测：冷缓存目录下闭包部署耗时 1 分 45 秒，改为 9.53 秒（`reused 482, downloaded 0`）；完整流水线——registry 预检、源码下载、引导、冻结安装（`reused 1312, downloaded 0`）、构建、含启动冒烟的 payload 组装、指针切换——端到端耗时 279 秒，而同一任务此前在 7 分 38 秒后失败。

代价是：预检会在安装开始前为每个不可达候选最多增加六秒；`--prefer-offline` 从缓存作答，对缺失内容回退到 registry，因此锁定到更新提交的 lockfile 仍能解析；接受连接但无法路由的代理仍会以任务报告的 fetch 错误结束，而不是被掩盖；持久目录在 `$DSH_HOME` 下于 store 的多 GB 之外再加元数据缓存（本机约 125 MB）；并且这段代码的改动必须重装外壳才能到达正在运行的更新器——更新器无法更新自身。

## Verification

`desktop-linux/tests/electron-net.spec.ts` 覆盖代理规则解析（`PROXY`/`HTTPS` 规则、`DIRECT`、仅 SOCKS 的列表、PAC 列表中的首个可用项）以及针对真实监听套接字与已关闭套接字的代理存活性。`npm-mirrors.spec.ts` 覆盖候选顺序、ping URL，以及所选镜像无响应或探测自身抛错时的回退。`update-job.spec.ts` 覆盖子进程环境（已解析的代理在两种拼写下都覆盖继承值，以及未解析到系统代理时保留继承值）与 pnpm argv。

该流水线还在本机针对真实的上游源码包与 registry 端到端运行过，走的是更新中心调用的同一批函数，包括启动冒烟与指针切换；被激活的 payload 输出了 `dsh web: http://127.0.0.1:<port>/?token=…`。
