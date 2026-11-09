# Parcelwood 上线计划（ship plan）

顺序：**CrazyGames + Discord 先上 → 再做自己的网页版**。

最后更新：2026-11-04（基线 `9bfee13`：集市小巷、本周故事、每日来信、Discord 捎带包裹与服务器周榜已上线；CrazyGames 包重打为 `release/parcelwood-crazygames-1104-market-row.zip`，待手动上传；网页版暂停，先不上）。

当前基线：

- **提交**：`b37202d`（Add the first-run how-to guide；上一基线 `fb9d8c5`）
- **Discord**：GitHub 上 `b37202d` 的 Vercel 状态为 success（`GurfMKJKzRFMyVc9Ey2rGs7579pL`、`Fo93EwnT9JKQjj3eiK9YCCZLdqf2`）；`parcelwood-discord.vercel.app` 加载 `assets/index-BQ4ctgOk.js`，包内含 “How to play / 怎么玩”；`/privacy`、`/terms` 200。`<client>.discordsays.com` 和真实 Discord 客户端还没在这版复测
- **CrazyGames**：上传包 `release/parcelwood-crazygames-1102-onboarding.zip`（根目录即 `index.html`，SHA-256 `dc9cae3e…221978c`），需 Tao 手动上传
- **网页版**：代码保留，暂不发布；以后所有改动先在 `codex/rush-mode-prototype` 上做，要上线时快进 `main`
- 以后改界面/玩法都以这版为基准，不回退到 `main` 更早的旧界面
原计划在 Claude artifact（`discord/README.md` 第 3 行的链接）里，需要登录 Claude 才能看，本文没有读到它；
内容依据仓库里的 `README.md`、`discord/README.md`、`discord/SHARED-CHANGES.md` 和本次实测整理。

状态标记：

- ✅ 已验证（写明在哪验证：本地 / 线上只读检查）
- ⏳ 待外部操作（Developer Portal、平台后台、真机）
- ❌ 上线前必须做的代码 / 后端工作

负责人：**Tao** = 只能在平台后台或真机上做；**代码** = 可以在仓库里完成。

变现决定（2026-11-02）：

- **CrazyGames 只做广告**：不卖宝石、不接 Xsolla。真钱或可购宝石换随机包裹属于 CrazyGames 限制的开箱模式；以后若要内购，先把付费内容改成确定内容，再申请邀请制 IAP。测试 `tests/crazygames.smoke.test.ts` 锁定商店里没有购买按钮和美元价格。
- **Discord 用官方结账**（SKU + entitlement），商店在购买按钮上方直接列出包裹概率和保底规则（`#store-odds`），完整表格仍在“包裹概率”弹窗。测试 `tests/discord/shop.discord.test.ts`。

---

## 通用前置（三个平台都要）

| 项 | 状态 | 证据 / 验收 |
| --- | --- | --- |
| 单元测试、类型检查、网页构建 | ✅ 本地 | `npm test` 210 通过；`npm run typecheck`、`npm run build` 通过 |
| Rush Hour 手机小字、公告板文案、弹窗键盘焦点 | ✅ 本地，未提交 | `src/styles.css`、`src/i18n/board.ts`、`src/ui/app.ts`、`tests/sheet-focus.ui.test.ts` |
| 提交以上修复并合并到发布分支 | ⏳ Tao | 合并后三个平台的构建都要重新出包 |

---

## 第 1 阶段 A：CrazyGames

| # | 项 | 负责 | 状态 | 验收标准 / 证据 |
| --- | --- | --- | --- | --- |
| A1 | 正式包构建 | 代码 | ✅ 本地 | `npm run build:crazygames` → `dist-crazygames/`；`index.html` 引用 `https://sdk.crazygames.com/crazygames-sdk-v3.js`；不含 `sw.js` / `manifest.webmanifest` |
| A2 | 真 SDK 本地冒烟 | 代码 | ✅ 本地（390×844） | `CrazyGames.SDK.environment === 'local'`；无年龄门、无账号、无宝石、无开发面板；商店为“免费奖励” |
| A3 | 激励广告流程 | 代码 | ✅ 本地（SDK local 环境） | 点“看广告” → `requestAd('rewarded')` 约 5 秒 → `gameplayStop/Start` → 发奖 → `parcelwood.adLedger` 记 `{count:1}` → 按钮显示 3 分钟倒计时 |
| A4 | 存档走 SDK Data 模块 | 代码 | ✅ 本地 | 存档写入 SDK Data；控制台除 SDK 信息日志外 0 错误 |
| A5 | 上传到 CrazyGames 开发者后台，跑他们的 QA / 预览工具 | Tao | ⏳ | 后台预览里：游戏能进、广告能播、存档刷新后还在、无控制台报错 |
| A6 | 真机：iOS Safari、Android Chrome 各玩一局 | Tao | ⏳ | 安全区、横竖屏、广告回到游戏后声音和计时恢复 |
| A7 | 去掉 CrazyGames / Discord 包里网页版专属的 Rush Hour 与 Station Week | 代码 | ✅ 本地 | 编译期 `__WEB_BUILD__`：CG 主包 268→221 kB，两个包都不再产出 `rushHour-*.js` / `week-*.js`；连带去掉 Discord 包里的 `sw.js`、`manifest.webmanifest`。上传前跑 `npm run check:release` |

