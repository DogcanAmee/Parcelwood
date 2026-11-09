import type { TrayToolId } from '../core/rushHour';

export interface RushText {
  title: string;
  kicker: string;
  intro: string;
  steps: [string, string, string];
  pressure: string;
  shiftNo: string;
  prizeLine: string;
  prizeOwned: string;
  prizeNew: string;
  officialNote: string;
  practiceNote: string;
  practiceTag: string;
  officialTag: string;
  start: string;
  exit: string;
  pause: string;
  paused: string;
  resume: string;
  score: string;
  combo: string;
  hearts: string;
  time: string;
  bossIncoming: string;
  boss: string;
  layer: string;
  clues: string;
  noClues: string;
  smudge: string;
  postmark: string;
  pickHint: string;
  ready: string;
  cut: string;
  peel: string;
  swipe: string;
  waiting: string;
  sendBack: string;
  correct: string;
  wrong: string;
  caught: string;
  notDecoy: string;
  decoyMissed: string;
  decoyTitle: string;
  decoyNote: string;
  learn: string;
  keepsake: string;
  toolTitle: string;
  toolHint: string;
  toolTake: string;
  toolMax: string;
  toolLevel: string;
  win: string;
  lose: string;
  timeUp: string;
  winNote: string;
  loseNote: string;
  timeUpNote: string;
  opened: string;
  correctCount: string;
  bestCombo: string;
  accuracy: string;
  build: string;
  grade: string;
  rewardShards: string;
  rewardPrize: string;
  rewardPractice: string;
  rewardPracticeCoins: string;
  rewardPracticeNone: string;
  share: string;
  copied: string;
  shareTitle: string;
  replay: string;
  back: string;
  tools: Record<TrayToolId, [string, string]>;
}

const en: RushText = {
  title: 'Rush Hour',
  kicker: 'PARCELWOOD · EVENING SHIFT',
  intro: 'The evening truck just dropped off a mountain of parcels. Work out where each one came from before the belt backs up.',
  steps: ['Match the postmark letters to a crate', 'Use the shake sound to settle it', 'Cut the tape, or send misdelivered parcels back'],
  pressure: 'The belt speeds up. Three parcels falling off ends the shift. A wrong call earns no tips and breaks your combo.',
  shiftNo: 'Shift #{n}',
  prizeLine: "Today's oversized parcel holds",
  prizeOwned: 'Already in your album',
  prizeNew: 'Limited keepsake: open the oversized parcel to keep it',
  officialNote: "Today's first shift is the official one: everyone gets the same parcels, and your grade pays shards once.",
  practiceNote: "Today's official shift is done ({stars} · {score} tips). This one is practice: no shards, but the keepsake can still be won.",
  practiceTag: 'Practice',
  officialTag: 'Official',
  start: 'Clock in',
  exit: 'Exit',
  pause: 'Pause',
  paused: 'Shift paused',
  resume: 'Back to work',
  score: 'Tips',
  combo: 'Combo',
  hearts: 'Parcels left before closing',
  time: 'Until closing',
  bossIncoming: 'The Oversized Parcel is here!',
  boss: 'Oversized Parcel',
  layer: 'Layer {n}/{max}',
  clues: 'Clues on the box',
  noClues: 'Peel a layer to find a clue.',
  smudge: 'Smudged postmark: {l}',
  postmark: 'Postmark: {p}',
  pickHint: 'Which crate does it go in?',
  ready: 'Now swipe the tape to open it.',
  cut: 'Swipe the tape',
  peel: 'Peel the next layer',
  swipe: 'Tap or swipe across the tape',
  waiting: 'Waiting for the next parcel…',
  sendBack: 'Not ours · send back',
  correct: 'Right! +{n}',
  wrong: 'Wrong crate. It was {s}.',
  caught: 'Good catch! Misdelivered. +{n}',
  notDecoy: 'That one was ours: {s}.',
  decoyMissed: 'Misdelivered! It was for {p}.',
  decoyTitle: 'Misdelivered parcel',
  decoyNote: 'Addressed to {p}. Back on the truck it goes.',
  learn: '{s} · {a}–{b} oz',
  keepsake: 'Limited keepsake',
  toolTitle: 'A little upgrade',
  toolHint: 'Pick one tool for the rest of the shift.',
  toolTake: 'Take it',
  toolMax: 'MAX',
  toolLevel: 'Lv {n}',
  win: 'Oversized parcel opened!',
  lose: 'Shift ended early',
  timeUp: 'Closing time',
  winNote: 'You got through the big one. The evening rush is officially survived.',
  loseNote: 'Three parcels slipped off the belt. The night crew can finish the rest.',
  timeUpNote: 'The doors are closing. The oversized parcel is still on the counter.',
  opened: 'Parcels',
  correctCount: 'Right calls',
  bestCombo: 'Best combo',
  accuracy: 'Accuracy',
  build: 'Your tools',
  grade: 'Shift grade',
  rewardShards: '+{n} shards',
  rewardPrize: 'New keepsake: {e} {name}',
  rewardPractice: 'Practice shift: no shards.',
  rewardPracticeCoins: 'Practice: +{n} coins',
  rewardPracticeNone: 'Practice: no coins left today',
  share: 'Copy result',
  copied: 'Copied! Paste it in your group chat.',
  shareTitle: 'Parcelwood Rush Hour',
  replay: 'Practice again',
  back: 'Back to Station',
  tools: {
    scissors: ['Tape Snips', 'Cuts the tape for you after you pick a crate.'],
    xray: ['Brighter X-ray', 'Sometimes shows the series sticker. More often each level.'],
    scale: ['Precision Scale', 'Always shows the weight.'],
    ear: ['Trained Ear', 'Always shows the shake sound.'],
    tea: ['Hot Tea', 'The belt moves a little slower.'],
    rush: ['Rush Bonus', 'Your combo pays more tips.'],
    helper: ['Old Hand', 'Marks every crate that still fits the clues.'],
    star: ['Star Sticker', 'Every parcel pays more tips.'],
  },
};

