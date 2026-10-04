/* Jasper's Meal Tracker — Firebase-backed family app.
   Plain HTML/CSS/JS, no build step. Firebase modular SDK via importmap. */

import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, arrayUnion, collection, addDoc,
  getDocs, query, orderBy, serverTimestamp, onSnapshot, runTransaction
} from 'firebase/firestore';

/* ---- Firebase config (public web config; security lives in Firestore rules) ---- */
const firebaseConfig = { apiKey: "AIzaSyBLgnPW5pu7vOLOcVro3zJLcZsGaQDbQtM", authDomain: "jasper-tracker-c0233.firebaseapp.com", projectId: "jasper-tracker-c0233", storageBucket: "jasper-tracker-c0233.firebasestorage.app", messagingSenderId: "318105460252", appId: "1:318105460252:web:e3d6ac6825aa1da70ac9d9" };

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

/* ============================================================
   MASTER DATA — pools, anchored dinners, shopping sections.
   No peanut butter anywhere. Tags drive shuffle weighting:
   'egg' and 'fruit' = Jasper's stated favorites (weighted heaviest).
   ============================================================ */

const MASTER_POOLS = {
  weekdayBreakfasts: {
    title: 'Weekday quick breakfasts',
    note: 'Pick one each weekday, before 7:30 meds. Under 10 minutes.',
    size: 5,
    items: [
      { id: 'cheerios', label: 'Cheerios + whole milk + banana + honey drizzle', tags: ['fruit'], shop: ['cheerios', 'milk', 'bananas', 'honey'] },
      { id: 'frozen-waffles', label: 'Frozen waffles (2-3) + butter + maple syrup', tags: [], shop: ['frozen-waffles', 'butter', 'maple-syrup'] },
      { id: 'oatmeal', label: 'Instant oatmeal made with whole milk + butter + brown sugar', tags: [], shop: ['instant-oatmeal', 'milk', 'butter', 'brown-sugar'] },
      { id: 'scrambled-eggs', label: 'Scrambled eggs with cheese + buttered toast', tags: ['egg'], shop: ['eggs', 'sliced-cheese', 'bread', 'butter'] },
      { id: 'cream-of-wheat', label: 'Cream of wheat made with whole milk + butter + honey', tags: [], shop: ['cream-of-wheat', 'milk', 'butter', 'honey'] },
      { id: 'yogurt-granola', label: 'Stonyfield vanilla whole-milk yogurt + vanilla granola + berries', tags: ['fruit'], shop: ['yogurt', 'vanilla-granola', 'blueberries', 'strawberries'] },
      { id: 'mini-pancakes', label: 'Frozen mini pancakes + butter + syrup', tags: [], shop: ['mini-pancakes', 'butter', 'maple-syrup'] },
    ]
  },
  weekendBreakfasts: {
    title: 'Weekend big breakfasts',
    note: 'Go big — the full pre-meds window (meds ~8:30 weekends).',
    size: 3,
    items: [
      { id: 'we-pancakes-eggs', label: 'Mini pancakes + butter + syrup, scrambled eggs with cheese, whole milk', tags: ['egg'], shop: ['mini-pancakes', 'butter', 'maple-syrup', 'eggs', 'sliced-cheese', 'milk'] },
      { id: 'we-omelet-waffles', label: 'Cheese omelet + waffles + butter + syrup + whole milk', tags: ['egg'], shop: ['eggs', 'sliced-cheese', 'frozen-waffles', 'butter', 'maple-syrup', 'milk'] },
      { id: 'we-waffles-parfait', label: 'Waffles + eggs + yogurt-granola-berry parfait', tags: ['egg', 'fruit'], shop: ['frozen-waffles', 'eggs', 'yogurt', 'vanilla-granola', 'blueberries', 'strawberries'] },
      { id: 'we-big-oatmeal', label: 'Big oatmeal (whole milk, butter, brown sugar) + cheesy eggs + toast', tags: ['egg'], shop: ['instant-oatmeal', 'milk', 'butter', 'brown-sugar', 'eggs', 'sliced-cheese', 'bread'] },
    ]
  },
  schoolSnacks: {
    title: 'School packed snacks',
    note: 'Basic only — he eats the school lunch.',
    size: 3,
    items: [
      { id: 'ss-cheese-goldfish', label: 'String cheese + Goldfish', tags: [], shop: ['string-cheese', 'goldfish'] },
      { id: 'ss-salami-prov', label: 'Salami + provolone pack (Costco)', tags: [], shop: ['salami-provolone'] },
      { id: 'ss-ritz-cheese', label: 'Ritz crackers + string cheese', tags: [], shop: ['ritz', 'string-cheese'] },
      { id: 'ss-bites', label: 'Small pack of oatmeal choc-chip bites', tags: [], shop: ['oatmeal-bites'] },
    ]
  },
  grazing: {
    title: 'After-school grazing',
    note: 'Meds still active — graze-able, no big plates.',
    size: 5,
    items: [
      { id: 'gr-choc-hummus-pretzel', label: 'Chocolate hummus + pretzels', tags: [], shop: ['choc-hummus', 'pretzels'] },
      { id: 'gr-choc-hummus-graham', label: 'Chocolate hummus + graham crackers', tags: [], shop: ['choc-hummus', 'graham-crackers'] },
      { id: 'gr-ritz-almonds', label: 'Ritz + roasted almonds & M&Ms', tags: [], shop: ['ritz', 'roasted-almonds', 'mms'] },
      { id: 'gr-bites-cheese', label: 'Oatmeal choc-chip bites (Costco) + string cheese', tags: [], shop: ['oatmeal-bites', 'string-cheese'] },
      { id: 'gr-fruitbowl-yogurt', label: 'Berry fruit bowl + Stonyfield vanilla yogurt', tags: ['fruit'], shop: ['blueberries', 'strawberries', 'raspberries', 'yogurt'] },
      { id: 'gr-salami-ritz', label: 'Salami + provolone + Ritz', tags: [], shop: ['salami-provolone', 'ritz'] },
      { id: 'gr-frozen-grapes', label: 'Frozen grapes + string cheese', tags: ['fruit'], shop: ['grapes', 'string-cheese'] },
      { id: 'gr-veggies', label: 'Baby carrots / pepper sticks + cucumbers (light side — pair with something denser)', tags: [], shop: ['baby-carrots', 'pepper-sticks', 'cucumbers'] },
    ]
  },
  dinners: {
    title: 'Dinners (Tue / Wed / Thu / Sat / Sun)',
    note: 'Meds wearing off — serve the heaviest thing he\u2019ll eat. No repeats back-to-back.',
    size: 6,
    items: [
      { id: 'd-spaghetti', label: 'Plain spaghetti with butter — he likes it plain, no cheese', tags: [], shop: ['spaghetti', 'butter'] },
      { id: 'd-chicken-corn', label: 'Grilled or air-fried chicken breast + buttered frozen corn + cucumbers', tags: ['chicken'], shop: ['chicken-breasts', 'frozen-corn', 'butter', 'cucumbers'] },
      { id: 'd-hotdogs', label: '2 hot dogs in buns + buttered corn', tags: [], shop: ['hot-dogs', 'buns', 'frozen-corn', 'butter'] },
      { id: 'd-breakfast-dinner', label: 'Cheesy scrambled eggs or omelet + buttered toast + tomato slices (breakfast-for-dinner)', tags: ['egg'], shop: ['eggs', 'sliced-cheese', 'bread', 'butter', 'tomatoes'] },
      { id: 'd-annies', label: "Annie's mac & cheese (Costco box, extra butter + whole milk)", tags: [], shop: ['annies-mac', 'butter', 'milk'] },
      { id: 'd-turkey-sandwich', label: 'Toasted turkey sandwich (extra mayo + cheese) + corn + tomato slices', tags: [], shop: ['sliced-turkey', 'bread', 'mayo', 'sliced-cheese', 'frozen-corn', 'tomatoes'] },
      { id: 'd-salmon', label: 'Salmon with maple syrup glaze + buttery rice (occasional — he eats chicken more reliably)', tags: [], shop: ['salmon', 'maple-syrup', 'butter'], occasional: true },
      { id: 'd-costco-pizza', label: 'Costco food-court cheese pizza (occasional — e.g. Costco trip weeks)', tags: [], shop: [], occasional: true },
    ]
  },
  eveningSnacks: {
    title: 'Evening snacks',
    note: 'Most nights, after dinner.',
    size: 3,
    items: [
      { id: 'ev-graham-milk', label: 'Graham crackers + whole milk', tags: [], shop: ['graham-crackers', 'milk'] },
      { id: 'ev-smoothie', label: 'Smoothie: whole milk + banana + cocoa + honey + oats (~500–700 cal)', tags: ['fruit'], shop: ['milk', 'bananas', 'cocoa', 'honey', 'oats'] },
      { id: 'ev-yogurt-parfait', label: 'Stonyfield vanilla yogurt + vanilla granola + berries', tags: ['fruit'], shop: ['yogurt', 'vanilla-granola', 'blueberries', 'strawberries'] },
      { id: 'ev-frozen-grapes', label: 'Frozen grapes', tags: ['fruit'], shop: ['grapes'] },
    ]
  }
};

