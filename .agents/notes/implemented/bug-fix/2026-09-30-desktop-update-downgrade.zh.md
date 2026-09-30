# Agent Note：桌面端更新拒绝非后代的基线

Status: implemented

[English](2026-09-30-desktop-update-downgrade.md) | 中文

## 问题

更新检查把两个 commit SHA 的不相等本身当成了"有新代码"的证据。两个 ref 不同，并不因此分出先后，于是任何"头部已经被当前载荷走过"的更新源都会被读成更新，更新中心据此把它作为更新提供出去。2026-09-30，配置的更新源自 9-26 起每日基线 rebase 持续失败，被冻结在 `d9489d83`（2026-09-18），而当时安装的载荷来自 `2b84d0298`（2026-09-30）。接受该提示后，正在运行的 0.2.0-rc.2 载荷被换成了 0.1.6-alpha.2 基线：一次静默降级，连带丢掉中间落地的全部修复。

## 决策

当分支头部与载荷 ref 不同时，`checkForUpdate` 会再问一次 compare API（`/repos/<repo>/compare/<current>...<latest>`），并把结果报告为 `UpdateRelation`：`ahead`、`behind`、`diverged`、`identical` 或 `unknown`。作为安装闸门的 `available` 仅在 `ahead` 时为真。两个 SHA 相同时跳过第二次请求，因此已是最新的应用仍然只花一次请求。

`unknown` 覆盖更新源仓库里不存在的 ref——对由本地检出构建的载荷是常态，GitHub 对此回 404——以及 compare API 未命名的任何状态。方向无法证明时一律不安装：错判为"可装"会拿旧代码覆盖可用的新代码，错判为"不可装"只是多一次手动更新。

`describeUpdateCheck` 把每种关系渲染进更新中心，因此 `behind`、`diverged`、`unknown` 会点明两个 ref 及它们之间的关系，而不是报告应用已是最新。

## 备选方案

- **比较提交日期。** commits API 带 author 与 committer 日期，可以不发第二次请求就给两个 ref 排序。否决：rebase 与 force-push 会改写日期，日期最新的提交仍可能由更旧的代码构建——正是本次出问题的情形。
- **保留不相等判定，改为修好更新源。** 恢复每日基线 rebase 能消除这一次，但消除不了这一类：任何 fork、镜像或临时回退的分支都会复现，而运行中的应用无法分辨。
- **把所有非 `ahead` 的关系都报告为"已是最新"。** 否决：窗口会在更新源陈旧时声称应用已是最新，把解释现状的那条关系藏起来。

## 后果

更新不可能再装进更旧的代码，陈旧或分叉的更新源会显式呈现在更新中心，而不是被静默执行。代价是：若更新源仓库不含载荷那个提交，该载荷就无法从这个源更新——窗口会一直报 `unknown`，直到载荷的 ref 出现在该仓库里；对"本地构建的载荷指向上游仓库"这一组合，这是诚实的答案。

## 验证

- `desktop-linux/tests/update-check.spec.ts` 覆盖每种关系、404 与未识别状态两条路径、SHA 相同时跳过比较，以及比较请求失败。
- `desktop-linux/tests/update-center.spec.ts` 覆盖每种关系渲染出的文案。