---

## 第 1 阶段 B：Discord Activity

### 已具备

| # | 项 | 状态 | 证据 |
| --- | --- | --- | --- |
| B1 | 本地 mock：年龄门（13+） | ✅ 本地 | 过门后出现 💎 |
| B2 | 本地 mock：账号页 | ✅ 本地 | 内嵌页显示“Signed in with Discord / Playing as Local Player”+“Delete account”；无邮箱、Apple、Google、登出 |
| B3 | 本地 mock：商店三件商品 | ✅ 本地（用假 SKU id） | 60 gems $0.99、330 gems $4.99、Station uniform $1.99 |
| B4 | 本地 mock：购买 + 首充翻倍 | ✅ 本地 | 第一次买 60 → 💎 0→120；第二次 → 180（不再翻倍） |
| B5 | 本地 mock：手机视图禁止购买 | ✅ 本地 | `?mobile` 显示“Purchases are not available in the Discord phone app…” |
| B6 | 正式包守卫 | ✅ 本地 | Discord 外打开 → “Play Parcelwood in Discord”；带 `frame_id` 但缺设置 → “not set up yet”；控制台 0 错误 |
| B7 | 正式包开发工具关闭 | ✅ 代码审查 | `discord/main.ts` 只在 `DEV` 或 `VITE_DEVTOOLS=1` 时开；`discord/vite.config.ts` 在 Vercel production 下禁止这两个开关 |
| B8 | Supabase 后端 | ✅ 线上只读检查 | 项目 `parcelwood`（`muzxulfegdezzomfpplt`）ACTIVE_HEALTHY；迁移 0001、0002；函数 `delete-account`、`discord-auth`、`discord-claim` 均 ACTIVE（v4） |
| B9 | Vercel 生产域名 | ✅ 线上只读检查 | `https://parcelwood-discord.vercel.app/` 返回 200；CSP `frame-ancestors` 只允许 discord.com / *.discordsays.com；包里有 publishable key 和 client id，**没有 SKU id**（商店目前不会显示商品） |

### 待做（按顺序）