/* Anchored dinners are FIXED — never shuffled, never swapped. */
const ANCHORED = [
  { id: 'anchored-wholefoods', label: 'Monday (or Wed if the outing shifts): dinner OUT at Whole Foods after extracurricular — chicken tenders', shop: [] },
  { id: 'anchored-nuggets', label: 'Friday: chicken nuggets + buttered corn — treat night, nuggets live here only', tags: ['nugget'], shop: ['nuggets', 'frozen-corn', 'butter'] },
];

/* Shopping sections. qty shown in parentheses. */
const SHOP_SECTIONS = [
  { name: 'Produce', items: [
    { id: 'bananas', label: 'Bananas', qty: '1 bunch' },
    { id: 'grapes', label: 'Grapes', qty: '1 bag' },
    { id: 'cucumbers', label: 'Cucumbers', qty: '3' },
    { id: 'tomatoes', label: 'Tomatoes', qty: '4' },
    { id: 'apples', label: 'Apples', qty: '4' },
    { id: 'pears', label: 'Pears', qty: '3' },
    { id: 'blueberries', label: 'Blueberries', qty: '1 pint' },
    { id: 'strawberries', label: 'Strawberries', qty: '1 box' },
    { id: 'raspberries', label: 'Raspberries', qty: '1 box' },
    { id: 'baby-carrots', label: 'Baby carrots', qty: '1 bag' },
    { id: 'pepper-sticks', label: 'Pepper sticks', qty: '1 pack' },
  ]},
  { name: 'Dairy', items: [
    { id: 'milk', label: 'Whole milk', qty: 'gallon+' },
    { id: 'butter', label: 'Butter', qty: '1 lb' },
    { id: 'yogurt', label: 'Stonyfield vanilla whole-milk yogurt', qty: '1 tub' },
    { id: 'string-cheese', label: 'String cheese', qty: '1 pack' },
    { id: 'sliced-cheese', label: 'Sliced cheese', qty: '1 pack' },
    { id: 'eggs', label: 'Eggs', qty: '1 dozen' },
  ]},
  { name: 'Meat & Seafood', items: [
    { id: 'nuggets', label: 'Frozen chicken nuggets', qty: '1 bag' },
    { id: 'hot-dogs', label: 'Hot dogs', qty: '1 pack' },
    { id: 'chicken-breasts', label: 'Chicken breasts', qty: '4' },
    { id: 'salami-provolone', label: 'Salami + provolone packs (Costco)', qty: '1 pack' },
    { id: 'salmon', label: 'Salmon fillets', qty: 'optional' },
    { id: 'sliced-turkey', label: 'Sliced turkey', qty: '1 pack' },
  ]},
  { name: 'Bakery/Bread', items: [
    { id: 'bread', label: 'Bread', qty: '1 loaf' },
    { id: 'buns', label: 'Hot dog buns', qty: '1 pack' },
  ]},
  { name: 'Pantry', items: [
    { id: 'cheerios', label: 'Cheerios', qty: '1 box' },
    { id: 'spaghetti', label: 'Spaghetti', qty: '1 box' },
    { id: 'annies-mac', label: "Annie's mac and cheese (Costco)", qty: '1 box' },
    { id: 'frozen-waffles', label: 'Frozen waffles', qty: '1 box' },
    { id: 'mini-pancakes', label: 'Frozen mini pancakes', qty: '1 box' },
    { id: 'instant-oatmeal', label: 'Instant oatmeal packets', qty: '1 box' },
    { id: 'cream-of-wheat', label: 'Cream of wheat', qty: '1 box' },
    { id: 'vanilla-granola', label: 'Vanilla granola', qty: '1 bag' },
    { id: 'ritz', label: 'Ritz crackers', qty: '1 box' },
    { id: 'goldfish', label: 'Goldfish', qty: '1 box' },
    { id: 'pretzels', label: 'Pretzels', qty: '1 bag' },
    { id: 'graham-crackers', label: 'Graham crackers', qty: '1 box' },
    { id: 'choc-hummus', label: 'Chocolate hummus', qty: '1 tub' },
    { id: 'oatmeal-bites', label: 'Oatmeal choc-chip bites (Costco)', qty: '1 pack' },
    { id: 'roasted-almonds', label: 'Roasted almonds', qty: '1 bag' },
    { id: 'mms', label: 'M&Ms', qty: '1 bag' },
    { id: 'cocoa', label: 'Cocoa powder', qty: '' },
    { id: 'honey', label: 'Honey', qty: '' },
    { id: 'maple-syrup', label: 'Maple syrup', qty: '' },
    { id: 'brown-sugar', label: 'Brown sugar', qty: '' },
    { id: 'oats', label: 'Oats', qty: '' },
    { id: 'mayo', label: 'Mayo', qty: '' },
  ]},
  { name: 'Frozen', items: [
    { id: 'frozen-corn', label: 'Corn', qty: '1 bag' },
    { id: 'grapes-frozen', label: 'Grapes (for freezing)', qty: '1 bag' },
  ]},
];

