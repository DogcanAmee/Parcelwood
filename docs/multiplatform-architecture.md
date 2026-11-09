# Parcelwood 多平台技术设计：一套代码 → iOS / 安卓 / 网页 / H5

最后更新：2026-11-05（TAO-33，Architect）  
依据：`docs/monetization-research.md`（TAO-32）、`docs/ship-plan.md`，以及当前代码：`src/platform/`、`src/crazygames/`、`src/discord/`、`src/auth/`、`supabase/`。  
范围：本文只做设计，不改游戏代码。

---

## 第一部分：创始人一页摘要

**一句话：游戏继续用现在的网页代码写一份。网页和手机网页（H5）直接放到网上；iOS 和安卓 App 用 Capacitor 把同一份网页“装进”App 壳。广告、内购、存档、分享各有一个“插座”，每个平台插自己的“插头”。**

1. **怎么打包**
   - 网页 / H5：和现在一样用 Vite 打包，放在 Vercel。手机浏览器打开的就是 H5，不另做一版。
   - 安卓 / iOS：用 **Capacitor** 包装同一份代码，生成可以上架的 App。游戏内容不重写。
   - CrazyGames、Discord：维持现有构建，不受影响。
2. **为什么不重写成 Unity 或原生 App**：重写要几个月，还会有两份代码，每次改玩法都要改两遍。我们的游戏是界面加卡片类玩法，网页技术完全够用。
3. **游戏和平台分开**：游戏代码只说“播一个奖励广告”“买去广告”“存档”。各平台由自己的“插头”去调用 CrazyGames、AdMob、苹果、谷歌的 SDK。以后加新平台，只需写一个新插头，游戏代码不用动。
4. **存档**：每台设备都先存在本地，没网也能玩。网页 / H5 / iOS / 安卓再用**我们自己的账号系统**（Supabase，代码已经写好）做云存档：玩家登录同一个账号，换手机、从网页换到 App 都能接着玩。CrazyGames 继续用它自己的账号存档，不连我们的服务器。
5. **卖什么**：首版只卖**确定内容**：去广告 $3.99、装饰包 $1.99–3.99、入门包 $4.99。应用商店版**不卖随机包裹**，避免概率披露和开箱合规问题。
6. **广告放哪**：以玩家主动看的**奖励视频**为主。插屏只在“开完 3 个包裹且已玩满 3 分钟”这类自然停顿时出现。不放横幅，不放开屏广告。买了“去广告”就不再出现插屏。
7. **顺序（每步都有您能直接看的成果）**：
   M0 内部整理（CrazyGames 预览链接照常能玩）→ M1 网页 / H5 预览加测试广告 → M2 网页内购（沙盒付款）→ M3 安卓测试包 → M4 安卓广告加内购 → M5 iOS TestFlight → M6 提交商店。
   合计约 **27–37 个 Builder 人天**。
8. **需要您批准或花钱的**：Google Play 账号（$25，一次性）、Apple 开发者账号（$99/年）、AdSense H5 游戏广告申请、AdMob 账号、选 Paddle 还是 Stripe 收款、隐私政策更新、商品价格。另外**每一次上线正式环境都要您点头**。完整清单见第 7 节。
9. **最大风险**：苹果可能把只装了网页的 App 当成“网页壳”拒审。对策是 App 版加上真正的原生功能：原生登录、原生内购、每日提醒通知、离线可玩。

---

## 第二部分：技术细节

### 1. 打包方案

#### 1.1 推荐：Vite 网页构建 + Capacitor 原生壳

```
                       ┌── vite.config.ts            → dist/                → Vercel（网页 + H5，同一个包）
src/core  (纯规则)      ├── vite.crazygames.config.ts → dist-crazygames/     → CrazyGames 上传 zip
src/ui    (界面)   ────┼── discord/vite.config.ts    → discord/dist/        → Discord Activity
src/platform (接口)     └── vite.app.config.ts（新）   → dist-app/ → npx cap sync → android/（AAB）、ios/（IPA）
```

