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

const VERSION = "0.2.0";
const MARK = "shop-req-filler";
const BUTTON_CLASS = `${MARK}-btn`;
const PATCH_FLAG = `__${MARK}_patched`;
const GUARD_FLAG = `__${MARK}_guard`;
const OBSERVER_FLAG = `__${MARK}_observer`;
const PURCHASE_KEY = Symbol(`${MARK}-purchase`);

export function setup(ctx) {
  const log = (...args) => console.log(`[Shop Requirement Filler v${VERSION}]`, ...args);

  registerSettings(ctx, log);

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

// Every item in the game. `game.items` is a NamespaceRegistry whose
// `.allObjects` is the flat array of item objects (.id/.name/.category/.media).
function getAllItems() {
  const items = getGame()?.items;
  if (Array.isArray(items?.allObjects)) return items.allObjects;
  if (typeof items?.forEach === "function") {
    const out = [];
    items.forEach((item) => out.push(item));
    return out;
  }
  return [];
}

// Every currency (GP, Slayer Coins, Raid Coins, Abyssal Pieces, ...). Newer
// versions expose `game.currencies`; fall back to the individual accessors.
function getAllCurrencies() {
  const game = getGame();
  const registry = game?.currencies;
  if (Array.isArray(registry?.allObjects)) return registry.allObjects;
  if (typeof registry?.forEach === "function") {
    const out = [];
    registry.forEach((currency) => out.push(currency));
    return out;
  }
  return [game?.gp, game?.slayerCoins, game?.raidCoins, game?.abyssalPieces, game?.abyssalSlayerCoins].filter(
    (currency) => currency && typeof currency.add === "function",
  );
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
  // only purchases that cost items and/or currency
  if (getItemCosts(purchase).length === 0 && getCurrencyCosts(purchase).length === 0) return;

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
        const { types } = addMissingItems(purchase);
        flash(button, types > 0 ? `Added ${types} cost type(s)` : "Already have all");
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

// Currency costs of a purchase, e.g. GP or Slayer Coins. Mirrors getItemCosts:
// `costs.currencies` is normally [{ currency, quantity }] but handle a Map too.
function getCurrencyCosts(purchase) {
  const source = purchase?.costs?.currencies;
  const entries = Array.isArray(source)
    ? source
    : source instanceof Map
      ? Array.from(source, ([currency, quantity]) => ({ currency, quantity }))
      : [];

  const merged = new Map();
  for (const entry of entries) {
    const currency = entry?.currency;
    const quantity = Number(entry?.quantity);
    if (!currency || typeof currency.add !== "function" || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(currency, (merged.get(currency) ?? 0) + Math.floor(quantity));
  }
  return Array.from(merged, ([currency, quantity]) => ({ currency, quantity }));
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

  for (const { currency, quantity } of getCurrencyCosts(purchase)) {
    const owned = Number(currency.amount) || 0;
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    currency.add(missing);
    added += missing;
    types += 1;
  }

  return { added, types };
}

// --- Item Adder settings + modal ---------------------------------------------

const ADDER = {
  overlay: `${MARK}-adder-overlay`,
  panel: `${MARK}-adder-panel`,
  bar: `${MARK}-adder-bar`,
  search: `${MARK}-adder-search`,
  category: `${MARK}-adder-category`,
  qty: `${MARK}-adder-qty`,
  add: `${MARK}-adder-add`,
  clear: `${MARK}-adder-clear`,
  close: `${MARK}-adder-close`,
  grid: `${MARK}-adder-grid`,
  cell: `${MARK}-adder-cell`,
  hint: `${MARK}-adder-hint`,
  tip: `${MARK}-adder-tip`,
  toast: `${MARK}-adder-toast`,
  selected: `${MARK}-selected`,
};

// Cap on cells rendered at once so the unfiltered ~1600-item list stays snappy.
const RENDER_CAP = 600;
const CURRENCY_CATEGORY = "Currency";

let overlayEl; // cached DOM, built lazily on first open

// Registered synchronously in setup() so the button exists as soon as Melvor
// builds the mod's settings page. Guarded in case the settings API is absent.
function registerSettings(ctx, log) {
  try {
    const section = ctx?.settings?.section?.("Item Adder");
    section?.add?.({
      type: "button",
      name: "open-item-adder",
      display: "Open Item Adder",
      color: "primary",
      onClick: () => openItemAdder(),
    });
  } catch (err) {
    log?.("could not register Item Adder settings button", err);
  }
}

function openItemAdder() {
  if (!getGame()?.bank) {
    console.warn("[Shop Requirement Filler] Item Adder needs a loaded character.");
    return;
  }
  closeSettingsModal(); // dismiss Melvor's settings popup before showing the grid
  injectStyles();
  if (!overlayEl) overlayEl = buildOverlay();
  overlayEl.hidden = false;
  overlayEl.querySelector(`.${ADDER.search}`)?.focus();
}

// Mod settings render inside a SweetAlert2 (`Swal`) popup; close it so the grid
// isn't stacked behind/over it. Guarded for lexical scoping, like getGame().
function closeSettingsModal() {
  const swal = (typeof Swal !== "undefined" && Swal) || globalThis.Swal;
  try {
    swal?.close?.();
  } catch (err) {
    console.warn("[Shop Requirement Filler] could not close settings modal", err);
  }
}

function closeItemAdder() {
  if (overlayEl) overlayEl.hidden = true;
}

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.className = ADDER.overlay;
  overlay.hidden = true;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeItemAdder();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlayEl && !overlayEl.hidden) closeItemAdder();
  });

  const panel = document.createElement("div");
  panel.className = ADDER.panel;
  overlay.append(panel);

  // --- control bar ---
  const bar = document.createElement("div");
  bar.className = ADDER.bar;

  const search = document.createElement("input");
  search.type = "search";
  search.className = `form-control ${ADDER.search}`;
  search.placeholder = "Search items…";

  const category = document.createElement("select");
  category.className = `form-control ${ADDER.category}`;

  const qtyWrap = document.createElement("label");
  qtyWrap.className = ADDER.qty;
  qtyWrap.append("Qty");
  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "1";
  qty.value = "1";
  qty.className = "form-control";
  qtyWrap.append(qty);

  const add = document.createElement("button");
  add.type = "button";
  add.className = `btn btn-sm btn-success ${ADDER.add}`;
  add.textContent = "Add";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = `btn btn-sm btn-secondary ${ADDER.clear}`;
  clear.textContent = "Clear";

  const close = document.createElement("button");
  close.type = "button";
  close.className = `btn btn-sm btn-danger ${ADDER.close}`;
  close.textContent = "Close";
  close.addEventListener("click", closeItemAdder);

  bar.append(search, category, qtyWrap, add, clear, close);
  panel.append(bar);

  // --- grid ---
  const grid = document.createElement("div");
  grid.className = ADDER.grid;
  panel.append(grid);

  // Result count / "refine your search" line, below the scrollable grid.
  const hint = document.createElement("div");
  hint.className = ADDER.hint;
  panel.append(hint);

  // Custom hover tooltip (native title is flaky over a dense icon grid).
  // Lives on the overlay so it can float above the scrollable grid.
  const tip = document.createElement("div");
  tip.className = ADDER.tip;
  tip.hidden = true;
  overlay.append(tip);

  // Transient "added" confirmation toast (self-contained, no dependency on
  // whichever Melvor toast globals happen to be reachable).
  const toast = document.createElement("div");
  toast.className = ADDER.toast;
  toast.hidden = true;
  overlay.append(toast);
  let toastTimer;
  const notify = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  };

  // Build the combined dataset once (items + currencies).
  const entries = buildEntries();
  populateCategories(category, entries);

  // Selected entries persist across search/category changes (keyed by the stable
  // entry object), so the grid re-render re-applies the highlight.
  const selected = new Set();

  const clampQty = () => {
    const value = Math.floor(Number(qty.value));
    return Number.isFinite(value) && value > 0 ? value : 1;
  };

  let timer;
  const rerender = () => renderGrid(grid, hint, entries, search.value, category.value, selected);
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(rerender, 120);
  };
  search.addEventListener("input", debounced);
  category.addEventListener("change", rerender);

  // Click toggles selection; the Add button commits the current quantity.
  grid.addEventListener("click", (event) => {
    const cell = event.target?.closest?.(`.${ADDER.cell}`);
    if (!cell) return;
    const entry = cell[PURCHASE_KEY];
    if (!entry) return;
    if (selected.has(entry)) {
      selected.delete(entry);
      cell.classList.remove(ADDER.selected);
    } else {
      selected.add(entry);
      cell.classList.add(ADDER.selected);
    }
  });

  add.addEventListener("click", async () => {
    if (selected.size === 0) {
      flash(add, "Select items first");
      return;
    }
    const quantity = clampQty();
    const list = Array.from(selected);

    // Add in small chunks, yielding to the event loop between them, so a large
    // selection never blocks the game loop (each addItem triggers bank work).
    add.disabled = true;
    const CHUNK = 20;
    for (let i = 0; i < list.length; i += CHUNK) {
      for (let j = i; j < Math.min(i + CHUNK, list.length); j += 1) {
        addEntryToPlayer(list[j], quantity);
      }
      if (i + CHUNK < list.length) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    add.disabled = false;

    notify(`✓ Added ${formatQty(quantity)} × ${list.length} ${list.length === 1 ? "entry" : "entries"}`);
    selected.clear();
    rerender();
  });

  clear.addEventListener("click", () => {
    if (selected.size === 0) {
      flash(clear, "Nothing selected");
      return;
    }
    selected.clear();
    rerender();
  });

  // Delegated tooltip: show the entry name while hovering a cell.
  grid.addEventListener("mouseover", (event) => {
    const cell = event.target?.closest?.(`.${ADDER.cell}`);
    const entry = cell?.[PURCHASE_KEY];
    if (!entry) return;
    tip.textContent = entry.name;
    tip.hidden = false;
    positionTip(tip, event.clientX, event.clientY);
  });
  grid.addEventListener("mousemove", (event) => {
    if (!tip.hidden) positionTip(tip, event.clientX, event.clientY);
  });
  grid.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget?.closest?.(`.${ADDER.cell}`)) tip.hidden = true;
  });

  rerender();
  document.body.append(overlay);
  return overlay;
}