const zh: RushText = {
  title: '急件高峰',
  kicker: '包裹镇 · 晚班',
  intro: '晚班货车刚卸下一整堆包裹。趁传送带还没堵住，推理出每件包裹是从哪儿寄来的。',
  steps: ['把邮戳上残留的字母对上货箱', '用摇晃的声音确定是哪一个', '划开胶带；错投的包裹就退回去'],
  pressure: '传送带会越来越快，掉 3 件就提前打烊。判断错了拿不到小费，连击也会断。',
  shiftNo: '第 {n} 班',
  prizeLine: '今天的超大件里装着',
  prizeOwned: '已经收进图鉴了',
  prizeNew: '限定纪念品：拆开超大件就能收下',
  officialNote: '今天第一次上班是正式班：所有人拿到的包裹都一样，评级发放一次碎片。',
  practiceNote: '今天的正式班已完成（{stars} · {score} 小费）。这一班是练习：不发碎片，但还能拿限定纪念品。',
  practiceTag: '练习',
  officialTag: '正式班',
  start: '开始上班',
  exit: '退出',
  pause: '暂停',
  paused: '班次暂停',
  resume: '继续拆件',
  score: '小费',
  combo: '连击',
  hearts: '打烊前还能掉几件',
  time: '距离打烊',
  bossIncoming: '超大件包裹到了！',
  boss: '超大件包裹',
  layer: '第 {n}/{max} 层',
  clues: '箱子上的线索',
  noClues: '先剥开一层，看看有什么线索。',
  smudge: '邮戳糊了：{l}',
  postmark: '邮戳：{p}',
  pickHint: '该放进哪个货箱？',
  ready: '现在划过胶带，把它拆开。',
  cut: '划过胶带',
  peel: '剥开下一层',
  swipe: '点一下，或在胶带上划过去',
  waiting: '等下一件包裹…',
  sendBack: '不是我们的 · 退回',
  correct: '对了！+{n}',
  wrong: '放错了，它是{s}的。',
  caught: '眼尖！是错投件。+{n}',
  notDecoy: '这件是我们的：{s}。',
  decoyMissed: '错投件！它是寄往 {p} 的。',
  decoyTitle: '错投的包裹',
  decoyNote: '收件地址是 {p}，退回货车。',
  learn: '{s} · {a}–{b} oz',
  keepsake: '限定纪念品',
  toolTitle: '顺手添件工具',
  toolHint: '选一件，用到这班结束。',
  toolTake: '收下',
  toolMax: '满级',
  toolLevel: '{n} 级',
  win: '超大件拆开了！',
  lose: '今天提前打烊',
  timeUp: '到打烊时间了',
  winNote: '最大的那件也拆开了。今晚的高峰，算是扛过去了。',
  loseNote: '三件包裹掉下了传送带。剩下的交给夜班吧。',
  timeUpNote: '卷帘门要落了，超大件还摆在柜台上。',
  opened: '包裹',
  correctCount: '判断正确',
  bestCombo: '最高连击',
  accuracy: '正确率',
  build: '这班用的工具',
  grade: '班次评级',
  rewardShards: '+{n} 碎片',
  rewardPrize: '新纪念品：{e} {name}',
  rewardPractice: '练习班：不发碎片。',
  rewardPracticeCoins: '练习班：+{n} 金币',
  rewardPracticeNone: '练习班：今天的金币已经领完。',
  share: '复制成绩',
  copied: '已复制，可以贴到群里了。',
  shareTitle: '包裹镇 急件高峰',
  replay: '再练一班',
  back: '返回小站',
  tools: {
    scissors: ['拆带剪', '选好货箱后，自动帮你划开胶带。'],
    xray: ['更亮的 X 光', '有机会照出系列贴纸，等级越高越常见。'],
    scale: ['精准秤', '总能看见重量。'],
    ear: ['顺风耳', '总能听见摇晃的声音。'],
    tea: ['热茶', '传送带慢一点。'],
    rush: ['高峰津贴', '连击的小费更多。'],
    helper: ['老师傅', '标出所有还符合线索的货箱。'],
    star: ['星星贴纸', '每件包裹的小费都更多。'],
  },
};

