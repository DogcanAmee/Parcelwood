// Text for the Discord build's shop and account page, in the three launch languages.
// Added to UI by installDiscordStrings(), which createDiscordBackend() calls, so this text is only in the
// Discord build (the web and CrazyGames builds never import src/discord/).
import { UI } from '../i18n/strings';

export const DISCORD_UI = {
  en: {
    accDiscordTitle: 'Signed in with Discord', accDiscordAs: 'Playing as {x}',
    accDiscordNote: 'Your progress is saved to your Discord account, so it follows you to any device where you open Parcelwood in Discord.',
    shopNoteDiscord: 'Purchases go through Discord. Extra parcels use the same odds and guarantees as free ones. See the parcel odds before you buy.',
    buyOnDesktop: 'Purchases are not available in the Discord phone app. Open Parcelwood in Discord on a computer or in a browser to buy.',
    owned: 'Owned', buyBusy: 'A purchase is already open.',
    buyGems: '+{n} gems', buyOutfit: 'Station uniform unlocked',
    buyPending: 'Payment received. Your items will arrive shortly.', buyFailed: 'Purchase not completed.', buyUnavailable: 'The shop is not ready yet. Please try again in a moment.',
  },
  zh: {
    accDiscordTitle: '已用 Discord 登录', accDiscordAs: '当前玩家：{x}',
    accDiscordNote: '进度存在你的 Discord 账号里，在任何设备的 Discord 里打开包裹镇都能接着玩。',
    shopNoteDiscord: '通过 Discord 购买。额外包裹和免费包裹用同一套概率和保底。购买前可以先看包裹概率。',
    buyOnDesktop: 'Discord 手机 App 里不能购买。请在电脑或浏览器的 Discord 里打开包裹镇再买。',
    owned: '已拥有', buyBusy: '已经有一笔购买正在进行。',
    buyGems: '+{n} 宝石', buyOutfit: '站长制服已解锁',
    buyPending: '已收到付款，物品马上到账。', buyFailed: '购买没有完成。', buyUnavailable: '商店还没准备好，请稍后再试。',
  },
  es: {
    accDiscordTitle: 'Sesión iniciada con Discord', accDiscordAs: 'Jugando como {x}',
    accDiscordNote: 'Tu progreso se guarda en tu cuenta de Discord, así que te sigue a cualquier dispositivo donde abras Parcelwood en Discord.',
    shopNoteDiscord: 'Las compras se hacen a través de Discord. Los paquetes extra usan las mismas probabilidades y garantías que los gratis. Mira las probabilidades antes de comprar.',
    buyOnDesktop: 'No se puede comprar en la app de Discord para móvil. Abre Parcelwood en Discord en un ordenador o en el navegador para comprar.',
    owned: 'Comprado', buyBusy: 'Ya hay una compra abierta.',
    buyGems: '+{n} gemas', buyOutfit: 'Uniforme de la estación desbloqueado',
    buyPending: 'Pago recibido. Tus artículos llegarán en breve.', buyFailed: 'La compra no se completó.', buyUnavailable: 'La tienda aún no está lista. Inténtalo de nuevo en un momento.',
  },
};

/** Adds the Discord text to UI so t() finds it. Safe to call more than once. */
export function installDiscordStrings() {
  (['en', 'zh', 'es'] as const).forEach(l => Object.assign(UI[l], DISCORD_UI[l]));
}