// Places the tooltip near the cursor, flipping/clamping to stay on-screen.
function positionTip(tip, x, y) {
  const offset = 14;
  const width = tip.offsetWidth;
  let left = x + offset;
  if (left + width > window.innerWidth - 8) left = x - width - offset;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${y + offset}px`;
}

// Normalises items and currencies into a single shape the grid renders.
function buildEntries() {
  const entries = [];
  for (const item of getAllItems()) {
    if (!item?.name) continue;
    entries.push({
      kind: "item",
      ref: item,
      name: item.name,
      media: item.media,
      category: item.category || "Other",
    });
  }
  for (const currency of getAllCurrencies()) {
    if (!currency?.name) continue;
    entries.push({
      kind: "currency",
      ref: currency,
      name: currency.name,
      media: currency.media,
      category: CURRENCY_CATEGORY,
    });
  }
  return entries;
}

function populateCategories(select, entries) {
  const categories = Array.from(new Set(entries.map((entry) => entry.category))).sort((a, b) =>
    a.localeCompare(b),
  );
  select.append(new Option("All categories", "All"));
  for (const name of categories) select.append(new Option(name, name));
}

function renderGrid(grid, hint, entries, query, categoryValue, selected) {
  const needle = String(query || "").trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (categoryValue !== "All" && entry.category !== categoryValue) return false;
    if (needle && !entry.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  const shown = filtered.slice(0, RENDER_CAP);
  const fragment = document.createDocumentFragment();
  for (const entry of shown) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = selected?.has(entry) ? `${ADDER.cell} ${ADDER.selected}` : ADDER.cell;
    cell.setAttribute("aria-label", entry.name);
    cell[PURCHASE_KEY] = entry;

    if (entry.media) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = entry.media;
      img.alt = entry.name;
      cell.append(img);
    } else {
      cell.textContent = entry.name.slice(0, 3);
    }
    fragment.append(cell);
  }

  grid.replaceChildren(fragment);

  const selectedCount = selected?.size ? ` · ${selected.size} selected` : "";
  hint.textContent =
    (filtered.length === 0
      ? "No items match your search."
      : filtered.length > shown.length
        ? `Showing ${shown.length} of ${filtered.length} — refine your search to see more.`
        : `${filtered.length} result(s)`) + selectedCount;
}

// Formats large quantities using Melvor's formatNumber when reachable.
function formatQty(value) {
  const fmt = (typeof formatNumber !== "undefined" && formatNumber) || globalThis.formatNumber;
  try {
    return typeof fmt === "function" ? fmt(value) : Number(value).toLocaleString();
  } catch {
    return Number(value).toLocaleString();
  }
}

function addEntryToPlayer(entry, quantity) {
  if (entry.kind === "currency") {
    entry.ref.add(quantity);
    return;
  }
  // addItem(item, quantity, logLost, found, ignoreSpace, notify)
  // notify:false — a per-item toast is what made bulk adds freeze the game for
  // seconds; we show a single summary toast instead.
  getGame()?.bank?.addItem(entry.ref, quantity, false, false, true, false);
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

    .${ADDER.overlay} {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.6);
    }
    .${ADDER.overlay}[hidden] { display: none; }

    .${ADDER.panel} {
      display: flex;
      flex-direction: column;
      width: min(1100px, 100%);
      max-height: 100%;
      overflow: hidden;
      padding: 16px;
      border-radius: 8px;
      background: var(--bs-body-bg, #2d2f36);
      color: var(--bs-body-color, #cfd2da);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }

    .${ADDER.bar} {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    .${ADDER.search} { flex: 1 1 200px; min-width: 160px; }
    .${ADDER.category} { flex: 0 1 200px; }
    .${ADDER.qty} {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      white-space: nowrap;
    }
    .${ADDER.qty} input { width: 160px; }

    .${ADDER.grid} {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
      grid-auto-rows: 56px; /* definite row height so icons never overlap */
      gap: 6px;
      overflow-y: auto;
      padding: 4px;
      flex: 1 1 auto;
      min-height: 0; /* let the grid shrink & scroll instead of overflowing the panel */
    }

    .${ADDER.cell} {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: transform 0.06s ease, border-color 0.06s ease;
      font-size: 11px;
      color: inherit;
      overflow: hidden;
    }
    .${ADDER.cell} img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .${ADDER.cell}:hover {
      border-color: var(--bs-primary, #4c84ff);
      transform: scale(1.08);
      background: rgba(255, 255, 255, 0.1);
    }

    .${ADDER.cell}.${ADDER.selected} {
      border-color: var(--bs-success, #5cb85c);
      background: rgba(92, 184, 92, 0.28);
      box-shadow: inset 0 0 0 1px var(--bs-success, #5cb85c);
    }
    .${ADDER.cell}.${ADDER.selected}:hover {
      border-color: var(--bs-success, #5cb85c);
    }

    .${ADDER.tip} {
      position: fixed;
      z-index: 100001;
      pointer-events: none;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgba(15, 16, 20, 0.95);
      color: #fff;
      font-size: 12px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    .${ADDER.tip}[hidden] { display: none; }

    .${ADDER.hint} {
      flex: 0 0 auto;
      padding: 8px 4px 2px;
      font-size: 12px;
      opacity: 0.7;
    }

    .${ADDER.toast} {
      position: fixed;
      left: 50%;
      bottom: 32px;
      transform: translateX(-50%);
      z-index: 100002;
      padding: 10px 16px;
      border-radius: 6px;
      background: var(--bs-success, #5cb85c);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      pointer-events: none;
    }
    .${ADDER.toast}[hidden] { display: none; }

    @media (max-width: 600px) {
      .${ADDER.overlay} { padding: 8px; }
      .${ADDER.panel} { padding: 10px; }
      .${ADDER.bar} { gap: 6px; }
      .${ADDER.search} { flex: 1 1 100%; }
      .${ADDER.category} { flex: 1 1 auto; }
      .${ADDER.qty} input { width: 120px; }
      .${ADDER.grid} {
        grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
        grid-auto-rows: 48px;
      }
    }
  `;
  document.head.append(style);
}