- **新文件**：`vite.app.config.ts`、入口 `src/native/main.ts`、`capacitor.config.ts`、`android/`、`ios/`（原生工程提交进仓库，这是 Capacitor 的常规做法）。
- **App 构建和网页构建的区别**：
  - 不注册 Service Worker，因为 App 自带全部文件。
  - 不做单标签页锁。
  - 存储换成原生（见 3.4 节）。
  - 广告、内购、登录走原生插件。
  - CSP（内容安全策略）和外链规则按 App 单独设置。
- **候选插件**（都很常用；版本以接入时的稳定版为准）：

| 用途 | 插件 |
|---|---|
| 生命周期、安卓返回键 | `@capacitor/app` |
| 原生键值存储 | `@capacitor/preferences` |
| 系统分享 | `@capacitor/share` |
| 每日提醒 | `@capacitor/local-notifications` |
| 状态栏、安全区 | `@capacitor/status-bar` |
| 广告（含 UMP 同意弹窗、iOS ATT） | `@capacitor-community/admob` |
| 内购 | `@revenuecat/purchases-capacitor` |
| 原生 Apple / Google 登录 | 原生登录插件 + Supabase `signInWithIdToken` |

- **H5 不另做**：现有网页已经是响应式布局。H5 就是手机浏览器打开同一个 Vercel 地址。只需在 M1 补真机检查：安全区、横竖屏、音频首次解锁。

#### 1.2 备选方案与取舍

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **Capacitor（推荐）** | 复用 100% 现有 TS 代码；插件生态成熟（AdMob、RevenueCat、Preferences 都有）；Ionic 维护，文档全 | WebView 性能上限低于原生（对卡片类游戏够用）；苹果 4.2“网页壳”风险要靠原生功能化解 | **采用** |
| Cordova | 同类、更老 | 维护活跃度低，Capacitor 就是它的继任者 | 不选 |
| 安卓 TWA（可信网页活动）+ iOS 不做 | 安卓壳极轻 | 内购必须走 Play Billing，TWA 里接起来别扭；iOS 无对应方案 | 不选 |
| React Native / Expo + WebView | 原生生态强 | 等于再写一层壳，游戏仍在 WebView 里，收益不大 | 不选 |
| 用 Unity / Godot 重写 | 原生性能、广告 SDK 一流 | 数月重写，两份代码，现有 2,000+ 行 UI 和全部测试作废 | 不选 |
| 只做 PWA（添加到主屏） | 零成本 | 进不了应用商店，iOS 上没有原生内购和广告 | 作为网页版附带能力保留（已有 `sw.js`） |

### 2. 平台适配层

#### 2.1 现状（好消息：插座已经有一半）

`src/platform/types.ts` 已经定义了 `Platform`：
- `kv`、`loadState` / `saveState`：存储
- `ads?: AdService`：`available`、`rewarded`、`midgame`
- `host?: HostHooks`：游戏开始/停止事件、静音
- `ageGate?`：是否显示年龄页

此外还有：
- `src/auth/types.ts`：`AuthService` 和 `SaveStore`，即账号和云存档
- `src/platform/social.ts`：`SocialService`，Discord 的分享和捎带包裹
- `src/discord/store.ts`：`DiscordStore`，加上“服务器确认后发货”的 `ClaimBackend`
- `supabase/migrations/0001–0004`：订单、钱包、退款

**问题在于平台差异散落在 UI 里，而且一个开关代表了两件事。**

| 位置 | 现在的写法 | 问题 |
|---|---|---|
| `src/ui/app.ts:63` | `adMode = !!platform.ads`，有广告就隐藏商店 | 手机 App 同时有广告和内购，这个等式不再成立 |
| `src/ui/app.ts:52` | `platform.id === 'crazygames'` 控制布局 | 应改为开关 |
| `src/ui/app.ts:834` | `platform.id === 'crazygames'` 控制文案 | 应改为开关 |
| `src/ui/app.ts:1665` | `rush: platform.id === 'web'` | 应改为开关 |
| `src/ui/app.ts:60` | `__WEB_BUILD__ && platform.id === 'web'` 控制周故事 | 应改为开关 |
| `src/discord/store.ts` | 购买接口只为 Discord 写 | 网页和 App 还没有统一的购买接口 |

