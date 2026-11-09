// Town board notes. Merged into UI by strings.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const BOARD_UI: Record<'en' | 'zh' | 'es', Record<string, any>> = {
  en: {
    boardTitle: 'Town board', boardNew: 'New notes in {t}',
    boardRules: 'Neighbors pin three jobs here every morning. Each pays +{c} 🪙. Finish all three for +{s} ✨ and a board stamp. Skipping a day costs nothing.',
    boardBy: 'from {name}', boardClaim: 'Claim', boardClaimed: 'Stamped',
    boardBonus: 'All three: +{s} ✨ and a stamp', boardStamps: 'Board stamps: {n}',
    boardGot: 'Claimed: +{c} 🪙 · +{r} reputation', boardStamped: 'Full board! Stamp #{n}: +{s} ✨',
    boardDone: 'Board note done: {x}. Claim it in Town.', boardPaid: 'Yesterday’s finished notes were paid: +{c} 🪙',
    boardStrip: 'Town board {a}/{b}', boardReady: '{n} to claim', boardExpired: 'A new board went up.',
    tasks: {
      open: 'Open {n} parcels', guess: 'Get {n} guesses right', sound: 'Open something that goes “{s}”', series: 'Open {n} parcels from {p}',
      return: 'Hand a lost parcel to its neighbor', gift: 'Give a neighbor a gift', daily: 'Play the daily mystery parcel',
      request: 'Finish a resident request', rush: 'Work a Rush Hour shift', wish: '{name} is looking for',
    },
    taskSay: {
      open: '“The counter is piling up. Help me clear it?”', guess: '“Bet you can’t call two of these right.”',
      sound: '“I heard it through the wall. What makes that noise?”', series: '“That shop sent a whole crate. Any good ones?”',
      return: '“Someone is missing a parcel. You’ll know who.”', gift: '“Somebody on this street needs cheering up.”',
      daily: '“Today’s mystery parcel has me stumped.”', request: '“A neighbor asked for something. Can you find it?”', wish: '“I’ve been looking everywhere. Do you have a spare?”',
      rush: '“The evening rush is coming. Need an extra pair of hands.”',
    },
  },
  zh: {
    boardTitle: '小镇公告板', boardNew: '{t}后换新纸条',
    boardRules: '每天早上邻居们会在这里贴三件小事。每完成一件 +{c} 🪙，三件都完成再得 +{s} ✨ 和一枚公告章。哪天没空也不会损失什么。',
    boardBy: '{name} 贴的', boardClaim: '领取', boardClaimed: '已盖章',
    boardBonus: '三件全完成：+{s} ✨ 和一枚公告章', boardStamps: '公告章：{n} 枚',
    boardGot: '已领取：+{c} 🪙 · 口碑 +{r}', boardStamped: '公告板全部完成！第 {n} 枚公告章：+{s} ✨',
    boardDone: '公告板任务完成：{x}，去小镇领取。', boardPaid: '昨天完成但没领取的纸条已发放：+{c} 🪙',
    boardStrip: '小镇公告板 {a}/{b}', boardReady: '{n} 件可领取', boardExpired: '公告板已经换新了。',
    tasks: {
      open: '拆 {n} 个包裹', guess: '猜对 {n} 次', sound: '拆出一件“{s}”声的东西', series: '拆 {n} 个来自{p}的包裹',
      return: '把一件错寄包裹送到邻居手上', gift: '给邻居送一份礼物', daily: '玩一次每日神秘包裹',
      request: '完成一个居民委托', rush: '上一班高峰时刻', wish: '{name}在找',
    },
    taskSay: {
      open: '“柜台都堆满了，帮我清一清？”', guess: '“赌你猜对不了两次。”',
      sound: '“隔着墙都听见了，到底是什么在响？”', series: '“那家店寄来一整箱，有好东西吗？”',
      return: '“有人的包裹丢了，你肯定知道是谁的。”', gift: '“这条街上有人需要开心一下。”',
      daily: '“今天的神秘包裹把我难住了。”', request: '“有位邻居想要个东西，你能找到吗？”', wish: '“我找了好久。你那儿有多余的吗？”',
      rush: '“晚高峰快来了，需要多一双手。”',
    },
  },
  es: {
    boardTitle: 'Tablón del pueblo', boardNew: 'Notas nuevas en {t}',
    boardRules: 'Cada mañana los vecinos clavan aquí tres encargos. Cada uno da +{c} 🪙. Los tres: +{s} ✨ y un sello. Saltarte un día no cuesta nada.',
    boardBy: 'de {name}', boardClaim: 'Cobrar', boardClaimed: 'Sellado',
    boardBonus: 'Los tres: +{s} ✨ y un sello', boardStamps: 'Sellos del tablón: {n}',
    boardGot: 'Cobrado: +{c} 🪙 · +{r} de reputación', boardStamped: '¡Tablón completo! Sello n.º {n}: +{s} ✨',
    boardDone: 'Nota del tablón hecha: {x}. Cóbrala en el Pueblo.', boardPaid: 'Se pagaron las notas de ayer: +{c} 🪙',
    boardStrip: 'Tablón {a}/{b}', boardReady: '{n} por cobrar', boardExpired: 'Ya hay un tablón nuevo.',
    tasks: {
      open: 'Abre {n} paquetes', guess: 'Acierta {n} veces', sound: 'Abre algo que suene a “{s}”', series: 'Abre {n} paquetes de {p}',
      return: 'Entrega un paquete perdido a su vecino', gift: 'Hazle un regalo a un vecino', daily: 'Juega el paquete misterioso del día',
      request: 'Cumple un encargo de un vecino', rush: 'Haz un turno de Hora punta', wish: '{name} busca',
    },
    taskSay: {
      open: '“El mostrador está a rebosar. ¿Me ayudas?”', guess: '“A que no aciertas ni dos.”',
      sound: '“Lo oí a través de la pared. ¿Qué hace ese ruido?”', series: '“Esa tienda mandó una caja entera. ¿Algo bueno?”',
      return: '“A alguien le falta un paquete. Tú sabrás de quién.”', gift: '“Alguien en esta calle necesita una alegría.”',
      daily: '“El paquete misterioso de hoy me tiene perdido.”', request: '“Un vecino pidió algo. ¿Lo encuentras?”', wish: '“Lo he buscado por todas partes. ¿Te sobra uno?”',
      rush: '“Llega la hora punta. Hace falta otra mano.”',
    },
  },
};