/* Quick lookup: shop item id -> {section, label, qty} */
const SHOP_INDEX = {};
for (const sec of SHOP_SECTIONS) {
  for (const it of sec.items) SHOP_INDEX[it.id] = { ...it, section: sec.name };
}
/* Map pool-item shop ids that don't exist 1:1 in SHOP_INDEX (aliases). */
const SHOP_ALIASES = { grapes: 'grapes' }; // frozen grapes reuse grapes entry

function shopEntry(id) {
  const key = SHOP_ALIASES[id] || id;
  return SHOP_INDEX[key] || null;
}

/* Today's-meal slots. Pool chosen by weekday/weekend; dinner pool always. */
const SLOTS = [
  { key: 'breakfast', name: 'Breakfast', pool: (d) => (d === 0 || d === 6 ? 'weekendBreakfasts' : 'weekdayBreakfasts'), show: () => true },
  { key: 'schoolSnack', name: 'School snack', pool: () => 'schoolSnacks', show: (d) => d >= 1 && d <= 5 },
  { key: 'afterSchool', name: (d) => (d === 0 || d === 6 ? 'Afternoon snack' : 'After-school snack'), pool: () => 'grazing', show: () => true },
  { key: 'dinner', name: 'Dinner', pool: () => 'dinners', show: () => true },
  { key: 'evening', name: 'Evening snack', pool: () => 'eveningSnacks', show: () => true },
];