| # | 项 | 负责 | 状态 | 验收标准 |
| --- | --- | --- | --- | --- |
| B10 | Supabase Edge Function secrets：`DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`DISCORD_APPLICATION_ID`、`DISCORD_BOT_TOKEN`、`ALLOWED_ORIGIN=https://1566183042773553203.discordsays.com` | Tao | ⏳ | 只在 Supabase 后台填，不进聊天、不进仓库；**绝不**设 `ALLOW_TEST_PURCHASES` |
| B11 | Root mapping `/` 从 `discord-test` 预览切到 `parcelwood-discord.vercel.app` | Tao | ⏳ | B10 完成后再切；Discord 里打开不再出现 “not set up yet” |
| B12 | 真 Discord 桌面端冒烟 | Tao | ⏳ | 年龄门 → Discord 授权 → 进入游戏；开箱、存档；退出再进进度还在 |
| B13 | 核实 `/sb` 路径映射 | Tao + 代码 | ⏳ | 登录请求走 `/sb/...` 成功；若返回游戏的 404，改 `VITE_DISCORD_SB_PREFIX=/.proxy/sb` 重新部署 |
| B14 | 核实占位邮箱登录（`generateLink` + `verifyOtp`） | Tao + 代码 | ⏳ | B12 能拿到 Supabase session；`discord_accounts` 里有一行 |
| B15 | 浏览器版 Discord、手机 Discord 打开 Activity | Tao | ⏳ | 三端都能加载（验证 `frame-ancestors`）；手机端商店显示“去电脑买” |
| B16 | Developer Portal 建 3 个 SKU（gems60 $0.99、gems330 $4.99、outfit $1.99） | Tao | 🟡 已建、未发布（2026-11-03） | gems60 `1567044952507158528`（消耗品）、gems330 `1567045750800523496`（消耗品）、outfit `1567045980967149619`（永久）。Vercel env `VITE_DISCORD_SKU_*`（production+preview）和 Supabase secrets `DISCORD_SKU_*` 已填且一致（secret 摘要已核对）。三个 SKU 在 Portal 里仍是“已下架”，测试购买（B17）通过后再点“发布 SKU” |
| B17 | 测试购买（Discord 测试模式，在**单独测试项目**上） | Tao | ⏳ | `discord-claim` 能用 bot token 读到购买；订单只发到一台设备一次 |
| B18 | 退款处理 | 代码 ✅ / 配置 ✅ | 🟡 已配置（2026-11-03），待真实退款验证 | `discord-claim` v5（对账）和 `discord-webhook` v1 已上线。`DISCORD_PUBLIC_KEY` 已设（摘要已核对，未签名请求返回 401）；Portal > Webhook 已填 `https://muzxulfegdezzomfpplt.supabase.co/functions/v1/discord-webhook`，活动开关已开，只订阅“删除授权”（Entitlement Delete），Portal 保存时的 PING 验证已通过。还差：在真服务上确认一次性商品退款会发 `ENTITLEMENT_DELETE` |
| B19 | 服务器端宝石余额 | 代码 | ✅ 已上线（2026-11-02） | 线上执行了 0003；表、触发器、权限已核对；在回滚事务里实测：下单 +120，退款扣回到 0，流水 2 行 |
| B20 | 存档冲突时保留已发放订单 id | 代码 | ✅ 由 B19 覆盖 | 每次领取后游戏都显示服务器余额，被丢弃的那份存档里的宝石会回来 |
| B21 | 隐私政策写明：删号后 Discord id 留在 `discord_orders` | Tao | ⏳ | 政策页面上线 |
| B22 | 提交 Discord 审核 | Tao | ⏳ | 风险已记录：宝石可买“额外包裹”（盲盒，赔率公开）。被拒时的退路见 `discord/README.md`“gambling-like content” |
| B23 | Discord 社交（捎带包裹 + 服务器周榜，`design-v2.md` 第 15 节） | 代码 ✅ / Tao ⏳ | 🟡 已上线（2026-11-04：0005 已执行、`main` 已部署、已发公告）；A 侧已在真服务器走通：三封来信 → 周榜 0→3 → 分享弹窗 → 复制带 `custom_id` 的链接 → 数据库落一条未领取记录，同一账号打开链接不会自领。**待第二账号**验证领取 + 双方 +15 ✨ | 隐私政策（B21）补一句：会存 Discord 服务器 id 与每周完成信数 |

备注：`discord/README.md` 顶部 “Status (2026-10-31) … Nothing is deployed” 已过时，以同文件的 “Deployment” 一节和上面的 B8、B9 为准。

---

## 第 2 阶段：自己的网页版

| # | 项 | 负责 | 状态 | 验收标准 |
| --- | --- | --- | --- | --- |
| W1 | 单标签页锁 | 代码 | ✅ 本地（未提交） | Web Locks 独占锁：第二个标签页显示“已在另一个标签页打开”+“在这里玩”，接管后旧标签页停止并不再存档；不支持 Web Locks 的浏览器保持原行为。`src/platform/tabLock.ts`、`src/ui/tabGuard.ts`、`tests/tabLock.test.ts`；本地 Chromium 双标签实测 |
| W2 | Stripe 接入 + CSP 加 Stripe 域名 | 代码 | ❌ | `vercel.json` CSP 放行 Stripe；结账、回跳、到账可测 |
| W3 | 服务器端宝石余额（同 B19） | 代码 ✅ / Tao ⏳ | ✅ 本地（`0004` 未上线） | `0004_guest_wallet_merge.sql`：游客票据 + `issue_guest_ticket` / `claim_guest_ticket`，重复兑换和跨账号领取都不重复转账；客户端在切换账号前取票、登录后兑换。**还差**：在 Supabase 跑 0004 |
| W4 | 退款处理（Stripe webhook） | 代码 | ❌（SQL 已就绪） | Stripe webhook 收到退款时调用 `refund_order('web', id)`；`web_orders.status` 改成 `refunded` 也会自动扣回 |
| W5 | Apple 登录删号时撤销 token | 代码 + Tao | ❌ | `supabase/functions/delete-account` 预留位置补上；需要 Apple 密钥 |
| W6 | Supabase Auth：Anonymous、Manual linking、Email、Apple、Google；Redirect URLs 只写完整地址 | Tao | ⏳ | 每种登录都能把游客账号升级 |
| W7 | 域名、隐私政策、账号删除网页（Google Play 要求） | Tao | ⏳ | 页面可公开访问 |
| W8 | PWA / 离线 | 代码 | 未验证 | 正式域名 HTTPS 下注册 `sw.js`，断网可继续玩 |

---

## 本次没有验证的内容

- 真 Discord 客户端里运行 Activity、真 Discord 登录、真 SKU 购买
- CrazyGames 后台的预览 / 审核环境
- 真 Supabase 登录和云存档
- 真机（iOS / Android）安全区
- 读屏软件可访问性