#### 2.2 目标接口（草案，M0 落地）

```ts
// src/platform/types.ts（扩展，不破坏现有字段）
export type PlatformId = 'web' | 'ios' | 'android' | 'crazygames' | 'discord';

/** 平台差异开关。UI 只读这里，不再判断 platform.id。 */
export interface Features {
  shop: 'none' | 'rewards-only' | 'iap';  // CG = rewards-only；Discord/web/app = iap
  randomPaidPacks: boolean;               // 只有 Discord 为 true；应用商店和网页首版为 false
  accounts: boolean;                      // 我们的 Supabase 账号（CG 为 false）
  externalLinks: boolean;                 // CG 为 false
  ageGate: boolean;                       // 取代现有 ageGate?
  stageLayout: boolean;                   // CG 固定舞台布局
  rush: boolean;
  week: boolean;
  notifications: boolean;                 // 仅 App
}

export interface AdService {               // 现有接口不变，只加两项
  available(): boolean;
  rewarded(onStart: () => void): Promise<AdResult>;
  midgame(onStart: () => void): Promise<AdResult>;
  /** 启动时调用一次：同意弹窗（UMP / ATT）、初始化。失败不阻塞游戏。 */
  init?(opts: { personalized: boolean }): Promise<void>;
  /** 买了去广告后调用：插屏永远不再请求，奖励视频保留。 */
  setNoAds?(on: boolean): void;
}

export type ProductId = 'noads' | 'decor_station' | 'decor_outfit' | 'starter' | 'gems60' | 'gems330';
export interface Product { id: ProductId; price: string; owned: boolean; kind: 'once' | 'consumable' }
export type BuyResult = 'ok' | 'pending' | 'cancelled' | 'owned' | 'unavailable' | 'busy' | 'need-account';

/** 内购。Discord 的 DiscordStore 是它的第一个实现（改名、合并）。 */
export interface StoreService {
  available(): boolean;
  products(locale?: string): Promise<Product[]>;
  buy(id: ProductId): Promise<BuyResult>;
  /** 应用商店要求的“恢复购买”。网页 = 重新从服务器领取。 */
  restore(): Promise<void>;
  owns(id: ProductId): boolean;
  /** 发货回调：游戏加内容并存档后才返回（沿用 Discord 的收件箱模式）。 */
  onGrant(handler: (g: Grant) => void): void;
}

export interface ShareService {
  share(text: string, url?: string): Promise<'sent' | 'copied' | 'cancelled'>;
}

/** App 才有：切后台立即存档，安卓返回键。 */
export interface Lifecycle { onPause(cb: () => void): void; onBack(cb: () => boolean): void }

export interface Platform {
  readonly id: PlatformId;
  readonly features: Features;
  readonly kv: Kv;
  // …现有存储、语言、年龄方法不变…
  readonly ads?: AdService;
  readonly store?: StoreService;
  readonly share?: ShareService;
  readonly host?: HostHooks;
  readonly lifecycle?: Lifecycle;
}
```

各平台的实现：

| 接口 | 网页 / H5 | 安卓 / iOS（Capacitor） | CrazyGames | Discord |
|---|---|---|---|---|
| `kv` | localStorage（现有 `webKv`） | `@capacitor/preferences` + 内存镜像 | CG Data 模块（现有 `dataKv`） | 现有 |
| 云存档 / 账号 | Supabase（现有） | Supabase + 原生 Apple/Google 登录 | 无（CG 账号存档） | Supabase + Discord 登录（现有） |
| `ads` | Google H5 Games Ads（`adBreak`） | AdMob | CrazyGames SDK（现有） | 无 |
| `store` | Paddle（或 Stripe）结账 → webhook → Supabase | RevenueCat → webhook → Supabase | 无（`rewards-only`） | Discord SKU（现有） |
| `share` | Web Share API，退回复制链接 | `@capacitor/share` | 无（不许外链） | 现有 `SocialService.share` |
| `lifecycle` | `visibilitychange` | `@capacitor/app` | — | — |