/* ============================================================
   PART 2 — state, auth, rendering, shuffle, shop, check-ins, weigh-ins
   ============================================================ */

/* ---------- tiny helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function todayKey(d) {
  d = d || new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function weekId(d) {
  d = d || new Date();
  // ISO week id like 2026-W41
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function prettyDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/* ---------- local state ---------- */
const S = {
  user: null,
  pools: null,        // { poolKey: [itemIds] } — current week's pools
  shopped: {},        // { shopItemId: true }
  customItems: [],    // [{id, label, section}]
  history: { weeks: [] },
  checkin: null,      // today's checkin doc
  weighins: [],
  saveTimer: null,
};

const stateDocRef = () => doc(db, 'state', 'current');
const historyDocRef = () => doc(db, 'history', 'weeks');
const checkinDocRef = (key) => doc(db, 'checkins', key || todayKey());

/* ---------- live sync: both family members see each other's changes in real time ----------
   Granular field-path writes (below) mean two people editing different items never
   clobber each other; these listeners pull remote changes in. hasPendingWrites skips
   echoes of our own writes. */
function attachLiveListeners() {
  if (S.unsubState) S.unsubState();
  S.unsubState = onSnapshot(stateDocRef(), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites || S.saveTimer || S.shuffling) return;
    const d = snap.data();
    let changed = false;
    if (d.pools && JSON.stringify(d.pools) !== JSON.stringify(S.pools)) { S.pools = d.pools; changed = true; }
    if (d.shopped && JSON.stringify(d.shopped) !== JSON.stringify(S.shopped)) { S.shopped = d.shopped; changed = true; }
    if (d.customItems && JSON.stringify(d.customItems) !== JSON.stringify(S.customItems)) { S.customItems = d.customItems; changed = true; }
    if (changed) { renderPools(); renderShop(); renderToday(); }
  }, handleDbError);

  if (S.unsubCheckin) S.unsubCheckin();
  S.unsubCheckin = onSnapshot(checkinDocRef(), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    S.checkin = { picks: d.picks || {}, checked: d.checked || {} };
    renderToday();
  }, handleDbError);
}

function scheduleSave() {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(saveState, 600);
}

async function saveState() {
  try {
    await setDoc(stateDocRef(), {
      weekId: weekId(),
      pools: S.pools,
      shopped: S.shopped,
      customItems: S.customItems,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    handleDbError(e);
  }
}

function handleDbError(e) {
  if (e && e.code === 'permission-denied') {
    // Signed in, but not on the family allow-list.
    $('#app').hidden = true;
    $('#login-screen').hidden = true;
    $('#denied-screen').hidden = false;
  } else {
    console.error(e);
    toast('Something went wrong saving. Check your connection.');
  }
}

/* ---------- auth gate ---------- */
$('#google-signin').addEventListener('click', async () => {
  $('#login-error').hidden = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    console.error(e);
    const msg = $('#login-error');
    msg.textContent = 'Sign-in didn\u2019t complete. Please try again.';
    msg.hidden = false;
  }
});
$('#signout').addEventListener('click', () => signOut(auth));
$('#denied-signout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    S.user = null;
    $('#login-screen').hidden = false;
    $('#denied-screen').hidden = true;
    $('#app').hidden = true;
    return;
  }
  S.user = user;
  $('#login-screen').hidden = true;
  $('#user-line').textContent = user.email || '';
  try {
    await boot();
    $('#app').hidden = false;
  } catch (e) {
    handleDbError(e);
  }
});

