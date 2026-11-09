// Station Week copy in the three game languages. {x} placeholders are filled by the overlay.
import type { RunEvent, RunTool, StampId } from '../core/run';
import type { LedgerId } from '../core/types';

export interface WeekText {
  title: string; kicker: string; intro: string; rules: [string, string, string, string];
  start: string; resume: string; abandon: string; abandonConfirm: string; exit: string; record: string; rewardToday: string; rewardDone: string;
  ledger: string; ledgerNote: string; ledgerBusy: string; ledgerNext: string; ledgerActive: string; ledgerNone: string; ledgerNames: Record<LedgerId, string>; ledgerDesc: Record<LedgerId, string[]>;
  marks: string; buy: string; maxed: string; notEnough: string; bought: string; freeLeft: string; freeChecksDay: string; storageShort: string; level: string; startCoins: string; keen: string;
  day: string; ap: string; complaints: string; takings: string; target: string; goal: string; noTarget: string;
  hot: string; cold: string; orders: string; noOrders: string; desk: string; deskEmpty: string; storage: string;
  pickParcel: string; parcelNo: string; insured: string; unchecked: string; maybe: string; nothingFits: string; mayHold: string;
  tools: Record<RunTool, string>; toolOff: string; free: string;
  clueSound: string; clueWeight: string; cluePostmark: string; clueSmudge: string; clueSticker: string;
  sellTo: string; giveTo: string; sendBack: string; endDay: string; endDayWarn: string;
  clueSeries: string; clueSnd: string; clueUnder: string; clueOver: string;
  sold: string; soldWrong: string; complaint: string; forgiven: string; returned: string; wasted: string; orderDone: string; orderWrong: string;
  evening: string; earnedToday: string; targetMet: string; targetMissed: string; pickTitle: string; reroll: string; noReroll: string; skip: string;
  events: Record<RunEvent, [string, string]>;
  stamps: Record<StampId, [string, string]>;
  schools: Record<string, string>;
  win: string; lose: string; grade: string; marksEarned: string; marksPractice: string; stats: string; back: string; again: string; openLedger: string;
  theme: string; eventOpen: string; eventSoon: string; eventClockBehind: string; eventOpenShort: string; eventSoonShort: string; practice: string;
  rewardTitle: string; rewardFinish: string; rewardWin: string; rewardThree: string; rewardClaimed: string; rewardPending: string;
  eventPaid: string; eventNone: string; eventAlready: string; eventClosed: string;
  share: string; shareCopied: string; shareFail: string; shareText: string; bestWeek: string; runsWeek: string; noRuns: string;
  loadFail: string;
}