#### 2.3 硬规则（M0 用测试固定下来）

1. `src/core/**` 和 `src/ui/**` **不得 import** 任何平台 SDK 或平台实现目录（`src/crazygames`、`src/native`、`src/web-pay` 等），只能 import `src/platform/types.ts`。加一个 vitest 测试扫描 import 语句。
2. **每个平台一个入口文件**：在入口里组装 `Platform`，然后调用 `startApp(platform, …)`。
3. **构建产物检查**：扩展 `scripts/check-release.mjs`。
   - CrazyGames 包里不得出现 `admob`、`paddle`、`revenuecat`、`supabase` 字样。
   - App 包里不得出现 `crazygames`、`sw.js` 注册。
4. **发货只信服务器**：任何平台都不在前端根据“支付成功”回调直接发货，只能从服务器领取（沿用 `claim_web_orders` 和 `claim_discord_orders` 的单语句领取）。
5. **没有广告也要能玩**：`available() === false` 时广告按钮隐藏，金币替代方案保留（现有 `src/core/ads.ts` 的规则）。

#### 2.4 现有 CrazyGames 代码怎么迁移

CrazyGames 已经是“插头”的写法：`src/crazygames/platform.ts`、`ads.ts`、`sdk.ts` 都在接口之后。迁移只改“开关”，不改行为。

1. `createCrazyGamesPlatform` 增加以下开关，`ageGate` 从 `CRAZYGAMES_CONFIG` 读：

   ```ts
   features: { shop: 'rewards-only', accounts: false, externalLinks: false, stageLayout: true,
               rush: false, week: false, randomPaidPacks: false, notifications: false, ageGate: … }
   ```

2. `src/ui/app.ts` 中 2.1 节列出的几处 `platform.id ===` 判断，以及 `adMode = !!ads`，改为读 `platform.features.*`。
   - 现有“广告奖励代替商店”的界面改由 `shop === 'rewards-only'` 打开。
   - 新的 `shop === 'iap'` 加 `ads` 的组合，用于手机 App：商店和奖励视频并存。
3. `src/discord/store.ts` 的 `DiscordStore` 改为实现 `StoreService`（加 `restore()`；`'mobile'` 结果映射为 `'unavailable'`）。
   - `ClaimBackend`、收件箱、`delivered` 去重原样保留，作为网页和 App 购买的同一套发货逻辑。
4. **验收**：`tests/crazygames.smoke.test.ts` 和 `tests/discord/*` 不改断言就全部通过；CrazyGames 预览包肉眼对比无变化。
5. **注意**：`tao-24/crazygames-b1` 正在改 `src/crazygames/*` 和 `src/ui/app.ts`，**M0 必须等 TAO-24 合并后再开工**，避免冲突。

### 3. 存档与账号

#### 3.1 选项

| 选项 | 说明 | 优点 | 缺点 |
|---|---|---|---|
| A. 只存本地 | 每台设备各自存 | 最简单，零服务器 | 删 App 或换手机就丢档；买过的东西无法恢复。**应用商店上不可行** |
| B. 各平台自带云存档 | CG Data 模块、iCloud、Google Play 存档 | 不用自己的服务器 | 三套 API；进度不能跨平台；Google Play Games 存档还要额外接入 |
| **C. 本地 + 我们的 Supabase 账号（推荐）** | 先存本地；登录后云存档跟着账号走 | **代码已写好**：游客账号、邮箱/Apple/Google 升级、`push_save` 版本号防覆盖、`planMerge` 冲突合并、删号函数 | 要运营 Supabase（免费档起步）；Apple 要求同时提供 Sign in with Apple；App 内删号 |

#### 3.2 建议

- **网页 / H5 / iOS / 安卓：用 C。**
  - 首次打开时静默创建游客账号，玩家无感，不用填任何东西。
  - 玩家主动“绑定账号”后，进度和已购内容跨设备、跨平台同步。