async function boot() {
  // Load (or seed) the shared state doc. Permission-denied here means
  // the signed-in account isn't on the family allow-list.
  const snap = await getDoc(stateDocRef());
  if (snap.exists()) {
    const d = snap.data();
    S.pools = d.pools || defaultPools();
    S.shopped = d.shopped || {};
    S.customItems = d.customItems || [];
  } else {
    S.pools = defaultPools();
    S.shopped = {};
    S.customItems = [];
    await saveState();
  }
  const hsnap = await getDoc(historyDocRef());
  S.history = hsnap.exists() ? hsnap.data() : { weeks: [] };
  await loadCheckin();
  await loadWeighins();
  attachLiveListeners();
  renderAll();
  switchTab('today');
}

/* ---------- default pools (first N of each master list) ---------- */
function defaultPools() {
  const out = {};
  for (const [key, pool] of Object.entries(MASTER_POOLS)) {
    out[key] = pool.items.slice(0, pool.size).map(i => i.id);
  }
  return out;
}

function poolItem(poolKey, id) {
  return MASTER_POOLS[poolKey].items.find(i => i.id === id);
}

/* ============================================================
   SHUFFLE — regenerates pool contents with weighting + history
   ============================================================ */
function weightedPick(candidates, count, avoidSet) {
  // candidates: [{id, weight}]. Pick `count` unique ids, no replacement.
  const picked = [];
  const bag = candidates.slice();
  while (picked.length < count && bag.length) {
    let total = 0;
    for (const c of bag) total += c.weight;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < bag.length; idx++) {
      r -= bag[idx].weight;
      if (r <= 0) break;
    }
    idx = Math.min(idx, bag.length - 1);
    picked.push(bag[idx].id);
    bag.splice(idx, 1);
  }
  return picked;
}

function computeShuffledPools(lastWeek) {
  const avoidDinners = new Set((lastWeek && lastWeek.dinners) || []);
  const avoidSnacks = new Set((lastWeek && lastWeek.snacks) || []);
  const newPools = {};

  for (const [key, pool] of Object.entries(MASTER_POOLS)) {
    const avoid = key === 'dinners' ? avoidDinners
      : (key === 'grazing' || key === 'eveningSnacks' || key === 'schoolSnacks') ? avoidSnacks
      : new Set();
    const candidates = pool.items.map(item => {
      let w = 1;
      // Jasper's stated favorites weighted heaviest.
      if (item.tags.includes('egg') || item.tags.includes('fruit')) w = 3;
      if (item.tags.includes('chicken')) w = 2;
      if (item.occasional) w = 0.4;           // salmon / Costco pizza stay rare
      if (avoid.has(item.id)) w *= 0.2;        // history-aware: discourage repeats
      return { id: item.id, weight: w };
    });
    let picked = weightedPick(candidates, pool.size, avoid);
    // Hard rule: no identical back-to-back dinners.
    if (key === 'dinners') {
      for (let i = 1; i < picked.length; i++) {
        if (picked[i] === picked[i - 1]) {
          const alt = candidates.find(c => c.id !== picked[i]);
          if (alt) picked[i] = alt.id;
        }
      }
    }
    newPools[key] = picked;
  }
  return newPools;
}

async function shufflePools() {
  // Transaction: if both family members hit Shuffle at the same moment, one
  // retries against the other's committed history — no duplicate weeks, no lost writes.
  S.shuffling = true;
  try {
    const result = await runTransaction(db, async (tx) => {
      const hSnap = await tx.get(historyDocRef());
      const sSnap = await tx.get(stateDocRef());
      const history = hSnap.exists() ? hSnap.data() : { weeks: [] };
      const lastWeek = (history.weeks && history.weeks[0]) || { dinners: [], snacks: [] };
      const newPools = computeShuffledPools(lastWeek);
      const prevPools = sSnap.exists() ? (sSnap.data().pools || {}) : {};
      const prevDinners = (prevPools.dinners || []).slice();
      const prevSnacks = [...(prevPools.grazing || []), ...(prevPools.eveningSnacks || [])];
      history.weeks = history.weeks || [];
      history.weeks.unshift({ weekId: weekId(), dinners: prevDinners, snacks: prevSnacks });
      history.weeks = history.weeks.slice(0, 12); // keep last 12 weeks
      tx.set(historyDocRef(), history);
      tx.set(stateDocRef(), { pools: newPools, weekId: weekId(), updatedAt: serverTimestamp() }, { merge: true });
      return { pools: newPools, history };
    });
    S.pools = result.pools;
    S.history = result.history;
    rebuildShopFromPools();
  } finally {
    S.shuffling = false;
  }
}

/* ============================================================
   SHOP — checklist derived from current pools
   ============================================================ */
function shopIdsForPools() {
  const ids = new Set();
  const addItem = (poolKey, itemId) => {
    const item = poolItem(poolKey, itemId);
    if (item && item.shop) for (const sid of item.shop) ids.add(sid);
  };
  for (const [key, list] of Object.entries(S.pools || {})) {
    for (const id of list) addItem(key, id);
  }
  for (const a of ANCHORED) {
    if (a.shop) for (const sid of a.shop) ids.add(sid);
  }
  return ids;
}