const en: WeekText = {
  title: 'Station Week', kicker: 'Back room · a five-day shift',
  intro: 'The front counter is for collectors. Out back, the wholesale crates arrive: plain, sealed and all alike. You never open them; postmark, weight and sound are all you get. They pile up faster than you can check them, so choose what to inspect, what to risk and where each one goes.',
  rules: [
    'Each check costs action points. You cannot check everything.',
    'Sell to a shop, answer an order, or send misdelivered crates back.',
    'Wrong moves earn complaints. Three complaints end the week.',
    'Hit the takings targets. Each evening, pick one stamp to build your station.',
  ],
  start: 'Start the week', resume: 'Resume day {d}', abandon: 'Give up this week', abandonConfirm: 'Tap again to give up. Nothing outside the week is lost.', exit: 'Back',
  record: 'Best {g} · weeks won {w} of {p}', rewardToday: "Today's first finished week pays ledger marks. Later runs are practice.", rewardDone: "Today's ledger marks are collected. More runs are practice.",
  ledger: 'Back-room ledger', ledgerNote: 'Finishing a week earns marks. Upgrades only affect Station Week, never the main save economy.', ledgerBusy: 'Upgrade after the week', ledgerNext: 'Next: {d}', ledgerActive: 'Active: {d}', ledgerNone: 'No upgrades yet',
  ledgerNames: { hands: 'Extra Hands', shelves: 'Extra Shelving', eye: 'Keen Eye' },
  ledgerDesc: {
    hands: ['+1 action point every day.', '+20 starting coins for an extra stamp reroll.'],
    shelves: ['+1 crate can wait overnight.', '+1 more crate can wait overnight.'],
    eye: ['The first basic check each day is free (X-ray excluded).', 'Postmarks are never smudged for you.'],
  },
  marks: 'Ledger marks', buy: 'Upgrade · {c} 🖋', maxed: 'Maxed', notEnough: 'Not enough marks', bought: 'Ledger upgraded.', freeLeft: '{n} free checks', freeChecksDay: '{n} free checks a day', storageShort: 'Storage', level: 'Level {n}/{m}', startCoins: 'Starting coins', keen: 'Clear postmarks',
  day: 'Day {d}/{n}', ap: 'Action points', complaints: 'Complaints', takings: 'Takings', target: '{c} by day {d}', goal: 'Week goal', noTarget: 'No more targets',
  hot: 'busy', cold: 'slow', orders: 'Orders', noOrders: 'No open orders.', desk: 'On the counter', deskEmpty: 'Counter clear. End the day when ready.',
  storage: 'Up to {n} crates can wait until tomorrow; the rest go back to the depot unpaid.',
  pickParcel: 'Pick a crate to work on.', parcelNo: 'Crate #{n}', insured: 'Insured', unchecked: 'Not checked', maybe: 'Could be: {s}', nothingFits: 'Fits no shop here: misdelivered?', mayHold: 'May hold: {s}',
  tools: { postmark: 'Read postmark', shake: 'Shake', weigh: 'Weigh', xray: 'X-ray' }, toolOff: 'Not today', free: 'free',
  clueSound: 'Sound: {s}', clueWeight: 'Weight: {w} oz', cluePostmark: 'Postmark: {p}', clueSmudge: 'Smudged postmark: {l}', clueSticker: 'X-ray: {s}',
  sellTo: 'Sell to {s}', giveTo: 'Give to {r}', sendBack: 'Send back (misdelivered)', endDay: 'Close for the day', endDayWarn: '{n} crates will go back to the depot unpaid. Tap again to close.',
  clueSeries: 'from {s}', clueSnd: 'that makes {s}', clueUnder: 'under {w} oz', clueOver: 'over {w} oz',
  sold: 'Sold: +{c} coins', soldWrong: 'Wrong shop, half price: +{c} coins', complaint: 'A complaint!', forgiven: 'A stamp covered that mistake.',
  returned: 'Misdelivered crate returned: +{c} coins', wasted: 'That crate was ours. Sent back for nothing.', orderDone: 'Order done: +{c} coins', orderWrong: "That doesn't fit the order.",
  evening: 'Evening, day {d}', earnedToday: 'Takings so far: {c}', targetMet: 'Target met.', targetMissed: 'Target missed: one complaint.',
  pickTitle: 'Pick a stamp', reroll: 'New offer ({c} coins)', noReroll: 'No more new offers', skip: 'Take none',
  events: {
    rain: ['Rain', 'Wet postmarks: no postmark checks today.'],
    powercut: ['Power cut', 'No X-ray today, and 2 fewer action points.'],
    moving: ['Moving day', 'Three extra crates; misdelivered returns pay double.'],
    audit: ['Postal audit', 'Every wrong-shop sale is a complaint today.'],
    holiday: ['Holiday rush', 'Half again as many crates, and one more order.'],
  },
  stamps: {
    'tuning-fork': ['Tuning Fork', 'The first 3 shakes each day are free.'],
    echo: ['Echo', 'Right sales of shaken crates build a streak: +2 coins per step (max 5).'],
    appraiser: ['Appraiser', 'Insured crates sell for +50%.'],
    bonded: ['Bonded', 'Your first mistake with an insured crate each day is forgiven.'],
    hunch: ['Hunch', 'Right sales of crates you never checked pay +60%.'],
    'lucky-cat': ['Lucky Cat', 'Your first mistake with an unchecked crate each day is forgiven.'],
    shelving: ['Shelving', '+2 crates can wait until tomorrow.'],
    'full-crate': ['Full Crate', 'From the 3rd right sale to one shop in a day: +6 coins each.'],
    'thank-you': ['Thank-you Notes', 'Orders pay +50%.'],
    favourite: ['Favourite', "Answer an order with the neighbor's favourite sound: +2 action points."],
    'extra-hands': ['Extra Hands', '+2 action points every day.'],
    'second-scale': ['Second Scale', 'Weighing is free.'],
    magnifier: ['Magnifier', 'Postmarks are never smudged for you.'],
    lamp: ['Brighter Lamp', 'The X-ray costs 2.'],
  },
  schools: { sound: 'Sound', insured: 'Insured', blind: 'Gut feeling', storage: 'Storage', regulars: 'Regulars', general: 'Station' },
  win: 'Week complete!', lose: 'The week ended early', grade: 'Grade', marksEarned: 'Ledger +{n} marks for finishing', marksPractice: "Today's marks are already collected; this run only records a score.",
  stats: 'Sold {a} · orders {b} · returned {c} · mistakes {d}', back: 'Back to the station', again: 'Another week', openLedger: 'Open ledger',
  theme: 'This week: {a} + {b}', eventOpen: 'Weekend event open · ends Monday', eventSoon: 'Weekend rewards open Friday · in {n} days', eventClockBehind: 'Device time changed · weekend rewards paused', eventOpenShort: 'Event open', eventSoonShort: 'Rewards in {n} days',
  practice: 'You can play any day. Coins and shards pay only Friday to Sunday.', rewardTitle: 'Weekend rewards · once each this week',
  rewardFinish: 'Finish a week: +{c} coins', rewardWin: 'Win the week: +{c} coins, +{s} shards', rewardThree: 'Three stars: +{s} shards', rewardClaimed: 'Claimed', rewardPending: 'Open',
  eventPaid: 'Weekend reward: +{c} coins, +{s} shards', eventNone: 'No new weekend reward this run.', eventAlready: 'This week’s weekend reward was already collected.', eventClosed: 'The weekend window is closed. This run is practice.',
  share: 'Copy result', shareCopied: 'Result copied. Paste it anywhere.', shareFail: 'Could not copy. Try again.', shareText: 'Parcelwood Station Week {w} {s} · sold {n}', bestWeek: 'Best this week: {g}', runsWeek: '{n} runs this week', noRuns: 'No runs this week yet.',
  loadFail: 'Station Week did not load. Check your connection and try again.',
};