- **CrazyGames：保持现状**，用 CG Data 模块，不连我们的服务器。这是全年龄版本和 COPPA 的要求，进度不与其他平台互通。
- **Discord：保持现状**，使用 Supabase 和 Discord 登录。是否与网页账号打通，放到以后再定，首版不做。
- **购买权益挂在 Supabase 账号上**，不挂在设备上：
  - 新增 `entitlements` 表（`user_id`、`product`、`source`、`source_order_id`、`revoked_at`）。
  - 网页 webhook 和 RevenueCat webhook 都写这张表。
  - 退款时把 `revoked_at` 置位（沿用 0003 的 `refund_order` 思路）。
- **跨平台权益**：在网页买的“去广告”，到 App 里登录后也生效，反之亦然。苹果规则允许“在别处购买、在 App 内使用”，前提是 App 内同样能用 IAP 买到。我们不在 App 里引导玩家去网页买，避免违反反导流规则。

#### 3.3 冲突处理

沿用现有逻辑：云端版本号不一致时拒绝写入，让玩家在冲突界面选一份（`planMerge` 和 `keepOne`，`app.ts` 的 conflict 弹窗）。不做自动合并，以免宝石或物品被复制。

#### 3.4 App 内的存储细节

- WKWebView 的 localStorage 在 iOS 存储紧张时**可能被清理**。所以 App 版的 `kv` 用 `@capacitor/preferences`（iOS UserDefaults，安卓 SharedPreferences）。
- `Kv` 接口是同步的，原生存储是异步的。做法：
  - 启动时一次性把所有 key 读进内存。
  - 写入时同步更新内存，再异步写到原生。
  - 切后台时（`lifecycle.onPause`）立即落盘。
- 首次启动时，把 WebView 里可能存在的旧 localStorage 存档搬一次（与 CG 的 `MIGRATE_KEYS` 同一思路）。

### 4. 商品与广告位草案

#### 4.1 内购商品（草案，价格待您定）

| ID | 名称 | 价格（美元基准） | 类型 | 网页 / H5 | 安卓 / iOS | Discord | CG |
|---|---|---:|---|:-:|:-:|:-:|:-:|
| `noads` | 去广告（去掉插屏；奖励视频保留，仍可选看） | $3.99 | 一次性 | ✅ | ✅ | — 本来无广告 | ❌ |
| `decor_station` | 车站装饰包 | $1.99 | 一次性 | ✅ | ✅ | 后续 | ❌ |
| `decor_outfit` | 制服包（Discord 已有 `outfit`） | $1.99 | 一次性 | ✅ | ✅ | ✅ 现有 | ❌ |
| `starter` | 入门包 = 车站装饰 + 制服 + 去广告 | $4.99 | 一次性 | ✅ | ✅ | — | ❌ |
| `gems60` / `gems330` | 宝石包 | $0.99 / $4.99 | 消耗型 | **首版不卖** | **首版不卖** | ✅ 现有 | ❌ |
| `season` | 月卡 / 季票 | $4.99/月 | 订阅 | 后续 | 后续 | 后续 | ❌ |

说明：
- 宝石目前能换随机包裹。等宝石只能换确定内容后，网页和 App 才开卖宝石；在那之前 `randomPaidPacks=false`。
- 所有一次性商品都必须支持“恢复购买”：App 内有按钮，网页登录即恢复。
- 三家商店（Apple、Google、Paddle）使用同一套商品 ID，价格各自设置。

#### 4.2 广告位（草案）