function rebuildShopFromPools() {
  // Keep checked state only for items still needed; drop the rest.
  // Single-field write: shuffle/swap already serialize pool changes, so this can't race them.
  const needed = shopIdsForPools();
  const kept = {};
  for (const id of needed) if (S.shopped[id]) kept[id] = true;
  S.shopped = kept;
  updateDoc(stateDocRef(), { shopped: kept }).catch(handleDbError);
}

function allShopRows() {
  // Returns [{section, id, label, qty, custom}] for needed master items + customs.
  const needed = shopIdsForPools();
  const rows = [];
  for (const sec of SHOP_SECTIONS) {
    for (const it of sec.items) {
      if (needed.has(it.id)) rows.push({ section: sec.name, id: it.id, label: it.label, qty: it.qty, custom: false });
    }
  }
  for (const c of S.customItems) rows.push({ section: c.section || 'Added', id: c.id, label: c.label, qty: '', custom: true });
  return rows;
}

function shopProgress() {
  const rows = allShopRows().filter(r => !r.custom || true);
  const total = rows.length;
  const done = rows.filter(r => S.shopped[r.id]).length;
  return { total, done };
}

function copyShopList() {
  const rows = allShopRows();
  let out = `Jasper's shopping list (${todayKey()})\n`;
  let lastSection = '';
  for (const r of rows) {
    if (r.section !== lastSection) { out += `\n${r.section.toUpperCase()}\n`; lastSection = r.section; }
    const mark = S.shopped[r.id] ? '[x]' : '[ ]';
    out += `${mark} ${r.label}${r.qty ? ` (${r.qty})` : ''}\n`;
  }
  const done = (text) => toast(text);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(() => done('Shopping list copied!'), () => done('Copy failed — long-press to select.'));
  } else {
    done('Copy not supported here — long-press to select.');
  }
}

/* ============================================================
   CHECK-INS — today's picks + check-offs
   ============================================================ */
async function loadCheckin() {
  const key = todayKey();
  try {
    const snap = await getDoc(doc(db, 'checkins', key));
    S.checkin = snap.exists() ? snap.data() : { picks: {}, checked: {} };
    if (!snap.exists()) {
      // Ensure the doc exists so later granular updateDoc calls never fail.
      await setDoc(checkinDocRef(key), { picks: {}, checked: {}, updatedAt: serverTimestamp() }, { merge: true });
    }
  } catch (e) {
    handleDbError(e);
    S.checkin = { picks: {}, checked: {} };
  }
}

/* Granular check-in writes: picks.<slot> / checked.<slot> are updated individually,
   so two people editing different slots never overwrite each other. */
function saveCheckinField(field, slot, value) {
  updateDoc(checkinDocRef(), { [`${field}.${slot}`]: value }).catch(handleDbError);
}

function optionsForSlot(slot, weekday) {
  const poolKey = slot.pool(weekday);
  const ids = S.pools[poolKey] || [];
  return ids.map(id => poolItem(poolKey, id)).filter(Boolean);
}

/* ============================================================
   WEIGH-INS
   ============================================================ */
async function loadWeighins() {
  try {
    const q = query(collection(db, 'weighins'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    S.weighins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    handleDbError(e);
    S.weighins = [];
  }
}

async function addWeighin(date, weight, note) {
  await addDoc(collection(db, 'weighins'), {
    date, weight: Number(weight), note: note || '', createdAt: serverTimestamp(),
  });
  await loadWeighins();
  renderProgress();
}

/* ============================================================
   GENERIC PICKER — tappable cards, never a <select>
   ============================================================ */
let pickerResolve = null;

function openPicker(title, options, onPick) {
  // options: [{id, label, sub}]
  $('#picker-title').textContent = title;
  const box = $('#picker-options');
  box.innerHTML = '';
  for (const opt of options) {
    const b = document.createElement('button');
    b.className = 'opt-card';
    b.innerHTML = `<span>${esc(opt.label)}</span>` + (opt.sub ? `<span class="sub">${esc(opt.sub)}</span>` : '');
    b.addEventListener('click', () => {
      closePicker();
      onPick(opt.id);
    });
    box.appendChild(b);
  }
  $('#picker-overlay').hidden = false;
}
function closePicker() {
  $('#picker-overlay').hidden = true;
  $('#picker-options').innerHTML = '';
}
$('#picker-close').addEventListener('click', closePicker);
$('#picker-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'picker-overlay') closePicker();
});

/* ============================================================
   RENDERING
   ============================================================ */
function switchTab(name) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.hidden = p.id !== `tab-${name}`);
  if (name === 'today') renderToday();
  if (name === 'pools') renderPools();
  if (name === 'shop') renderShop();
  if (name === 'progress') renderProgress();
}
$$('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function renderAll() {
  renderToday(); renderPools(); renderShop(); renderProgress();
}