const zh: WeekText = {
  title: '驿站一周', kicker: '后仓 · 五天的班',
  intro: '前台拆的是收藏包裹；后仓到的是批发货箱——一模一样、封死不拆，只能靠邮戳、重量和声音分辨。货箱来得比你查得快：查哪个、赌哪个、送去哪里，都由你决定。',
  rules: [
    '每次检查都要花行动点，不可能全部查完。',
    '货箱可以卖给店铺、交给订单，错寄的退回去。',
    '处理错了会收到投诉，满三次这周就结束。',
    '达成营业额目标。每天傍晚选一枚印章，打造你的驿站。',
  ],
  start: '开始这一周', resume: '继续第 {d} 天', abandon: '放弃这一周', abandonConfirm: '再点一次确认放弃。这一周以外的进度都不会丢。', exit: '返回',
  record: '最佳 {g} · 通关 {w}/{p} 周', rewardToday: '今天第一次收工可得账本印记；之后再玩只记录成绩。', rewardDone: '今天的账本印记已领取。再玩只记录成绩。',
  ledger: '后仓账本', ledgerNote: '收工得印记，升级只影响驿站一周，不进主存档经济。', ledgerBusy: '收工后升级', ledgerNext: '下一级：{d}', ledgerActive: '当前加成：{d}', ledgerNone: '尚未升级',
  ledgerNames: { hands: '多一双手', shelves: '加一层架', eye: '熟能生巧' },
  ledgerDesc: {
    hands: ['每天多 1 点行动点。', '开局多 20 金币，可多换一次印章。'],
    shelves: ['每天多留 1 个货箱过夜。', '再多留 1 个货箱过夜。'],
    eye: ['每天前 1 次普通检查免费（不含 X 光）。', '看邮戳时不再出现模糊邮戳。'],
  },
  marks: '账本印记', buy: '升级 · {c} 🖋', maxed: '已满级', notEnough: '印记不足', bought: '账本升级了。', freeLeft: '免费检查 {n}', freeChecksDay: '每天 {n} 次免费检查', storageShort: '仓储', level: '等级 {n}/{m}', startCoins: '开局金币', keen: '邮戳清晰',
  day: '第 {d}/{n} 天', ap: '行动点', complaints: '投诉', takings: '营业额', target: '第 {d} 天前达到 {c}', goal: '本周目标', noTarget: '没有更多目标',
  hot: '抢手', cold: '冷清', orders: '订单', noOrders: '没有待完成的订单。', desk: '柜台上', deskEmpty: '柜台已清空，准备好就收工。',
  storage: '最多 {n} 个货箱可以留到明天，其余退回仓库，不给钱。',
  pickParcel: '选一个货箱来处理。', parcelNo: '{n} 号货箱', insured: '保价', unchecked: '未检查', maybe: '可能是：{s}', nothingFits: '和这里的店都对不上：错寄的？', mayHold: '可能装着：{s}',
  tools: { postmark: '看邮戳', shake: '摇一摇', weigh: '称重', xray: 'X 光' }, toolOff: '今天不可用', free: '免费',
  clueSound: '声音：{s}', clueWeight: '重量：{w} oz', cluePostmark: '邮戳：{p}', clueSmudge: '模糊的邮戳：{l}', clueSticker: 'X 光：{s}',
  sellTo: '卖给{s}', giveTo: '交给{r}', sendBack: '退回（错寄）', endDay: '今天收工', endDayWarn: '有 {n} 个货箱会退回仓库，不给钱。再点一次收工。',
  clueSeries: '来自{s}', clueSnd: '声音是{s}', clueUnder: '轻于 {w} oz', clueOver: '重于 {w} oz',
  sold: '卖出：+{c} 金币', soldWrong: '卖错店，半价：+{c} 金币', complaint: '收到一次投诉！', forgiven: '印章抵消了这次失误。',
  returned: '错寄货箱已退回：+{c} 金币', wasted: '这个货箱是本站的，白退了。', orderDone: '订单完成：+{c} 金币', orderWrong: '这个和订单对不上。',
  evening: '第 {d} 天傍晚', earnedToday: '累计营业额：{c}', targetMet: '目标达成。', targetMissed: '没达到目标：一次投诉。',
  pickTitle: '选一枚印章', reroll: '换一批（{c} 金币）', noReroll: '不能再换了', skip: '都不要',
  events: {
    rain: ['下雨', '邮戳湿了：今天不能看邮戳。'],
    powercut: ['停电', '今天没有 X 光，行动点少 2。'],
    moving: ['搬家日', '多 3 个货箱；退回错寄的奖励翻倍。'],
    audit: ['邮政稽查', '今天卖错店也算一次投诉。'],
    holiday: ['节日高峰', '货箱多一半，订单多 1 张。'],
  },
  stamps: {
    'tuning-fork': ['音叉', '每天前 3 次摇一摇免费。'],
    echo: ['回声', '摇过的货箱连续卖对，每次多 +2 金币（最多 5 层）。'],
    appraiser: ['估价师', '保价货箱售价 +50%。'],
    bonded: ['担保', '每天第一次在保价货箱上出错不算投诉。'],
    hunch: ['直觉', '完全没检查就卖对，收入 +60%。'],
    'lucky-cat': ['招财猫', '每天第一次在未检查的货箱上出错不算投诉。'],
    shelving: ['加装货架', '多 2 个货箱可以留到明天。'],
    'full-crate': ['满箱', '同一天卖给同一家店第 3 件起，每件 +6 金币。'],
    'thank-you': ['感谢信', '订单收入 +50%。'],
    favourite: ['投其所好', '用邻居最喜欢的声音完成订单：+2 行动点。'],
    'extra-hands': ['帮手', '每天 +2 行动点。'],
    'second-scale': ['第二台秤', '称重免费。'],
    magnifier: ['放大镜', '你看到的邮戳永远不会模糊。'],
    lamp: ['更亮的灯', 'X 光只要 2 点。'],
  },
  schools: { sound: '听音', insured: '保价', blind: '直觉', storage: '仓储', regulars: '熟客', general: '驿站' },
  win: '这一周完成了！', lose: '这一周提前结束了', grade: '评级', marksEarned: '本周收工 +{n} 账本印记', marksPractice: '今天的印记已领取；这局只记录成绩。',
  stats: '卖出 {a} · 订单 {b} · 退回 {c} · 失误 {d}', back: '回到驿站', again: '再来一周', openLedger: '打开账本',
  theme: '本周：{a} + {b}', eventOpen: '周末活动开放中 · 周一结束', eventSoon: '周末奖励周五开放 · 还有 {n} 天', eventClockBehind: '设备时间有变化，周末奖励暂停', eventOpenShort: '活动开放', eventSoonShort: '奖励还有 {n} 天',
  practice: '每天都能玩。金币和碎片只在周五到周日发放。', rewardTitle: '周末奖励 · 每档每周一次',
  rewardFinish: '完成一周：+{c} 金币', rewardWin: '赢下这一周：+{c} 金币、+{s} 碎片', rewardThree: '三星：+{s} 碎片', rewardClaimed: '已领取', rewardPending: '可领取',
  eventPaid: '周末奖励：+{c} 金币、+{s} 碎片', eventNone: '这局没有新的周末奖励。', eventAlready: '本周的周末奖励已经领过了。', eventClosed: '周末活动已结束，这局只算练手。',
  share: '复制成绩', shareCopied: '成绩已复制，可以粘贴到任何地方。', shareFail: '复制失败，请再试一次。', shareText: 'Parcelwood 车站周 {w} {s} · 卖出 {n} 件', bestWeek: '本周最佳：{g}', runsWeek: '本周已玩 {n} 局', noRuns: '本周还没玩过。',
  loadFail: '驿站一周没有加载出来，请检查网络后再试。',
};

