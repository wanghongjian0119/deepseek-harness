# Agent Note：Fork 专属的 Linux 桌面壳

状态：已实现

[English](2026-09-18-fork-linux-desktop-shell.md) | 中文

## 问题

上游的桌面壳位于 `apps/desktop`，不产出任何 Linux 目标：`scripts/package-target.ts` 只打包 `mac-arm64`、`mac-x64` 与 `win-x64`。而该壳所驱动的仓库其余部分与平台无关，本地 checkout 能按同一份载荷契约构建出可用的 Linux 外壳，因此 Linux 用户需要一份自己的壳，同时持续吸收上游代码。

## 决策

Linux 壳放在仓库根目录的 `desktop-linux/`，而不是 `apps/desktop-linux/`。`apps/*` 下的每个目录都是可发布的发布成员——`scripts/check-workspace-constraints.ts` 用 `standardReleaseMemberDirectory` 匹配它们，从而把它绑定到工作区版本，并卷入所有以 `apps/*` 为 glob 的门禁。根目录下的目录落在 `workspaceGlobs` 之外，因此由 `pnpm-workspace.yaml` 显式列出它与其 deploy root；该文件是本 fork 与上游共享的唯一改动。包名为 `@deepseek-ai/dsh-desktop-linux`，`private: true`，并持有自己的版本号。

上游仍是代码来源。`DEFAULT_UPDATE_REPO` 保持 `deepseek-ai/deepseek-harness`，应用内更新器每次都从上游 tarball 组装新载荷，而 `src/ensure-deploy-root.ts` 会在那份 checkout 内部生成 deploy root——因为它自身不含 `desktop-linux` 工作区条目。

把壳移到仓库根目录带来三处路径变化：`tsconfig.json` 改为继承 `../tsconfig.base.json`，构建脚本向上一级（`../..`）解析仓库根目录，`scripts/generate-deploy-root.ts` 也从 `@deepseek-ai/dsh` 读取 deploy root 的版本号，而不再使用硬编码字面量。

构建期有两条路径获得了不依赖外网的退路。`DSH_DESKTOP_NODE_MIRROR` 覆盖 `downloadNodeRuntime` 抓取固定版本 Node 归档及其 `SHASUMS256.txt` 的基础 URL；校验逻辑不变，因此镜像产物仍要对着发布方自己的清单校验。`scripts/dsh-desktop-launcher` 启动与自身同目录的二进制，而不再使用绝对的 `/opt` 路径，于是仅由打包布局决定运行哪个构建：`.deb` 下是 `/opt/DeepSeek Harness`，AppImage 内则是挂载点。

## 备选方案

把壳放进 `apps/desktop-linux/`，可以沿用与上游壳相同的目录约定，但会让它成为可发布的发布成员，被绑定到工作区版本并卷入每一个以 `apps/*` 为 glob 的门禁——这些约束服务于上游的发布流程，对本 fork 只产生无谓的维护成本。

直接就地改 `apps/desktop/` 可以省掉第二棵树，但每次合并都会在同一批文件上与上游冲突，且每次上游发布后都要重放本地改动。

另开一个仓库能让壳拥有自己的历史，却会切断它与载荷契约、deploy root 生成器以及同 harness 共享的工作区工具链的联系。

## 后果

本 fork 能干净地合并上游：唯一被改动的共享文件是 `pnpm-workspace.yaml`（两个工作区条目，以及 `allowBuilds` 里的 `sharp: true`，用于壳在打包期从 SVG 渲染的图标集）。上游对 `apps/desktop` 的改动不会自动流入这个壳——两者是互不共享代码的两棵树，要让 Linux 壳跟上进度就得手工重新施加改动。

该壳位于上游发布门禁之外，因此自带工具链与 vitest 配置。它的品牌补丁是幂等的：上游 0.1.6-alpha.2 已经自带这些补丁要写入的 `DeepSeek Harness` 名称与 17px 品牌行，于是它们退化为空操作而非故障。其日志现在区分“已是目标值”与“标记结构变了”——后者才是需要复查匹配模式的信号。

`.deb` 的入口经由 `scripts/deb-after-install.sh` 抵达 launcher：该脚本在安装后重写 `Exec` 键，因为 electron-builder 从 `linux.executableName` 推导 `Exec`，并拒绝在 `linux.desktop.entry` 中覆盖它。

## 测试

在 Linux 上，AppImage 与打包目录都能到达一个可用的窗口：壳打开 1280x800 的窗口，其 `WM_CLASS` 为 `deepseek-ai-dsh-desktop-linux.deepseek-ai-dsh-desktop-linux`，与桌面项设置的 `StartupWMClass` 一致；被拉起的后端在对外服务前打印出壳所等待的就绪行（`dsh web: http://127.0.0.1:<port>/?token=…`）。此外还用 `DSH_DESKTOP_PAYLOAD` 直接启动过打包内的载荷，走的是同一条路径，只是用的是壳自带的代码而非已安装的载荷。