/* ---------- Today tab ---------- */
function renderToday() {
  const panel = $('#tab-today');
  const now = new Date();
  const wd = now.getDay();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const isFriday = wd === 5;
  const isMonOrWed = wd === 1 || wd === 3;

  let html = `<h2>Today's meals</h2>
    <p class="muted">${esc(dateStr)} — Pick today's meals from the pools, then check them off as he eats.</p>`;

  if (isFriday) {
    html += `<div class="notice"><strong>Treat night:</strong> Friday dinner is chicken nuggets + buttered corn. Nuggets live here only.</div>`;
  }
  if (isMonOrWed) {
    html += `<div class="notice"><strong>Whole Foods night?</strong> If tonight's the outing after his extracurricular, dinner is chicken tenders there.</div>`;
  }

  for (const slot of SLOTS) {
    if (!slot.show(wd)) continue;
    const slotName = typeof slot.name === 'function' ? slot.name(wd) : slot.name;
    const pickId = S.checkin.picks[slot.key];
    const poolKey = slot.pool(wd);
    const item = pickId ? (poolItem(poolKey, pickId) || { label: pickId }) : null;
    const checked = !!S.checkin.checked[slot.key];
    html += `
      <div class="slot-row">
        <input type="checkbox" class="slot-check" data-slot="${slot.key}" ${checked ? 'checked' : ''} aria-label="Mark ${esc(slotName)} done">
        <div class="slot-body">
          <div class="slot-name">${esc(slotName)}</div>
          <div class="slot-pick ${item ? '' : 'empty'}">${item ? esc(item.label) : 'Tap Pick to choose…'}</div>
        </div>
        <button class="slot-change" data-slot="${slot.key}">Pick</button>
      </div>`;
  }

  panel.innerHTML = html;

  $$('.slot-check', panel).forEach(cb => cb.addEventListener('change', () => {
    S.checkin.checked[cb.dataset.slot] = cb.checked;
    saveCheckinField('checked', cb.dataset.slot, cb.checked);
  }));
  $$('.slot-change', panel).forEach(btn => btn.addEventListener('click', () => {
    const slot = SLOTS.find(s => s.key === btn.dataset.slot);
    const options = optionsForSlot(slot, wd).map(it => ({ id: it.id, label: it.label }));
    openPicker(`Pick ${slotName.toLowerCase()}`, options, (id) => {
      S.checkin.picks[slot.key] = id;
      saveCheckinField('picks', slot.key, id);
      renderToday();
    });
  }));
}