const es: WeekText = {
  title: 'Semana en la Estación', kicker: 'Trastienda · un turno de cinco días',
  intro: 'El mostrador es para coleccionistas. En la trastienda llegan los cajones al por mayor: lisos, sellados e idénticos. Nunca se abren; solo tienes el matasellos, el peso y el sonido. Llegan más de los que puedes revisar: elige qué revisar, qué arriesgar y adónde va cada uno.',
  rules: [
    'Cada revisión cuesta puntos de acción. No puedes revisarlo todo.',
    'Vende a una tienda, cumple un pedido o devuelve los cajones mal enviados.',
    'Los errores traen quejas. Con tres quejas se acaba la semana.',
    'Alcanza las metas de caja. Cada tarde, elige un sello para tu estación.',
  ],
  start: 'Empezar la semana', resume: 'Seguir el día {d}', abandon: 'Abandonar esta semana', abandonConfirm: 'Toca otra vez para abandonar. No pierdes nada fuera de la semana.', exit: 'Volver',
  record: 'Mejor {g} · semanas ganadas {w} de {p}', rewardToday: 'La primera semana terminada del día da marcas del libro. Las siguientes son práctica.', rewardDone: 'Las marcas de hoy ya están cobradas. Las siguientes partidas son práctica.',
  ledger: 'Libro de la trastienda', ledgerNote: 'Terminar una semana da marcas. Las mejoras solo afectan a la Semana en la Estación, nunca a la economía principal.', ledgerBusy: 'Mejora al cerrar la semana', ledgerNext: 'Siguiente: {d}', ledgerActive: 'Activo: {d}', ledgerNone: 'Sin mejoras',
  ledgerNames: { hands: 'Manos extra', shelves: 'Estante extra', eye: 'Ojo entrenado' },
  ledgerDesc: {
    hands: ['+1 punto de acción cada día.', '+20 monedas iniciales para cambiar sellos otra vez.'],
    shelves: ['+1 cajón puede esperar a mañana.', '+1 cajón más puede esperar a mañana.'],
    eye: ['La primera revisión básica de cada día es gratis (sin rayos X).', 'Para ti los matasellos nunca están borrosos.'],
  },
  marks: 'Marcas del libro', buy: 'Mejorar · {c} 🖋', maxed: 'Al máximo', notEnough: 'Faltan marcas', bought: 'Libro mejorado.', freeLeft: '{n} revisiones gratis', freeChecksDay: '{n} revisiones gratis al día', storageShort: 'Almacén', level: 'Nivel {n}/{m}', startCoins: 'Monedas iniciales', keen: 'Matasellos claros',
  day: 'Día {d}/{n}', ap: 'Puntos de acción', complaints: 'Quejas', takings: 'Caja', target: '{c} antes del día {d}', goal: 'Meta de la semana', noTarget: 'No quedan metas',
  hot: 'con demanda', cold: 'floja', orders: 'Pedidos', noOrders: 'No hay pedidos abiertos.', desk: 'En el mostrador', deskEmpty: 'Mostrador vacío. Cierra el día cuando quieras.',
  storage: 'Hasta {n} cajones pueden esperar a mañana; el resto vuelve al depósito sin pago.',
  pickParcel: 'Elige un cajón.', parcelNo: 'Cajón n.º {n}', insured: 'Asegurado', unchecked: 'Sin revisar', maybe: 'Podría ser: {s}', nothingFits: 'No encaja con ninguna tienda: ¿mal enviado?', mayHold: 'Puede contener: {s}',
  tools: { postmark: 'Leer matasellos', shake: 'Agitar', weigh: 'Pesar', xray: 'Rayos X' }, toolOff: 'Hoy no', free: 'gratis',
  clueSound: 'Sonido: {s}', clueWeight: 'Peso: {w} oz', cluePostmark: 'Matasellos: {p}', clueSmudge: 'Matasellos borroso: {l}', clueSticker: 'Rayos X: {s}',
  sellTo: 'Vender a {s}', giveTo: 'Dar a {r}', sendBack: 'Devolver (mal enviado)', endDay: 'Cerrar el día', endDayWarn: '{n} cajones volverán al depósito sin pago. Toca otra vez para cerrar.',
  clueSeries: 'de {s}', clueSnd: 'que suene a {s}', clueUnder: 'de menos de {w} oz', clueOver: 'de más de {w} oz',
  sold: 'Vendido: +{c} monedas', soldWrong: 'Tienda equivocada, mitad de precio: +{c} monedas', complaint: '¡Una queja!', forgiven: 'Un sello cubrió ese error.',
  returned: 'Cajón mal enviado devuelto: +{c} monedas', wasted: 'Ese cajón era nuestro. Devuelto para nada.', orderDone: 'Pedido cumplido: +{c} monedas', orderWrong: 'Eso no encaja con el pedido.',
  evening: 'Tarde del día {d}', earnedToday: 'Caja acumulada: {c}', targetMet: 'Meta alcanzada.', targetMissed: 'Meta no alcanzada: una queja.',
  pickTitle: 'Elige un sello', reroll: 'Otra oferta ({c} monedas)', noReroll: 'No hay más ofertas', skip: 'Ninguno',
  events: {
    rain: ['Lluvia', 'Matasellos mojados: hoy no se pueden leer.'],
    powercut: ['Apagón', 'Hoy no hay rayos X y tienes 2 puntos de acción menos.'],
    moving: ['Día de mudanza', 'Tres cajones más; devolver mal enviados paga el doble.'],
    audit: ['Inspección postal', 'Hoy cada venta en la tienda equivocada es una queja.'],
    holiday: ['Fiestas', 'La mitad más de cajones y un pedido más.'],
  },
  stamps: {
    'tuning-fork': ['Diapasón', 'Las 3 primeras agitadas de cada día son gratis.'],
    echo: ['Eco', 'Vender bien cajones agitados hace racha: +2 monedas por paso (máx. 5).'],
    appraiser: ['Tasador', 'Los cajones asegurados se venden un 50 % más caros.'],
    bonded: ['Fianza', 'Tu primer error con un cajón asegurado cada día no cuenta.'],
    hunch: ['Corazonada', 'Vender bien un cajón sin revisarlo paga un 60 % más.'],
    'lucky-cat': ['Gato de la suerte', 'Tu primer error con un cajón sin revisar cada día no cuenta.'],
    shelving: ['Estantería', '2 cajones más pueden esperar a mañana.'],
    'full-crate': ['Caja llena', 'Desde la 3.ª venta correcta a una tienda en un día: +6 monedas cada una.'],
    'thank-you': ['Notas de gracias', 'Los pedidos pagan un 50 % más.'],
    favourite: ['El favorito', 'Cumplir un pedido con el sonido favorito del vecino: +2 puntos de acción.'],
    'extra-hands': ['Más manos', '+2 puntos de acción cada día.'],
    'second-scale': ['Segunda báscula', 'Pesar es gratis.'],
    magnifier: ['Lupa', 'Para ti los matasellos nunca están borrosos.'],
    lamp: ['Lámpara potente', 'Los rayos X cuestan 2.'],
  },
  schools: { sound: 'Sonido', insured: 'Asegurados', blind: 'Corazonada', storage: 'Almacén', regulars: 'Clientes', general: 'Estación' },
  win: '¡Semana completada!', lose: 'La semana terminó antes', grade: 'Nota', marksEarned: 'Libro +{n} marcas por terminar', marksPractice: 'Las marcas de hoy ya están cobradas; esta partida solo cuenta para el récord.',
  stats: 'Vendidos {a} · pedidos {b} · devueltos {c} · errores {d}', back: 'Volver a la estación', again: 'Otra semana', openLedger: 'Abrir el libro',
  theme: 'Esta semana: {a} + {b}', eventOpen: 'Evento de fin de semana abierto · termina el lunes', eventSoon: 'Los premios abren el viernes · en {n} días', eventClockBehind: 'La hora del dispositivo cambió · premios del fin de semana en pausa', eventOpenShort: 'Evento abierto', eventSoonShort: 'Premios en {n} días',
  practice: 'Puedes jugar cualquier día. Las monedas y los fragmentos solo se pagan de viernes a domingo.', rewardTitle: 'Premios del fin de semana · una vez por semana',
  rewardFinish: 'Termina una semana: +{c} monedas', rewardWin: 'Gana la semana: +{c} monedas, +{s} fragmentos', rewardThree: 'Tres estrellas: +{s} fragmentos', rewardClaimed: 'Cobrado', rewardPending: 'Abierto',
  eventPaid: 'Premio del fin de semana: +{c} monedas, +{s} fragmentos', eventNone: 'Esta partida no trae premio nuevo.', eventAlready: 'El premio de esta semana ya está cobrado.', eventClosed: 'La ventana del fin de semana está cerrada. Esta partida es práctica.',
  share: 'Copiar resultado', shareCopied: 'Resultado copiado. Pégalo donde quieras.', shareFail: 'No se pudo copiar. Inténtalo otra vez.', shareText: 'Parcelwood Semana en la Estación {w} {s} · vendidos {n}', bestWeek: 'Mejor de la semana: {g}', runsWeek: '{n} partidas esta semana', noRuns: 'Aún no hay partidas esta semana.',
  loadFail: 'No se pudo cargar la Semana en la Estación. Revisa tu conexión e inténtalo de nuevo.',
};

const TEXT: Record<string, WeekText> = { en, zh, es };
export function weekText(lang: string): WeekText { return TEXT[lang] || en; }

/** One line for a chat: week, stars and sold count. No schedule or parcel details. */
export function weekShareText(T: WeekText, week: string, grade: number, sold: number): string {
  const stars = '★'.repeat(Math.max(0, grade)) + '☆'.repeat(Math.max(0, 3 - grade));
  return T.shareText.replace('{w}', week.slice(5)).replace('{s}', stars).replace('{n}', String(sold));
}
