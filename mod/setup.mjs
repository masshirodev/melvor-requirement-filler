// Shop Requirement Filler
// Adds an "Add items" button to each shop purchase that costs items,
// which tops up your bank with the missing item costs.
//
// Hooks the real Melvor shop structures (confirmed at runtime):
//   shopMenu.tabs            -> Map<category, { menu: ShopTabMenu, container }>
//   ShopTabMenu.items        -> Map<ShopPurchase, { container, item: ShopItem }>
//   ShopItem.purchase        -> ShopPurchase
//   ShopItem.costFlex        -> the inline, wrapping cost row (where we add our button)
//   ShopPurchase.costs.items -> [{ item, quantity }]
//   game.bank.getQty(item), game.bank.addItem(item, qty, ...)

const VERSION = "0.1.9";
const MARK = "shop-req-filler";
const BUTTON_CLASS = `${MARK}-btn`;
const PATCH_FLAG = `__${MARK}_patched`;
const GUARD_FLAG = `__${MARK}_guard`;
const OBSERVER_FLAG = `__${MARK}_observer`;
const PURCHASE_KEY = Symbol(`${MARK}-purchase`);

export function setup(ctx) {
  const log = (...args) => console.log(`[Shop Requirement Filler v${VERSION}]`, ...args);

  ctx.onInterfaceReady(() => {
    injectStyles();
    installClickGuard();
    patchShopMenu(log);
    refresh();
    log(
      `scope — globalThis.shopMenu:${typeof globalThis.shopMenu}` +
        ` shopMenu:${typeof shopMenu} globalThis.game:${typeof globalThis.game} game:${typeof game}`,
    );
    log("Loaded.");
  });
}

// Melvor's `shopMenu`/`game` are lexically-scoped in its bundle, so they are NOT
// on globalThis. Reach them by bare name (guarded with typeof so it never throws
// even if the mod module can't see them), falling back to globalThis.
function getShopMenu() {
  if (globalThis.shopMenu) return globalThis.shopMenu;
  if (typeof shopMenu !== "undefined" && shopMenu) return shopMenu;
  return undefined;
}

function getGame() {
  if (globalThis.game) return globalThis.game;
  if (typeof game !== "undefined" && game) return game;
  return undefined;
}

// --- Keeping buttons in sync -------------------------------------------------

// The shop's tabs and cards are built lazily the first time the Shop is opened,
// so onInterfaceReady fires before any of it exists. `shopMenu` itself is
// available though, so we patch ShopMenu's methods that fire when tabs are
// built/shown and when costs/requirements change — each re-runs the sweep, so
// buttons appear as soon as the shop renders and survive updates.
function patchShopMenu(log) {
  const proto = getShopMenu()?.constructor?.prototype;
  if (!proto) {
    log("shopMenu unavailable to patch; relying on the observer only.");
    return;
  }

  const methods = [
    "createShopTab",
    "showTab",
    "updateItemPostPurchase",
    "updateForCostChange",
    "updateForRequirementChange",
    "updateForBuyQtyChange",
  ];

  for (const name of methods) {
    const original = proto[name];
    if (typeof original !== "function" || original[PATCH_FLAG]) continue;

    proto[name] = function patched(...args) {
      const result = original.apply(this, args);
      try {
        refresh();
      } catch (err) {
        console.error("[Shop Requirement Filler] button refresh failed", err);
      }
      return result;
    };
    proto[name][PATCH_FLAG] = true;
  }
}

// Adds any missing buttons and lazily installs the observer once the shop
// container exists (it doesn't yet at onInterfaceReady).
function refresh() {
  sweepAllTabs();
  installShopObserver();
}

function sweepAllTabs() {
  const tabs = getShopMenu()?.tabs;
  if (!tabs?.forEach) return;
  tabs.forEach((tab) => {
    if (tab?.menu) ensureButtonsForMenu(tab.menu);
  });
}

// Safety net for cards that appear via a path our method patches don't cover
// (lazy rendering, filters, requirement unlocks). Scoped to the shop container
// only, and debounced, so it stays cheap. Re-sweeps re-add nothing once every
// visible card already has its button, so it converges instead of looping.
function installShopObserver() {
  const root = getShopMenu()?.container;
  if (!root || globalThis[OBSERVER_FLAG]) return;

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sweepAllTabs();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  globalThis[OBSERVER_FLAG] = observer;
}

function ensureButtonsForMenu(menu) {
  const items = menu?.items;
  if (!items?.forEach) return;
  items.forEach((entry) => {
    const shopItem = entry?.item;
    if (shopItem) ensureButton(shopItem);
  });
}

// --- Button creation ---------------------------------------------------------

function ensureButton(shopItem) {
  const purchase = shopItem.purchase;
  // costFlex is the inline cost row; fall back to the cost container if absent.
  const anchor = shopItem.costFlex || shopItem.costContainer;
  if (!purchase || !anchor) return;
  if (anchor.querySelector(`.${BUTTON_CLASS}`)) return;
  if (getItemCosts(purchase).length === 0) return; // only item-cost purchases

  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-sm btn-success ${BUTTON_CLASS}`;
  button.textContent = "Add items";
  button.title = "Add missing required item costs to your bank";
  button[PURCHASE_KEY] = purchase;
  anchor.append(button);
}

// The card is a clickable <a> that fires the purchase, and it binds in the
// capture phase — so a listener on the button itself can't stop it in time.
// Instead we listen on `document` in the capture phase (runs before ANY card
// handler); if the event came from our button we kill it and do the add here.
function installClickGuard() {
  if (globalThis[GUARD_FLAG]) return;
  globalThis[GUARD_FLAG] = true;

  for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"]) {
    document.addEventListener(
      type,
      (event) => {
        const button = event.target?.closest?.(`.${BUTTON_CLASS}`);
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (type !== "click") return;
        const purchase = button[PURCHASE_KEY];
        if (!purchase) return;
        const { added, types } = addMissingItems(purchase);
        flash(button, added > 0 ? `Added ${types} item type(s)` : "Already have all");
      },
      true, // capture phase — beats the card's own handler
    );
  }
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1400);
}

// --- Game logic --------------------------------------------------------------

function getItemCosts(purchase) {
  const items = purchase?.costs?.items;
  if (!Array.isArray(items)) return [];

  const merged = new Map();
  for (const entry of items) {
    const item = entry?.item;
    const quantity = Number(entry?.quantity);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(item, (merged.get(item) ?? 0) + Math.floor(quantity));
  }
  return Array.from(merged, ([item, quantity]) => ({ item, quantity }));
}

function addMissingItems(purchase) {
  const bank = getGame()?.bank;
  if (!bank) return { added: 0, types: 0 };

  let added = 0;
  let types = 0;
  for (const { item, quantity } of getItemCosts(purchase)) {
    const owned = Number(bank.getQty(item)) || 0;
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    // addItem(item, quantity, logLost, found, ignoreSpace, notify)
    bank.addItem(item, missing, false, false, true, true);
    added += missing;
    types += 1;
  }
  return { added, types };
}

// --- Styles ------------------------------------------------------------------

function injectStyles() {
  if (document.getElementById(`${MARK}-styles`)) return;

  const style = document.createElement("style");
  style.id = `${MARK}-styles`;
  style.textContent = `
    .${BUTTON_CLASS} {
      align-self: center;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      margin-left: 8px;
      padding: 3px 8px;
      white-space: nowrap;
    }
  `;
  document.head.append(style);
}