const es: RushText = {
  title: 'Hora punta',
  kicker: 'PARCELWOOD · TURNO DE TARDE',
  intro: 'El camión de la tarde dejó una montaña de paquetes. Averigua de dónde viene cada uno antes de que se sature la cinta.',
  steps: ['Relaciona las letras del matasellos con una caja', 'Usa el sonido al agitarlo para decidir', 'Corta la cinta o devuelve los paquetes equivocados'],
  pressure: 'La cinta se acelera. Si se caen tres paquetes, el turno termina. Un error no da propinas y rompe el combo.',
  shiftNo: 'Turno n.º {n}',
  prizeLine: 'El Paquete Gigante de hoy contiene',
  prizeOwned: 'Ya está en tu álbum',
  prizeNew: 'Recuerdo limitado: abre el Paquete Gigante para quedártelo',
  officialNote: 'El primer turno de hoy es el oficial: todos reciben los mismos paquetes y tu nota paga fragmentos una vez.',
  practiceNote: 'El turno oficial de hoy ya terminó ({stars} · {score} propinas). Este es de práctica: sin fragmentos, pero aún puedes ganar el recuerdo.',
  practiceTag: 'Práctica',
  officialTag: 'Oficial',
  start: 'Fichar',
  exit: 'Salir',
  pause: 'Pausa',
  paused: 'Turno en pausa',
  resume: 'Volver al trabajo',
  score: 'Propinas',
  combo: 'Combo',
  hearts: 'Paquetes antes de cerrar',
  time: 'Hasta cerrar',
  bossIncoming: '¡Llegó el Paquete Gigante!',
  boss: 'Paquete Gigante',
  layer: 'Capa {n}/{max}',
  clues: 'Pistas en la caja',
  noClues: 'Pela una capa para encontrar una pista.',
  smudge: 'Matasellos borroso: {l}',
  postmark: 'Matasellos: {p}',
  pickHint: '¿En qué caja va?',
  ready: 'Ahora desliza sobre la cinta para abrirlo.',
  cut: 'Desliza la cinta',
  peel: 'Pela la siguiente capa',
  swipe: 'Toca o desliza sobre la cinta',
  waiting: 'Esperando el siguiente paquete…',
  sendBack: 'No es nuestro · devolver',
  correct: '¡Bien! +{n}',
  wrong: 'Caja equivocada. Era de {s}.',
  caught: '¡Bien visto! Paquete equivocado. +{n}',
  notDecoy: 'Ese era nuestro: {s}.',
  decoyMissed: '¡Paquete equivocado! Iba a {p}.',
  decoyTitle: 'Paquete equivocado',
  decoyNote: 'Dirigido a {p}. De vuelta al camión.',
  learn: '{s} · {a}–{b} oz',
  keepsake: 'Recuerdo limitado',
  toolTitle: 'Una pequeña mejora',
  toolHint: 'Elige una herramienta para el resto del turno.',
  toolTake: 'Tomar',
  toolMax: 'MÁX',
  toolLevel: 'Nv {n}',
  win: '¡Paquete Gigante abierto!',
  lose: 'El turno terminó antes',
  timeUp: 'Hora de cerrar',
  winNote: 'Lograste abrir el más grande. La hora punta queda oficialmente superada.',
  loseNote: 'Tres paquetes se cayeron de la cinta. El turno de noche puede terminar el resto.',
  timeUpNote: 'Las puertas se cierran. El Paquete Gigante sigue en el mostrador.',
  opened: 'Paquetes',
  correctCount: 'Aciertos',
  bestCombo: 'Mejor combo',
  accuracy: 'Precisión',
  build: 'Tus herramientas',
  grade: 'Nota del turno',
  rewardShards: '+{n} fragmentos',
  rewardPrize: 'Nuevo recuerdo: {e} {name}',
  rewardPractice: 'Turno de práctica: sin fragmentos.',
  rewardPracticeCoins: 'Práctica: +{n} monedas',
  rewardPracticeNone: 'Práctica: hoy no quedan monedas.',
  share: 'Copiar resultado',
  copied: '¡Copiado! Pégalo en tu grupo.',
  shareTitle: 'Parcelwood Hora punta',
  replay: 'Practicar otra vez',
  back: 'Volver a la estación',
  tools: {
    scissors: ['Tijeras de cinta', 'Cortan la cinta por ti al elegir la caja.'],
    xray: ['Rayos X más claros', 'A veces muestra la pegatina de la serie. Más a menudo con cada nivel.'],
    scale: ['Báscula precisa', 'Siempre muestra el peso.'],
    ear: ['Oído entrenado', 'Siempre muestra el sonido al agitarlo.'],
    tea: ['Té caliente', 'La cinta va un poco más lenta.'],
    rush: ['Prima de hora punta', 'El combo paga más propinas.'],
    helper: ['Veterano', 'Marca cada caja que aún encaja con las pistas.'],
    star: ['Pegatina estrella', 'Cada paquete paga más propinas.'],
  },
};

const TEXT: Record<string, RushText> = { en, zh, es };

export function rushText(lang: string): RushText {
  return TEXT[lang] || en;
}