| # | 时机 | 形式 | 规则 | 平台 |
|---|---|---|---|---|
| R1 | “提前送货”：+3 个包裹（现有） | 奖励视频 | 现有规则：冷却 3 分钟、每天 8 次、可用金币替代 | 全部带广告平台 |
| R2 | “神秘包裹”（现有） | 奖励视频 | 同上 | 同上 |
| R3 | 猜稀有度连胜断了，看广告“续一次” | 奖励视频 | 每天 1 次；不看也不损失已得奖励 | 候选，M4 前定 |
| R4 | 每日签到奖励翻倍 | 奖励视频 | 每天 1 次 | 候选 |
| I1 | 开完第 3 个包裹后点“下一个”（现有 midgame） | 插屏 | 本局满 3 分钟后才可能出现；至少隔 3 个包裹；广告网络自己的最短间隔另算；`noads` 后关闭 | 全部带广告平台 |
| I2 | Rush Hour 一局结算后回主页 | 插屏 | 与 I1 共用频率上限；`noads` 后关闭 | 候选 |

**永远不放**：
- 前 3 分钟内
- 拖拽或摆放过程中
- 商店或购买确认页
- 返回键或关闭按钮上
- 连续两次全屏广告
- 开屏广告
- 横幅（首版）

**同意与儿童**：
- App 启动时先过年龄页（13+）。
- 然后显示 Google UMP 同意弹窗；iOS 再显示 ATT 弹窗。
- 未成年或未知年龄：只请求非个性化广告，并设置最大内容分级。

### 5. 里程碑

每个里程碑都由 Builder 在一次或几次运行中完成，QA 按验收标准检查，Architect 审 PR，**您批准后才合并或上线**。

| 里程碑 | 内容 | 您能检查的成果 | 验收要点（QA） | Builder 人天 | 依赖 |
|---|---|---|---|---:|---|
| **M0 平台层整理** | `Features`、`StoreService`、`ShareService`、`Lifecycle` 接口；UI 改读开关；`DiscordStore` 实现 `StoreService`；import 守卫测试；`check-release` 扩展 | CrazyGames 预览链接和 Discord 预览照常能玩（截图对比无变化） | 现有全部测试不改断言就通过；`src/ui`、`src/core` 无平台 SDK import | 2–3 | TAO-24 已合并 |
| **M1 网页 / H5 可发布 + 测试广告** | H5 Games Ads 适配器（测试模式）；Web Share；真机安全区、音频、横竖屏；`noads` 开关接通（先用开发开关模拟） | Vercel **预览链接**：手机打开能玩，奖励视频（测试广告）能领奖励；iPhone 和安卓浏览器截图 | 广告被拦截时按钮隐藏、金币替代可用；前 3 分钟无插屏 | 3–4 | AdSense H5 申请（可先用测试模式） |
| **M2 网页内购（沙盒）** | 结账页（Paddle 或 Stripe）；webhook edge function → `web_orders` / `entitlements`；领取发货；恢复购买；退款回收；上线 Supabase 0004；CSP | 预览链接里用**沙盒卡**买“去广告”，插屏消失；后台退款后恢复插屏 | 同一订单两台设备只发一次；webhook 验签；伪造请求被拒 | 4–6 | Paddle/Stripe 账号；Supabase 生产迁移 |
| **M3 安卓测试包** | Capacitor 工程；`vite.app.config.ts`；原生 `kv`；返回键；切后台存档；状态栏和安全区；离线；每日提醒通知；Supabase 原生 Google 登录 | 可安装的 **APK**，或 Play「内部测试」链接；真机截图 | 断网能玩；删 App 前登录过的存档，重装登录后能找回 | 5–6 | Google Play 账号 $25 |
| **M4 安卓广告 + 内购** | AdMob 加 UMP；RevenueCat 加 Play Billing；RevenueCat webhook → `entitlements`；恢复购买；隐私页更新 | Play 内部测试版：看**测试广告**、用**测试账号**买去广告，然后“恢复购买” | 未成年只出非个性化广告；网页买的权益在 App 登录后生效 | 5–7 | AdMob 账号；Play 商品配置 |
| **M5 iOS TestFlight** | iOS 工程；Sign in with Apple；StoreKit（通过 RevenueCat）；ATT；App 内删号撤销 Apple token（ship-plan W5）；隐私清单 | **TestFlight 邀请**，您的 iPhone 直接装；沙盒购买 | 苹果审核清单自查表全部打勾 | 5–7 | Apple 账号 $99/年；Apple 密钥 |
| **M6 提交商店** | 商店截图、文案（中 / 英 / 西）、Data safety 和 App Privacy、年龄分级、审核备注 | 商店后台“待审核”截图；**上线由您点按钮** | 两家商店审核通过 | 3–4 | 您确认文案和价格 |
| **合计** | | | | **27–37** | |

