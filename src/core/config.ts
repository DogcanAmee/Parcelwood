// Game data: odds, pity, series, items. Copied from the prototype (parcel-station.html, 2026-10-31).
// The shop's odds page reads these numbers directly, so the published odds always match the roll.
import type { GameConfig } from './types';

export const CONFIG: GameConfig = {
  shelfSize: 10,
  odds:     { common: 0.70, rare: 0.22, epic: 0.07, secret: 0.01 },
  demoOdds: { common: 0.40, rare: 0.30, epic: 0.20, secret: 0.10 },
  mysteryOdds: { common: 0.45, rare: 0.35, epic: 0.15, secret: 0.05 },
  pity: { rareEvery: 10, epicEvery: 50, secretSoftStart: 60, secretSoftStep: 0.047, secretHard: 80 },
  mysteryEveryMs: 2 * 60 * 60 * 1000, mysteryMax: 3,
  coinsPerOpen: { common: 5, rare: 12, epic: 30, secret: 80 },
  recycle: { common: 5, rare: 15, epic: 50, secret: 120 },
  exchange: { common: 20, rare: 60, epic: 200, secret: null },
  guessReward: { series: 2, rarity: 3 },
  xrayCost: 40,
  returnReward: 30,
  completeReward: 300,
  // Resident requests: coins and one heart per finished request, plus the item's recycle value + requestBonusShards.
  requestCoins: 40, requestBonusShards: 3, requestsPerDay: 2,
  taleHearts: [1, 3, 6], // hearts needed for each of a resident's three stories
  // Daily mystery parcel: fixed shard reward by the guess that solved it (no item is given).
  dailyTries: 3, dailyReward: [12, 8, 4], dailyFailReward: 2, dailyEpoch: '2026-10-31',
  insuredChance: { common: 0.1, rare: 0.4, epic: 0.7, secret: 0.9 },
  stickerChance: 0.7,
  postmarkClearChance: 0.7,
  series: [
    { id: 'snacks', name: 'Midnight Snack Shop', color: '#e8962a', postmark: 'NIGHT MARKET', shop: 'Corner Snack Bar', items: [
      { id: 'cup-noodles', img: 'items/cup-noodles.webp', name: 'Cup Noodles', e: '🍜', r: 'common', snd: 'rustle', w: [3, 5], note: 'Add hot water. Add patience. Night-shift Nina' },
      { id: 'rice-ball', img: 'items/rice-ball.webp', name: 'Rice Ball', e: '🍙', r: 'common', snd: 'thud', w: [4, 6], note: 'Wrapped it at 2 a.m. Still warm in spirit.' },
      { id: 'soda-can', img: 'items/soda-can.webp', name: 'Soda Can', e: '🥤', r: 'common', snd: 'slosh', w: [12, 13.5], note: "Don't shake it. You already did, didn't you?" },
      { id: 'popcorn', img: 'items/popcorn.webp', name: 'Popcorn Bag', e: '🍿', r: 'common', snd: 'rustle', w: [1.5, 3], note: "For the movie you'll fall asleep during." },
      { id: 'dumplings', img: 'items/dumplings.webp', name: 'Dumpling Box', e: '🥟', r: 'rare', snd: 'thud', w: [8, 10], note: 'Six dumplings. I ate one. Sorry.' },
      { id: 'berry-milk', img: 'items/berry-milk.webp', name: 'Strawberry Milk', e: '🥛', r: 'rare', snd: 'slosh', w: [9, 11], note: 'Pink is a flavor. Fight me.' },
      { id: 'clay-pot', img: 'items/clay-pot.webp', name: 'Steaming Clay Pot', e: '🍲', r: 'epic', snd: 'thud', w: [20, 24], note: "Still steaming after three states. Don't ask how." },
      { id: 'moon-pudding', img: 'items/moon-pudding.webp', name: 'Glowing Moon Pudding', e: '🍮', r: 'secret', snd: 'chime', w: [6, 8], note: 'Only wobbles under a full moon.' },
    ]},
    { id: 'toys', name: 'Retro Toy Box', color: '#23a091', postmark: 'TOY ATTIC', shop: 'Rewind Toy Shop', items: [
      { id: 'paper-plane', img: 'items/paper-plane.webp', name: 'Paper Plane', e: '✈️', r: 'common', snd: 'rustle', w: [0.5, 1.5], note: 'Folded by a seven-year-old engineer.' },
      { id: 'yo-yo', img: 'items/yo-yo.webp', name: 'Yo-yo', e: '🪀', r: 'common', snd: 'clack', w: [2, 3.5], note: 'Walk the dog. Rock the baby. You know the moves.' },
      { id: 'rubber-duck', img: 'items/rubber-duck-v2.webp', name: 'Rubber Duck', e: '🦆', r: 'common', snd: 'squeak', w: [2, 4], note: 'Bath-tested. Captain-approved.' },
      { id: 'windup-frog', img: 'items/windup-frog.webp', name: 'Wind-up Frog', e: '🐸', r: 'common', snd: 'clack', w: [3, 4.5], note: 'Wind twice. Jumps once. Sulks forever.' },
      { id: 'tin-robot', img: 'items/tin-robot.webp', name: 'Tin Robot', e: '🤖', r: 'rare', snd: 'clank', w: [10, 13], note: "Says 'beep' in three languages." },
      { id: 'box-kite', img: 'items/kite.webp', name: 'Kite', e: '🪁', r: 'rare', snd: 'rustle', w: [4, 6], note: 'Waiting for a windy Tuesday.' },
      { id: 'carousel', img: 'items/carousel.webp', name: 'Mini Carousel', e: '🎠', r: 'epic', snd: 'chime', w: [16, 20], note: 'Plays a waltz when nobody is looking.' },
      { id: 'gold-top', img: 'items/gold-top.webp', name: 'Golden Spinning Top', e: '🌀', r: 'secret', snd: 'jingle', w: [5, 7], note: 'It started spinning in 1987 and never stopped.' },
    ]},
    { id: 'souvenirs', name: 'City Souvenirs', color: '#d4507a', postmark: 'OLD TOWN', shop: 'Old Town Gift Shop', items: [
      { id: 'postcard', img: 'items/postcard.webp', name: 'Postcard', e: '💌', r: 'common', snd: 'rustle', w: [0.3, 1], note: 'Wish you were here. You are now, sort of.' },
      { id: 'magnet', img: 'items/magnet.webp', name: 'Fridge Magnet', e: '🧲', r: 'common', snd: 'clack', w: [1, 2], note: 'Holds up one grocery list, forever.' },
      { id: 'keychain', img: 'items/keychain.webp', name: 'Keychain', e: '🔑', r: 'common', snd: 'jingle', w: [1, 2.5], note: 'Opens nothing. Means everything.' },
      { id: 'tote', img: 'items/tote.webp', name: 'Tote Bag', e: '👜', r: 'common', snd: 'rustle', w: [3, 5], note: 'Carries groceries and opinions.' },
      { id: 'snow-globe', img: 'items/snow-globe.webp', name: 'Snow Globe', e: '❄️', r: 'rare', snd: 'slosh', w: [14, 18], note: 'Shake gently. Winter is inside.' },
      { id: 'clock-tower', img: 'items/clock-tower.webp', name: 'Clock Tower Model', e: '🕰️', r: 'rare', snd: 'clank', w: [10, 12], note: 'Runs four minutes slow, like the real one.' },
      { id: 'ferris-wheel', img: 'items/ferris-wheel.webp', name: 'Mini Ferris Wheel', e: '🎡', r: 'epic', snd: 'clank', w: [18, 22], note: 'Tiny riders not included.' },
      { id: 'rain-city', img: 'items/rain-city.webp', name: 'Rainy Little City', e: '🌧️', r: 'secret', snd: 'slosh', w: [12, 15], note: 'It rains here every afternoon at four.' },
    ]},
    { id: 'garden', name: 'Greenhouse Row', color: '#6a9a3a', postmark: 'GREENHOUSE ROW', shop: 'Sprout & Spade', items: [
      { id: 'seed-packet', img: 'items/seed-packet.webp', name: 'Seed Packet', e: '🌱', r: 'common', snd: 'rustle', w: [0.2, 0.8], note: 'Plant after the last frost. Or whenever. Seeds forgive.' },
      { id: 'watering-can', img: 'items/watering-can.webp', name: 'Watering Can', e: '💧', r: 'common', snd: 'slosh', w: [6, 9], note: 'Holds exactly one sunflower’s worth of water.' },
      { id: 'potted-sprout', img: 'items/potted-sprout.webp', name: 'Potted Sprout', e: '🪴', r: 'common', snd: 'thud', w: [5, 7.5], note: 'Two leaves so far. Big plans.' },
      { id: 'garden-gloves', img: 'items/garden-gloves.webp', name: 'Garden Gloves', e: '🧤', r: 'common', snd: 'rustle', w: [1.5, 3], note: 'Muddy on the inside, somehow.' },
      { id: 'tiny-cactus', img: 'items/tiny-cactus.webp', name: 'Tiny Cactus', e: '🌵', r: 'rare', snd: 'thud', w: [9, 12], note: 'Water once a month. Compliment daily.' },
      { id: 'wind-chime', img: 'items/wind-chime.webp', name: 'Wind Chime', e: '🎐', r: 'rare', snd: 'chime', w: [4, 6], note: 'Plays the same three notes as the 31 bus.' },
      { id: 'terrarium', img: 'items/terrarium.webp', name: 'Glass Terrarium', e: '🌿', r: 'epic', snd: 'clank', w: [16, 20], note: 'A whole forest. It rains on Tuesdays.' },
      { id: 'golden-pumpkin', img: 'items/golden-pumpkin.webp', name: 'Golden Pumpkin', e: '🎃', r: 'secret', snd: 'thud', w: [22, 26], note: 'Grew overnight. The scarecrow takes the credit.' },
    ]},
    { id: 'market', name: 'Market Row', color: '#7a5ab0', postmark: 'MARKET ROW', shop: 'Inés & Co. Stall', items: [
      { id: 'market-basket', img: 'items/market-basket.webp', name: 'Market Basket', e: '🧺', r: 'common', snd: 'rustle', w: [1.5, 3], note: 'Woven by Inés’s uncle. He would like it back.' },
      { id: 'honey-jar', img: 'items/honey-jar.webp', name: 'Honey Jar', e: '🍯', r: 'common', snd: 'slosh', w: [5, 7], note: 'From Rosa’s bees. They want a thank-you note.' },
      { id: 'bread-loaf', img: 'items/bread-loaf.webp', name: 'Baguette', e: '🥖', r: 'common', snd: 'thud', w: [3, 4.5], note: 'Not Theo’s. Please do not tell Theo.' },
      { id: 'paper-lantern', img: 'items/paper-lantern.webp', name: 'Paper Lantern', e: '🏮', r: 'common', snd: 'rustle', w: [0.3, 1], note: 'Light it on market night. Blow it out before bed.' },
      { id: 'cheese-wheel', img: 'items/cheese-wheel.webp', name: 'Cheese Wheel', e: '🧀', r: 'rare', snd: 'thud', w: [12, 15], note: 'Aged three years in a cave. Smells like it.' },
      { id: 'coin-purse', img: 'items/coin-purse.webp', name: 'Coin Purse', e: '👛', r: 'rare', snd: 'jingle', w: [1, 2], note: 'Full of buttons. Nobody knows why.' },
      { id: 'brass-scale', img: 'items/brass-scale.webp', name: 'Brass Market Scale', e: '⚖️', r: 'epic', snd: 'clank', w: [19, 23], note: 'Honest to the last gram. Inés insists.' },
      { id: 'market-bell', img: 'items/market-bell.webp', name: 'Golden Stall Bell', e: '🛎️', r: 'secret', snd: 'chime', w: [7, 9], note: 'Ring once and every stall on the row opens.' },
    ]},
    { id: 'lost-letter-office', name: 'Lost Letter Office', color: '#2456c4', postmark: 'DEAD LETTER', shop: 'Dead Letter Depot', items: [
      { id: 'tied-parcel', img: 'items/tied-parcel.webp', name: 'Tied Parcel', e: '🎀', r: 'common', snd: 'rustle', w: [2, 4], note: 'No tag, no name. It asked for Parcelwood, so here it stays.' },
      { id: 'sealed-letter', img: 'items/sealed-letter.webp', name: 'Sealed Letter', e: '✉️', r: 'common', snd: 'rustle', w: [0.5, 1.5], note: "The glue held for forty years. Whatever's inside is patient." },
      { id: 'wax-stamp', img: 'items/wax-stamp.webp', name: 'Wax Stamp', e: '🖋', r: 'common', snd: 'clack', w: [1.5, 3], note: 'Every letter in the pile wears the same pressed crest.' },
      { id: 'postal-key', img: 'items/postal-key.webp', name: 'Postal Key', e: '🗝️', r: 'common', snd: 'jingle', w: [2, 3.5], note: 'Opens drawer 13. Nobody remembers what drawer 13 is.' },
      { id: 'return-to-sender-tag', img: 'items/return-to-sender-tag.webp', name: 'Return-to-Sender Tag', e: '🪧', r: 'rare', snd: 'rustle', w: [0.5, 1], note: 'It circled the country six times. The tag gave up counting.' },
      { id: 'mail-pouch', img: 'items/mail-pouch.webp', name: 'Mail Pouch', e: '👝', r: 'rare', snd: 'rustle', w: [8, 11], note: 'Soft from a thousand sorting rooms. Still smells of trains.' },
      { id: 'pocket-watch', img: 'items/pocket-watch.webp', name: 'Pocket Watch', e: '⌚', r: 'epic', snd: 'clank', w: [6, 8], note: 'Stopped at 4:12, the hour the sorting train never arrived.' },
      { id: 'paper-crane', img: 'items/paper-crane.webp', name: 'Paper Crane', e: '🕊️', r: 'secret', snd: 'rustle', w: [0.2, 0.6], note: 'No address was written on it. It found Parcelwood anyway.' },
    ]},
  ],
  startUnlocked: ['snacks', 'toys'],
  residents: [
    { id: 'okafor', lv: 1, like: 'slosh', name: 'Mrs. Okafor at No. 12', story: 'She hugs the box. "My grandson mailed this from college. He spelled our street wrong again."', tales: ["She shows you a photo of her grandson in a graduation cap. \"Two more years. Then he learns our street name.\"", "She writes her jollof recipe on the back of a delivery slip. \"Don't tell Theo. He'll put it in bread.\"", "Her grandson visits and hands you a postcard. The address is spelled right, just this once."] },
    { id: 'theo', lv: 1, like: 'thud', name: 'Theo, the night baker', story: 'Theo trades you a warm roll for it. "I ordered this in July. July!"', tales: ["Theo bakes at 3 a.m. because the oven hums the same note as his dad's old radio.", "He names a roll after you. It's a little lopsided. \"Like a real station master,\" he says.", "The July order finally turns up: a sourdough starter from his sister, still alive."] },
    { id: 'lena', lv: 4, like: 'clank', name: 'Lena from the bike shop', story: 'Lena grins. "Spare bell! Now my bike can say hello twice."', tales: ["Every morning Lena rings both bells at you. Once for hello, once for nice parcel.", "She fixes your squeaky delivery cart for free. \"Professional courtesy. We both move things.\"", "Lena is training for the coastal race. The whole street paints a finish line for her."] },
    { id: 'dube', lv: 2, like: 'rustle', name: 'Mr. Dube, retired mail carrier', story: 'He inspects your handwriting on the slip and nods. "Good routing. You will do fine here."', tales: ["Mr. Dube walked the same route for 31 years. He still waves at mailboxes.", "He shows you an old town map with every misdelivery he ever fixed marked in red ink.", "He pins his old route badge on your jacket. \"Yours now. Wear it on rainy days.\""] },
    { id: 'twins', lv: 5, like: 'clack', name: 'The twins at the laundromat', story: 'They argue over whose name is on it, then open it together.', tales: ["The twins finish each other's sentences, mostly to win arguments.", "They run a lost-and-found for single socks. Nobody has ever claimed one.", "They fold you a paper crown. One side says Station Master. The other says also ours."] },
    { id: 'rosa', lv: 6, like: 'chime', name: 'Rosa from the greenhouse', story: 'Rosa holds the box up to the light. "Seeds from my sister in the hills. She always sends them a season late."', tales: ["Rosa talks to her tomatoes every morning. She says they talk back, just slower.", "She gives you a cutting from her oldest geranium. \"It came over with my grandmother. Now it's a station plant.\"", "Her sister finally visits, on time for once, carrying a pumpkin bigger than both of them."] },
    { id: 'ines', lv: 7, like: 'jingle', name: 'Inés from the market stall', story: 'Inés shakes the box and laughs. "My change tin! I mailed it to myself by mistake. Twice."', tales: ["Inés knows the price of everything on Market Row, and the story behind most of it.", "She saves you the last ripe pear every Friday. \"Couriers need fruit. It is a rule. I made it.\"", "On market night Inés rings the golden bell and the whole row lights its lanterns at once."] },
  ],
  // Town levels: reputation needed for Lv1..Lv8, and the level at which each feature and series opens.
  townLevels: [0, 30, 80, 160, 280, 450, 650, 900],
  townFeatures: { requests: 2, urgent: 3, events: 3, rush: 2, anon: 5 },
  // Station Week opens at Lv4 on every build. It can be played any day; only the weekend pays event rewards.
  weekLevel: 4,
  // Weekend event: each tier pays once per calendar week (Friday 00:00 to Sunday 24:00, local time).
  weekEvent: { coinsFinish: 30, coinsWin: 30, shardsWin: 10, shardsThree: 20 },
  // Rush Hour practice: later shifts that day pay coins per star, a limited number of times.
  rushPractice: { coinsPerStar: 5, paidPerDay: 3 },
  seriesLevels: { souvenirs: 5, garden: 6, market: 7, 'lost-letter-office': 8 },
  rep: { open: 1, guess: 1, ret: 5, anon: 8, anonMiss: 5, request: 6, gift: 2, giftFav: 4, daily: 4, dailyLost: 2, urgent: 6, complete: 20, rush: 5 },
  urgentMs: 4 * 60 * 60 * 1000, urgentBonus: 25,
  anonBonus: 20, anonChance: 0.4, anonChancePowercut: 0.7,
  movingBonus: 10,
  perkHearts: 3, theoCoins: 15, lenaMysteryMs: 90 * 60 * 1000,
  // Town board: three notes a day. Each pays coins + reputation when claimed; all three add a stamp, shards and reputation.
  board: { tasks: 3, coins: 20, rep: 3, bonusShards: 15, bonusRep: 5 },
  // Daily tasks: three fixed goals, the same for every player every day.
  quests: { coins: 25, rep: 2, bonusShards: 20, bonusLost: 1, guessNeed: 2 },
  // Check-in card: one stamp a day, never reset by a missed day. Five stamps pay a big delivery.
  checkin: { card: 5, coins: 10, bigParcels: 5, bigShards: 50 },
  // Correct series guesses in a row: bonus = min(step × (n − 1), cap). A wrong guess resets it.
  streak: { step: 4, cap: 20, milestones: [3, 5, 10], every: 5 },
  // Decoration shop: display pieces at fixed spots on the station front, coins only.
  // item is an album item id, so the picture and translated name come from ITEMS; img is the piece's own picture
  // and the name comes from UI.decorNames.
  decor: { foundOff: 0.2, items: [
    { id: 'lantern', item: 'paper-lantern', slot: 'awn-l', lv: 1, price: 120 },
    { id: 'sprout', item: 'potted-sprout', slot: 'front-1', lv: 1, price: 120 },
    { id: 'kite', item: 'box-kite', slot: 'sky', lv: 1, price: 200 },
    { id: 'chime', item: 'wind-chime', slot: 'awn-r', lv: 2, price: 200 },
    { id: 'cactus', item: 'tiny-cactus', slot: 'front-5', lv: 2, price: 250 },
    { id: 'clock', item: 'clock-tower', slot: 'hill-r', lv: 3, price: 350 },
    { id: 'globe', item: 'snow-globe', slot: 'front-4', lv: 3, price: 350 },
    { id: 'terrarium', item: 'terrarium', slot: 'front-2', lv: 4, price: 500 },
    { id: 'carousel', item: 'carousel', slot: 'front-3', lv: 4, price: 600 },
    { id: 'ferris', item: 'ferris-wheel', slot: 'hill-l', lv: 5, price: 800 },
    { id: 'scale', img: 'items/decor-scale.webp', slot: 'front-2b', lv: 5, price: 450 },
    { id: 'garland', img: 'items/decor-garland.webp', slot: 'sign-top', lv: 6, price: 600 },
    { id: 'horn', img: 'items/decor-horn.webp', slot: 'wall-r', lv: 8, price: 900 },
    { id: 'trolley', img: 'items/decor-trolley.webp', slot: 'front-3b', lv: 8, price: 1000 },
  ] },
  // This week's story: chapter 1 at once, one more per two finished letters; the last pays shards and reputation.
  story: { chapters: 5, pagesPerChapter: 2, shards: 30, rep: 10 },
  // Discord social: shards for each side of a carried parcel; a server's weekly letter goals and the shards per goal.
  social: { carryShards: 15, guildGoals: [20, 60, 150], guildShards: 20 },
};