/* ---------- Pools tab ---------- */
function renderPools() {
  const panel = $('#tab-pools');
  let html = `<h2>Pools</h2>
    <p class="muted">Sets to pick from each day — no rigid schedule. Only the two anchored dinners are fixed.</p>
    <div class="toolbar"><button id="shuffle-btn" class="btn-primary">Shuffle week</button></div>
    <div class="notice"><strong>Anchored dinners (fixed)</strong><br>
    ${ANCHORED.map(a => `• ${esc(a.label)}`).join('<br>')}</div>`;

  for (const [key, pool] of Object.entries(MASTER_POOLS)) {
    const ids = S.pools[key] || [];
    html += `<div class="card pool-card"><h3>${esc(pool.title)}</h3>
      <p class="muted" style="margin-top:0">${esc(pool.note)}</p><div class="pool-items">`;
    for (const id of ids) {
      const item = poolItem(key, id);
      if (!item) continue;
      html += `<div class="pool-item"><span>${esc(item.label)}</span>
        <button class="swap-btn" data-pool="${key}" data-id="${esc(id)}">Swap</button></div>`;
    }
    html += `</div></div>`;
  }
  panel.innerHTML = html;

  $('#shuffle-btn').addEventListener('click', async () => {
    const btn = $('#shuffle-btn');
    btn.disabled = true;
    btn.textContent = 'Shuffling…';
    try {
      await shufflePools();
      renderPools(); renderShop(); renderToday();
      toast('Fresh pools for the week!');
    } catch (e) {
      handleDbError(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Shuffle week';
    }
  });

  $$('.swap-btn', panel).forEach(b => b.addEventListener('click', () => {
    const poolKey = b.dataset.pool;
    const oldId = b.dataset.id;
    const pool = MASTER_POOLS[poolKey];
    const options = pool.items
      .filter(i => !(S.pools[poolKey] || []).includes(i.id) || i.id === oldId)
      .map(i => ({ id: i.id, label: i.label }));
    openPicker(`Swap — ${pool.title}`, options, (newId) => {
      S.pools[poolKey] = (S.pools[poolKey] || []).map(id => id === oldId ? newId : id);
      updateDoc(stateDocRef(), { [`pools.${poolKey}`]: S.pools[poolKey] }).catch(handleDbError);
      rebuildShopFromPools();
      renderPools(); renderShop();
    });
  }));
}

/* ---------- Shop tab ---------- */
function renderShop() {
  const panel = $('#tab-shop');
  const rows = allShopRows();
  const { total, done } = shopProgress();
  const pct = total ? Math.round((done / total) * 100) : 0;

  let html = `<h2>Shop</h2>
    <p class="muted">Grocery checklist for this week's pools. Check things off as you shop.</p>
    <div class="shop-progress">${done} of ${total} gathered
      <div class="bar"><div style="width:${pct}%"></div></div></div>
    <div class="toolbar">
      <button id="rebuild-shop" class="btn-secondary">Rebuild from pools</button>
      <button id="copy-shop" class="btn-secondary">Copy list</button>
    </div>`;

  let lastSection = '';
  for (const r of rows) {
    if (r.section !== lastSection) {
      html += `<div class="section-label">${esc(r.section)}</div>`;
      lastSection = r.section;
    }
    const checked = !!S.shopped[r.id];
    html += `<label class="shop-item ${checked ? 'done' : ''}">
      <input type="checkbox" data-shop="${esc(r.id)}" ${checked ? 'checked' : ''}>
      <span>${esc(r.label)}${r.qty ? ` <span class="qty">(${esc(r.qty)})</span>` : ''}</span>
    </label>`;
  }

  html += `<div class="section-label">Add your own</div>
    <div class="add-row">
      <input id="custom-item-input" placeholder="e.g. Extra bananas" maxlength="80">
      <button id="custom-item-add" class="btn-secondary">Add</button>
    </div>`;

  panel.innerHTML = html;

  $$('input[data-shop]', panel).forEach(cb => cb.addEventListener('change', () => {
    const id = cb.dataset.shop;
    if (cb.checked) S.shopped[id] = true;
    else delete S.shopped[id];
    // Granular field-path write: two people toggling different items never clobber each other.
    updateDoc(stateDocRef(), { [`shopped.${id}`]: cb.checked ? true : deleteField() }).catch(handleDbError);
    renderShop();
  }));
  $('#rebuild-shop').addEventListener('click', () => {
    rebuildShopFromPools();
    renderShop();
    toast('Shopping list rebuilt from pools.');
  });
  $('#copy-shop').addEventListener('click', copyShopList);
  $('#custom-item-add').addEventListener('click', () => {
    const input = $('#custom-item-input');
    const label = input.value.trim();
    if (!label) return;
    const item = { id: 'custom-' + Date.now(), label, section: 'Added' };
    S.customItems.push(item);
    input.value = '';
    updateDoc(stateDocRef(), { customItems: arrayUnion(item) }).catch(handleDbError);
    renderShop();
  });
}

/* ---------- Progress tab ---------- */
function renderProgress() {
  const panel = $('#tab-progress');
  const ws = S.weighins.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  let trendHtml = '';
  if (ws.length >= 2) {
    const latest = ws[0], prev = ws[ws.length - 1];
    const diff = (Number(latest.weight) - Number(prev.weight)).toFixed(1);
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    trendHtml = `<div class="trend">${arrow} ${Math.abs(diff)} lb since ${esc(prev.date)} (goal: 40th → 50th percentile, gradual)</div>`;
  } else if (ws.length === 1) {
    trendHtml = `<div class="trend">First weigh-in logged — the trend builds from here. Goal: 40th → 50th percentile.</div>`;
  }

  let html = `<h2>Progress</h2>
    <p class="muted">Weigh-ins for the 40th → 50th percentile goal. Food-first and gradual — the pediatrician stays in the loop.</p>
    ${trendHtml}
    <div class="card form-card">
      <h3>Log a weigh-in</h3>
      <label>Date <input id="wi-date" type="date" value="${todayKey()}"></label>
      <label>Weight (lb) <input id="wi-weight" type="number" step="0.1" min="0" placeholder="e.g. 52.5"></label>
      <label>Note (optional) <input id="wi-note" type="text" maxlength="140" placeholder="e.g. after breakfast"></label>
      <div class="toolbar"><button id="wi-add" class="btn-primary">Save weigh-in</button></div>
    </div>
    <div class="section-label">History</div>`;

  if (!ws.length) {
    html += `<p class="muted">No weigh-ins yet.</p>`;
  } else {
    for (const w of ws) {
      html += `<div class="weighin-row"><span><strong>${esc(String(w.weight))} lb</strong> — ${esc(w.date)}${w.note ? `<br><span class="muted">${esc(w.note)}</span>` : ''}</span></div>`;
    }
  }
  panel.innerHTML = html;

  $('#wi-add').addEventListener('click', async () => {
    const date = $('#wi-date').value;
    const weight = $('#wi-weight').value;
    const note = $('#wi-note').value.trim();
    if (!date || !weight) { toast('Add a date and a weight.'); return; }
    try {
      await addWeighin(date, weight, note);
      toast('Weigh-in saved.');
    } catch (e) { handleDbError(e); }
  });
}

/* ---------- boot: show login until auth resolves ---------- */
$('#login-screen').hidden = false;