说明：
- M1–M2（网页）和 M3（安卓壳）互不依赖，Builder 人手够时可以并行。
- M2 和 M4 共用 `entitlements` 表，先做的那个负责建表。

### 6. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 苹果 4.2“网页壳”拒审 | iOS 上不了 | 原生登录、原生内购、本地通知、离线可玩；审核备注写清玩法和测试账号 |
| WebView 性能或音频（iOS 自动播放限制） | 卡顿、首次无声 | 首次点击时解锁音频（现有逻辑复查）；M3 在低端安卓机上测帧率 |
| iOS 清理 WebView 存储 | 丢档 | 原生 Preferences 加云存档（3.4 节） |
| 重复发货或刷单 | 亏钱 | 只信服务器；单语句领取；webhook 验签；订单 ID 唯一 |
| H5 Games Ads 申请不过 | 网页没广告收入 | 网页先靠内购；备选 AdSense 普通广告位（只放静态页）或暂不放 |
| CrazyGames 包混入别的平台代码 | CG 审核不过或违反 COPPA | `check-release` 字符串检查加入发布流程 |
| 与 TAO-24 并行修改冲突 | 返工 | M0 等 TAO-24 合并 |
| Paddle 小额固定费 $0.50 | $1.99 商品被抽约 30% | 网页首版只上 $3.99 以上商品，或者改用 Stripe 并自己报税（您来决定） |

**安全要点**（每个涉及支付的 PR 单独做安全审查）：
- 服务端密钥只放在 Supabase edge function 的环境变量里：Paddle/Stripe API key 和 webhook secret、RevenueCat secret、Supabase service role。
- 前端只放可公开的 ID：AdMob App ID、Paddle client token、Supabase publishable key。
- `entitlements` 和 `web_orders` 开 RLS：玩家只能读自己的，写入只来自 webhook。

### 7. 需要创始人审批的事项

**花钱 / 开账号**
- [ ] Google Play 开发者账号：$25 一次性（M3 前）
- [ ] Apple Developer Program：$99/年（M5 前）。决定用个人还是公司主体；公司需要 D-U-N-S
- [ ] 网页收款方式：**Paddle**（替你处理全球销售税，每笔 5% + $0.50）或 **Stripe**（每笔 2.9% + $0.30，税要自己报）。我建议 Paddle（M2 前）。注意：现有 `web_orders` 表是按 Stripe 写的，选 Paddle 需要小改
- [ ] AdSense 账号，并申请 H5 Games Ads（M1 前，申请制）
- [ ] AdMob 账号（M4 前）
- [ ] RevenueCat 账号：月流水 $2,500 以下免费（M4 前）。说明：调研建议“暂不接”；我从技术上建议接，因为它能省掉自己写苹果和谷歌收据校验，在我们的规模下不花钱
- [ ] 域名（如还没有，约 $10–20/年）
- [ ] 可选：测试用安卓机（约 $100–200）、律师审隐私条款（约 $300–1,000）

**产品决定**
- [ ] 商品清单和价格（第 4.1 节）
- [ ] 候选广告位 R3、R4、I2 是否要（第 4.2 节）
- [ ] 应用商店和网页首版不卖随机包裹，不卖宝石（确认）
- [ ] 隐私政策和服务条款新版（需要加入广告、网页支付、App 的内容）

**上线生产环境（每次都要您批准）**
- [ ] 在生产 Supabase 运行新迁移（0004、`entitlements`）
- [ ] 网页正式域名发布，以及开启真实广告
- [ ] 开启真实付款（从沙盒切到正式）
- [ ] Google Play 正式轨道发布
- [ ] App Store 提交审核和正式发布
- [ ] 任何合并到 `main`
