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

const VERSION = "0.8.3";
const MARK = "shop-req-filler";
const BUTTON_CLASS = `${MARK}-btn`;
const PATCH_FLAG = `__${MARK}_patched`;
const GUARD_FLAG = `__${MARK}_guard`;
const OBSERVER_FLAG = `__${MARK}_observer`;
const PURCHASE_KEY = Symbol(`${MARK}-purchase`);
// A button stores a resolver returning normalized { items, currencies } costs,
// so the click guard works for any cost source (shop, agility, ...).
const COSTS_KEY = Symbol(`${MARK}-costs`);
// The game object a patched card is currently showing (agility obstacle/pillar,
// astrology constellation) — these elements don't store it themselves.
const TARGET_KEY = Symbol(`${MARK}-target`);
// The args setCosts was last called with, so we can replay it to re-render the
// cost pills after topping up (the agility UI doesn't react to bank changes).
const COST_ARGS_KEY = Symbol(`${MARK}-cost-args`);
// Optional per-button hook run after a successful add; returns the button to flash.
const REFRESH_KEY = Symbol(`${MARK}-refresh`);
// Marks every control we inject INTO a game card. The click guard swallows events
// inside these, then dispatches to the nearest ACTION_KEY handler.
const UI_CLASS = `${MARK}-ui`;
const ACTION_KEY = Symbol(`${MARK}-action`);
// Cartography's map-upgrade menu tracks a dig site AND a map independently.
const DIG_SITE_KEY = Symbol(`${MARK}-dig-site`);

export function setup(ctx) {
  const log = (...args) => console.log(`[Shop Requirement Filler v${VERSION}]`, ...args);

  registerSettings(ctx, log);

  ctx.onInterfaceReady(() => {
    injectStyles();
    installClickGuard();
    patchShopMenu(log);
    patchAgilityMenus(log);
    patchArtisanMenus(log);
    patchAstrologyMenus(log);
    patchCookingMenus(log);
    patchFiremakingMenus(log);
    patchFiremakingOilMenu(log);
    patchCartographyMenus(log);
    patchFarmingMenus(log);
    patchTownshipMenus(log);
    patchTownshipTasks(log);
    sweepExistingMenus();
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
  button.className = `btn btn-sm btn-success ${BUTTON_CLASS} ${UI_CLASS}`;
  button.textContent = "Add items";
  button.title = "Add missing required costs to your bank";
  button[PURCHASE_KEY] = purchase;
  // Resolved at click time so costs stay correct as buy quantity / modifiers change.
  button[COSTS_KEY] = () => ({
    items: getItemCosts(purchase),
    currencies: getCurrencyCosts(purchase),
  });
  button[ACTION_KEY] = () => handleTopUpClick(button);
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
        const root = event.target?.closest?.(`.${UI_CLASS}`);
        if (!root) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (type !== "click") return;
        const action = findAction(event.target, root);
        if (!action) return;
        try {
          action();
        } catch (err) {
          console.error("[Shop Requirement Filler] action failed", err);
        }
      },
      true, // capture phase — beats the card's own handler
    );
  }
}

// Nearest ancestor carrying an ACTION_KEY handler. Symbol-keyed props aren't
// findable via closest(), so walk the chain by hand (stopping at the injected root).
function findAction(node, root) {
  let element = node instanceof Element ? node : null;
  while (element) {
    if (typeof element[ACTION_KEY] === "function") return element[ACTION_KEY];
    if (element === root) break;
    element = element.parentElement;
  }
  return undefined;
}

// Shared behaviour of the shop/agility "Add items" buttons: top the bank up to
// cover this card's costs, refresh the card if it can't do so itself, and report.
function handleTopUpClick(button) {
  const resolveCosts = button[COSTS_KEY];
  if (typeof resolveCosts !== "function") return;

  let types = 0;
  try {
    types = addMissingCosts(resolveCosts()).types;
  } catch (err) {
    console.error("[Shop Requirement Filler] failed to add costs", err);
    flash(button, "Failed");
    return;
  }

  if (types === 0) {
    flash(button, "Already have all");
    return;
  }

  // Some screens (agility) don't re-render on bank changes; give the button a
  // chance to refresh its card, and flash whichever button survives that.
  const refresh = button[REFRESH_KEY];
  if (typeof refresh !== "function") {
    flash(button, `Added ${types} cost type(s)`);
    return;
  }

  let refreshed;
  try {
    refreshed = refresh();
  } catch (err) {
    console.error("[Shop Requirement Filler] cost re-render failed", err);
  }
  flash(refreshed ?? button, refreshed ? `Added ${types} cost type(s)` : "Added — reopen to refresh");
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

// Melvor's `Costs` class (returned by e.g. game.agility.getObstacleBuildCosts)
// exposes no public .items/.currencies — only these array getters. Normalizes it
// into the same { items, currencies } shape the shop path produces.
function normalizeCosts(costs) {
  const items = typeof costs?.getItemQuantityArray === "function" ? costs.getItemQuantityArray() : [];
  const currencies =
    typeof costs?.getCurrencyQuantityArray === "function" ? costs.getCurrencyQuantityArray() : [];

  return {
    items: items
      .map((entry) => ({ item: entry?.item, quantity: Math.floor(Number(entry?.quantity)) }))
      .filter((entry) => entry.item && Number.isFinite(entry.quantity) && entry.quantity > 0),
    currencies: currencies
      .map((entry) => ({ currency: entry?.currency, quantity: Math.floor(Number(entry?.quantity)) }))
      .filter(
        (entry) =>
          entry.currency &&
          typeof entry.currency.add === "function" &&
          Number.isFinite(entry.quantity) &&
          entry.quantity > 0,
      ),
  };
}

// Township costs are neither bank items nor currencies: they're TownshipResource
// objects with their own pool. getBuildingCostsForBiome returns [{resource, quantity}].
function normalizeTownshipCosts(entries) {
  const resources = [];
  const currencies = [];

  for (const entry of toResourceEntries(entries)) {
    const resource = entry?.resource;
    const quantity = Math.floor(Number(entry?.quantity));
    if (!resource || !Number.isFinite(quantity) || quantity <= 0) continue;

    // Township's "GP" is not a town resource — it's the PLAYER's GP wearing a
    // TownshipResource costume (the town's pool read 131M while the player had 24k,
    // and buildings are charged against the player). Treat any resource that maps to
    // a player currency as a currency cost, so it's compared and paid on the right pool.
    const currency = findCurrencyForResource(resource);
    if (currency) currencies.push({ currency, quantity });
    else resources.push({ resource, quantity });
  }

  return { items: [], currencies, resources };
}

// `amount` is an accessor on TownshipResource's prototype; prefer its setter (which
// respects the resource cap) and only fall back to the backing field if there is none.
//
// Township's "GP" resource is not a real town resource — it proxies the PLAYER's GP
// currency, so writing its amount is a no-op and the GP part of a building cost never
// got paid. If the write doesn't stick and the resource maps to a player currency, add
// to that currency instead.
// Only ever called for genuine town resources now — anything backed by a player
// currency is routed through the `currencies` path by normalizeTownshipCosts.
function setTownshipResource(resource, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(resource), "amount");
  if (descriptor?.set) resource.amount = value;
  else resource._amount = value;
}

// Match a township resource onto a player currency (Township GP -> game.gp).
function findCurrencyForResource(resource) {
  const name = resource?.name;
  const localID = resource?.localID ?? resource?._localID;
  return getAllCurrencies().find(
    (currency) =>
      currency.name === name || currency.localID === localID || currency.id?.endsWith(`:${localID}`),
  );
}

// Tops the bank/currencies/town resources up to cover a normalized cost.
function addMissingCosts(costs) {
  const bank = getGame()?.bank;
  if (!bank || !costs) return { added: 0, types: 0 };

  let added = 0;
  let types = 0;
  for (const { item, quantity } of costs.items ?? []) {
    const owned = Number(bank.getQty(item)) || 0;
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    // addItem(item, quantity, logLost, found, ignoreSpace, notify)
    bank.addItem(item, missing, false, false, true, true);
    added += missing;
    types += 1;
  }

  for (const { currency, quantity } of costs.currencies ?? []) {
    const owned = Number(currency.amount) || 0;
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    currency.add(missing);
    added += missing;
    types += 1;
  }

  for (const { resource, quantity } of costs.resources ?? []) {
    const owned = Number(resource.amount) || 0;
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    setTownshipResource(resource, owned + missing);
    added += missing;
    types += 1;
  }

  return { added, types };
}

// --- Agility obstacles -------------------------------------------------------

// The selection cards (<agility-obstacle-selection>) never store their obstacle —
// it only arrives as an argument to setObstacle/setPillar — so patch those to stash
// it, then inject the button into the card's `costContainer`. setCosts is patched
// too: it rebuilds costContainer's children and would otherwise wipe our button on
// every re-render.
function patchAgilityMenus(log) {
  const proto = customElements.get("agility-obstacle-selection")?.prototype;
  if (!proto) {
    log("agility-obstacle-selection is not registered; skipping agility buttons.");
    return;
  }

  patchAfter(proto, "setObstacle", function (obstacle) {
    this[TARGET_KEY] = { target: obstacle, kind: "obstacle" };
    ensureAgilityButton(this);
  });
  patchAfter(proto, "setPillar", function (pillar) {
    this[TARGET_KEY] = { target: pillar, kind: "pillar" };
    ensureAgilityButton(this);
  });
  patchAfter(proto, "setCosts", function (...args) {
    this[COST_ARGS_KEY] = args; // remember them so we can replay this render
    ensureAgilityButton(this);
  });
}

// Wraps proto[name] so `after` runs against the instance once the original returns.
function patchAfter(proto, name, after) {
  const original = proto[name];
  if (typeof original !== "function" || original[PATCH_FLAG]) return;

  proto[name] = function patched(...args) {
    const result = original.apply(this, args);
    try {
      after.apply(this, args);
    } catch (err) {
      console.error(`[Shop Requirement Filler] agility ${name} hook failed`, err);
    }
    return result;
  };
  proto[name][PATCH_FLAG] = true;
}

function ensureAgilityButton(element) {
  const entry = element?.[TARGET_KEY];
  const anchor = element?.costContainer;
  if (!entry?.target || !anchor) return;
  if (anchor.querySelector(`.${BUTTON_CLASS}`)) return;

  const resolveCosts = () => getAgilityCosts(entry);
  const costs = resolveCosts();
  if (costs.items.length === 0 && costs.currencies.length === 0) return; // free to build

  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-sm btn-success ${BUTTON_CLASS} ${UI_CLASS}`;
  button.textContent = "Add items";
  button.title = "Add missing build costs to your bank";
  button[COSTS_KEY] = resolveCosts;
  button[ACTION_KEY] = () => handleTopUpClick(button);

  // The agility screen doesn't react to bank changes, so the cost pills stay red
  // until it's reopened. Replaying setCosts with the args it was last rendered
  // with rebuilds them against the now-topped-up bank. Our setCosts patch re-adds
  // the button afterwards, so we hand the fresh one back to be flashed.
  button[REFRESH_KEY] = () => {
    const args = element[COST_ARGS_KEY];
    if (!args) return undefined;
    element.setCosts(...args);
    return anchor.querySelector(`.${BUTTON_CLASS}`) ?? undefined;
  };

  anchor.append(button);
}

// Build costs are modifier-reduced (the cards show "Cost Reduction: 30% / Items 45%"),
// so they must come from the skill — the obstacle's own itemCosts/currencyCosts are
// the pre-reduction base values and would add the wrong amounts.
function getAgilityCosts(entry) {
  const agility = getGame()?.agility;
  if (!agility || !entry?.target) return { items: [], currencies: [] };

  const costs =
    entry.kind === "pillar"
      ? agility.getPillarBuildCosts(entry.target)
      : agility.getObstacleBuildCosts(entry.target);
  return normalizeCosts(costs);
}

// --- Generic cost-button injection -------------------------------------------

// Straight add of `amount × costs` (no top-up) — what the craft-like dropdowns do.
function addCostsMultiplied(costs, amount) {
  const bank = getGame()?.bank;
  if (!bank) return 0;

  let types = 0;
  for (const { item, quantity } of costs.items ?? []) {
    // notify:false — a toast per item is what made bulk adds freeze the game.
    bank.addItem(item, quantity * amount, false, false, true, false);
    types += 1;
  }
  for (const { currency, quantity } of costs.currencies ?? []) {
    currency.add(quantity * amount);
    types += 1;
  }
  for (const { resource, quantity } of costs.resources ?? []) {
    setTownshipResource(resource, (Number(resource.amount) || 0) + quantity * amount);
    types += 1;
  }
  return types;
}

// True when a normalized cost has nothing in ANY of its three kinds. Township costs
// live in `resources`, so checking only items/currencies made its button say "No costs".
function isEmptyCosts(costs) {
  if (!costs) return true;
  return (
    (costs.items?.length ?? 0) === 0 &&
    (costs.currencies?.length ?? 0) === 0 &&
    (costs.resources?.length ?? 0) === 0
  );
}

// Dropdown button: pick N, add N × the resolved cost. For repeatable actions.
// `maxAmount` optionally adds a "Max (N)" row (township: builds remaining to upgrade).
function attachAmountButton(anchor, { title, resolveCosts, refresh, maxAmount }) {
  if (!anchor || anchor.querySelector(`.${MARK}-group`)) return;

  const { group, main } = createMenuButton({
    label: "Add items",
    title,
    buildMenu: (close) =>
      buildAmountMenu(
        {
          maxAmount,
          onPick: (amount) => {
            let costs;
            try {
              costs = resolveCosts();
            } catch (err) {
              console.error("[Shop Requirement Filler] cost lookup failed", err);
              flash(main, "No recipe");
              return;
            }
            if (isEmptyCosts(costs)) {
              flash(main, "No costs");
              return;
            }
            addCostsMultiplied(costs, amount);
            try {
              refresh?.();
            } catch (err) {
              console.warn("[Shop Requirement Filler] refresh failed", err);
            }
            flash(main, `Added x${formatQty(amount)}`);
          },
        },
        close,
      ),
  });

  const wrap = document.createElement("div");
  wrap.className = `${MARK}-actions`;
  wrap.append(group);
  anchor.append(wrap);
}

// Plain button: top up once to cover the resolved cost. For one-shot costs where an
// "N" would be meaningless (oil, seeds, plot unlocks, township upgrades).
function attachTopUpButton(anchor, { title, resolveCosts, refresh, label = "Add" }) {
  if (!anchor || anchor.querySelector(`.${BUTTON_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-sm btn-success ${BUTTON_CLASS} ${UI_CLASS}`;
  button.textContent = label;
  button.title = title;
  button[COSTS_KEY] = resolveCosts;
  button[ACTION_KEY] = () => handleTopUpClick(button);
  if (refresh) {
    button[REFRESH_KEY] = () => {
      refresh();
      return button; // survives the refresh, so it's the one to flash
    };
  }
  anchor.append(button);
}

// These menus are built during LOAD — before onInterfaceReady — so the setters we
// patch (setSelectedRecipe, setLog, ...) have already fired and won't fire again
// until the player re-selects something. Without this sweep the buttons only show up
// after you change your selection. Recover the current selection from the skill and
// inject straight into the already-rendered elements.
function sweepExistingMenus() {
  const game = getGame();
  if (!game) return;

  // Cartography paper: a single menu, recipe recoverable from the skill.
  const paperRecipe = game.cartography?.selectedPaperRecipe;
  if (paperRecipe) {
    document.querySelectorAll("paper-making-menu").forEach((menu) => {
      menu[TARGET_KEY] = paperRecipe;
      ensurePaperButton(menu);
    });
  }

  // Cooking: one menu per category, rendered in category order.
  const cooking = game.cooking;
  const categories = cooking?.categories?.allObjects;
  if (cooking && Array.isArray(categories)) {
    document.querySelectorAll("cooking-menu").forEach((menu, index) => {
      const recipe = cooking.selectedRecipes?.get(categories[index]);
      if (!recipe) return;
      menu[TARGET_KEY] = recipe;
      ensureCookingButton(menu);
    });
  }

  // Firemaking: single log/oil menus that read their selection off the skill.
  document.querySelectorAll("firemaking-log-menu").forEach(ensureFiremakingLogButton);
  document.querySelectorAll("firemaking-oil-menu").forEach(ensureFiremakingOilButton);

  sweepTownshipTasks();
}

// A button that just runs an action, with no cost model — used by the task "Complete".
function attachActionButton(anchor, { label, title, onClick }) {
  if (!anchor || anchor.querySelector(`.${BUTTON_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-sm btn-success ${BUTTON_CLASS} ${UI_CLASS}`;
  button.textContent = label;
  button.title = title;
  button[ACTION_KEY] = () => onClick(button);
  anchor.append(button);
}

// Melvor's render methods early-return unless their renderQueue flag is set, so
// calling them directly does nothing — which is why the UI kept showing stale
// quantities after a top-up. Flip the queue's boolean flags and the game's own render
// loop repaints the skill on its next tick.
// `subject` (optional) is the specific thing that changed — a task, a recipe. Some
// queues aren't booleans but Sets of "redraw exactly these", and skipping those is why
// a completed task stayed greyed out: the state was right, the UI just never repainted.
function queueFullRender(skill, subject) {
  const queue = skill?.renderQueue;
  if (!queue) return;

  for (const key of Object.keys(queue)) {
    const value = queue[key];
    if (typeof value === "boolean") queue[key] = true;
    else if (subject !== undefined && value instanceof Set) value.add(subject);
  }
}

// Queue a repaint, then run any explicit render methods (now that their flags are set,
// they'll actually do the work).
function safeRender(skill, methods = []) {
  if (!skill) return;
  queueFullRender(skill);

  for (const method of methods) {
    try {
      skill[method]?.();
    } catch (err) {
      console.warn(`[Shop Requirement Filler] ${method} failed`, err);
    }
  }
}

// --- Cooking ------------------------------------------------------------------

// One <cooking-menu> per category (Fire / Furnace / Pot / whatever unlocks later),
// each with its own selected recipe. Patching setSelectedRecipe hands us the recipe
// directly, so we never have to map a menu back to its category.
function patchCookingMenus(log) {
  const proto = customElements.get("cooking-menu")?.prototype;
  if (!proto) {
    log("cooking-menu is not registered; skipping cooking buttons.");
    return;
  }
  patchAfter(proto, "setSelectedRecipe", function (recipe) {
    this[TARGET_KEY] = recipe;
    ensureCookingButton(this);
  });
}

function ensureCookingButton(menu) {
  const recipe = menu?.[TARGET_KEY];
  const cooking = getGame()?.cooking;
  if (!recipe || !cooking || !menu.requires) return;

  // Priced from the element's CURRENT recipe on each click — the menu is reused when
  // you switch recipes, and the button outlives that.
  const resolveCosts = () => normalizeCosts(cooking.getRecipeCosts(menu[TARGET_KEY]));
  try {
    resolveCosts(); // don't inject a button we can't price
  } catch {
    return;
  }

  attachAmountButton(menu.requires, {
    title: "Add the ingredients to cook this recipe N times",
    resolveCosts,
    refresh: () => safeRender(cooking, ["renderRecipeQuantities", "renderSelectedRecipes"]),
  });
}

// --- Firemaking ---------------------------------------------------------------

function patchFiremakingMenus(log) {
  const logProto = customElements.get("firemaking-log-menu")?.prototype;
  if (!logProto) {
    log("firemaking-log-menu is not registered; skipping firemaking buttons.");
    return;
  }
  patchAfter(logProto, "setLog", function () {
    ensureFiremakingLogButton(this);
  });
}

function ensureFiremakingLogButton(menu) {
  const anchor = menu?.burnButton?.parentElement;
  const firemaking = getGame()?.firemaking;
  if (!anchor || !firemaking) return;

  const resolveCosts = () => normalizeCosts(firemaking.getCurrentRecipeCosts());
  try {
    resolveCosts();
  } catch {
    return; // no log selected yet
  }

  attachAmountButton(anchor, {
    title: "Add logs to burn N times",
    resolveCosts,
    refresh: () => safeRender(firemaking, ["renderLogQuantity", "renderBonfireQuantity", "renderLogInfo"]),
  });
}

// --- Cartography (paper, map creation, map upgrade, refinement) ---------------

// <paper-making-menu> mirrors the artisan menu: a `requires` box and a recipe handed
// to setSelectedRecipe. getPaperMakingCosts(recipe) returns a Costs.
// Tab 2 is <map-upgrade-menu> (create a map for a dig site, then upgrade it) and
// tab 3 is <map-refinement-menu>.
function patchCartographyMenus(log) {
  const paperProto = customElements.get("paper-making-menu")?.prototype;
  if (!paperProto) {
    log("paper-making-menu is not registered; skipping cartography buttons.");
    return;
  }
  patchAfter(paperProto, "setSelectedRecipe", function (recipe) {
    this[TARGET_KEY] = recipe;
    ensurePaperButton(this);
  });

  const upgradeProto = customElements.get("map-upgrade-menu")?.prototype;
  if (upgradeProto) {
    patchAfter(upgradeProto, "setDigSite", function (digSite) {
      this[DIG_SITE_KEY] = digSite;
      ensureMapCreationButton(this);
    });
    patchAfter(upgradeProto, "setDigSiteMap", function (map) {
      this[TARGET_KEY] = map;
      ensureMapUpgradeButton(this);
    });
  }

  const refineProto = customElements.get("map-refinement-menu")?.prototype;
  if (refineProto) {
    patchAfter(refineProto, "setDigSiteMap", function (map) {
      this[TARGET_KEY] = map;
      ensureRefinementButton(this);
    });
  }
}

function ensureMapCreationButton(menu) {
  const digSite = menu?.[DIG_SITE_KEY];
  const cartography = getGame()?.cartography;
  // Anchor to the creation-cost row, NOT the button: once a map exists the button
  // sits in the "Select Dig Site Map" picker, where an Add button makes no sense.
  const anchor = menu?.mapCreationCosts;
  if (!digSite || !anchor || !cartography) return;

  const resolveCosts = () => normalizeCosts(cartography.getMapCreationCosts(digSite));
  let costs;
  try {
    costs = resolveCosts();
  } catch {
    return;
  }
  if (costs.items.length === 0 && costs.currencies.length === 0) return; // nothing to create

  attachTopUpButton(anchor, {
    title: "Add the paper/items needed to create this map",
    resolveCosts,
    refresh: () => safeRender(cartography, ["renderMapUpgradeQuantities"]),
  });
}

function ensureMapUpgradeButton(menu) {
  const map = menu?.[TARGET_KEY];
  const anchor = menu?.upgradeButton?.parentElement;
  const cartography = getGame()?.cartography;
  if (!map || !anchor || !cartography) return;

  // Upgrading is repeatable, so this gets the quantity dropdown rather than a top-up.
  attachAmountButton(anchor, {
    title: "Add the items to upgrade this map N times",
    resolveCosts: () => normalizeCosts(cartography.getMapUpgradeCosts(map)),
    refresh: () => safeRender(cartography, ["renderMapUpgradeQuantities"]),
  });
}

function ensureRefinementButton(menu) {
  const map = menu?.[TARGET_KEY];
  const anchor = menu?.newContainer;
  const cartography = getGame()?.cartography;
  if (!map || !anchor || !cartography) return;

  attachTopUpButton(anchor, {
    title: "Add the items needed for the next refinement slot",
    resolveCosts: () => normalizeCosts(cartography.getNextRefinementSlotCost(map)),
    refresh: () => safeRender(cartography, ["renderMapRefinementQuantities"]),
  });
}

function ensurePaperButton(menu) {
  const recipe = menu?.[TARGET_KEY];
  const cartography = getGame()?.cartography;
  if (!recipe || !cartography || !menu.requires) return;

  const resolveCosts = () => normalizeCosts(cartography.getPaperMakingCosts(menu[TARGET_KEY]));
  try {
    resolveCosts();
  } catch {
    return;
  }

  attachAmountButton(menu.requires, {
    title: "Add the logs to make this paper N times",
    resolveCosts,
    refresh: () => safeRender(cartography, ["renderPaperMakingQuantities"]),
  });
}

// --- Firemaking oil -----------------------------------------------------------

// Unlike the log cost, the oil cost isn't a Costs: the recipe carries a plain
// `oilCost` number and the oil itself is firemaking.selectedOil.
function patchFiremakingOilMenu(log) {
  const proto = customElements.get("firemaking-oil-menu")?.prototype;
  if (!proto) {
    log("firemaking-oil-menu is not registered; skipping oil button.");
    return;
  }
  patchAfter(proto, "setOil", function () {
    ensureFiremakingOilButton(this);
  });
}

function ensureFiremakingOilButton(menu) {
  const anchor = menu?.oilButton?.parentElement;
  const firemaking = getGame()?.firemaking;
  if (!anchor || !firemaking) return;

  attachTopUpButton(anchor, {
    title: "Add the oil needed to oil your logs",
    resolveCosts: () => {
      const oil = firemaking.selectedOil;
      const quantity = Math.floor(Number(firemaking.selectedRecipe?.oilCost));
      if (!oil || !Number.isFinite(quantity) || quantity <= 0) return { items: [], currencies: [] };
      return { items: [{ item: oil, quantity }], currencies: [] };
    },
    refresh: () => safeRender(firemaking, ["renderOilQuantities", "renderOilInfo", "renderOilStatus"]),
  });
}

// --- Farming ------------------------------------------------------------------

// The "Plant a Seed" modal. getRecipeSeedCost(recipe) returns a plain NUMBER (the
// modifier-adjusted seed count); the seed item itself lives on recipe.seedCost.
function patchFarmingMenus(log) {
  const seedProto = customElements.get("farming-seed-select")?.prototype;
  if (seedProto) {
    patchAfter(seedProto, "setSelectedRecipe", function (recipe, ...rest) {
      this[TARGET_KEY] = recipe;
      // Remember the args so we can replay this render after topping up — it's what
      // paints "Seeds in Bank", and nothing in the skill's render queue redraws it.
      this[COST_ARGS_KEY] = [recipe, ...rest];
      ensureFarmingSeedButton(this);
    });
  } else {
    log("farming-seed-select is not registered; skipping seed button.");
  }

  const plotProto = customElements.get("locked-farming-plot")?.prototype;
  if (plotProto) {
    patchAfter(plotProto, "setPlot", function (plot) {
      this[TARGET_KEY] = plot;
      ensureFarmingPlotButton(this);
    });
  }
}

function ensureFarmingSeedButton(element) {
  const recipe = element?.[TARGET_KEY];
  const anchor = element?.plantButton?.parentElement;
  const farming = getGame()?.farming;
  if (!recipe || !anchor || !farming) return;

  // Dropdown: one "plant" costs getRecipeSeedCost() seeds, so N funds N plantings.
  attachAmountButton(anchor, {
    title: "Add the seeds to plant this N times",
    resolveCosts: () => {
      // Read the recipe off the element at click time — the modal is reused per seed.
      const selected = element[TARGET_KEY] ?? recipe;
      const item = selected?.seedCost?.item ?? selected?.seedCost;
      const quantity = Math.floor(Number(farming.getRecipeSeedCost(selected)));
      if (!item?.id || !Number.isFinite(quantity) || quantity <= 0) return { items: [], currencies: [] };
      return { items: [{ item, quantity }], currencies: [] };
    },
    refresh: () => {
      safeRender(farming, ["renderSelectedSeed", "renderPlotUnlockQuantities"]);
      replayFarmingSeedRender(element);
    },
  });
}

// "Seeds in Bank" is written by setSelectedRecipe and by nothing in the render queue,
// so replay that render with the args it was last called with (same trick the agility
// cost pills needed). Our own patch re-runs on the replay, but the button injection is
// idempotent, so it just no-ops.
function replayFarmingSeedRender(element) {
  const args = element[COST_ARGS_KEY];
  if (!args) return;
  try {
    element.setSelectedRecipe(...args);
  } catch (err) {
    console.warn("[Shop Requirement Filler] seed quantity refresh failed", err);
  }
}

function ensureFarmingPlotButton(element) {
  const plot = element?.[TARGET_KEY];
  const anchor = element?.unlockButton?.parentElement;
  const farming = getGame()?.farming;
  if (!plot || !anchor || !farming) return;

  attachTopUpButton(anchor, {
    title: "Add the items needed to unlock this plot",
    resolveCosts: () => normalizeCosts(farming.getPlotUnlockCosts(plot)),
    refresh: () => safeRender(farming, ["renderPlotUnlockQuantities", "renderPlotVisibility"]),
  });
}

// --- Township -----------------------------------------------------------------

// Building costs are TownshipResources (their own pool), returned as
// [{resource, quantity}] by getBuildingCostsForBiome(building, biome).
function patchTownshipMenus(log) {
  const proto = customElements.get("building-in-town")?.prototype;
  if (!proto) {
    log("building-in-town is not registered; skipping township buttons.");
    return;
  }

  // setBuilding takes NO arguments (confirmed at runtime), so the element is never
  // handed its building — we identify it by the name it renders instead.
  patchAfter(proto, "setBuilding", function () {
    ensureTownshipButton(this);
  });
  patchAfter(proto, "updateBuildingUpgradeCosts", function () {
    ensureTownshipButton(this);
  });

  // The town is rendered before onInterfaceReady, so also sweep whenever township
  // re-renders (opening the page, changing biome, building something).
  const skillProto = Object.getPrototypeOf(getGame()?.township ?? {});
  for (const method of ["renderBuildingCosts", "onPageChange", "updateForBuildingChange"]) {
    patchAfter(skillProto, method, () => sweepTownshipBuildings());
  }
  sweepTownshipBuildings();
}

function sweepTownshipBuildings() {
  document.querySelectorAll("building-in-town").forEach(ensureTownshipButton);
}

// --- Township tasks -----------------------------------------------------------

// A task's goals live at task.goals.itemGoals — [{ item, quantity }] (e.g. "Give 1
// Leather Gloves to your Town"). You give them from the bank, so this tops up the bank.
function patchTownshipTasks(log) {
  let patched = false;
  for (const tag of ["township-casual-task", "township-task"]) {
    const proto = customElements.get(tag)?.prototype;
    if (typeof proto?.setTask !== "function") continue;

    // setTask takes 2 args and the task isn't necessarily first — pick the one that
    // actually looks like a task.
    patchAfter(proto, "setTask", function (...args) {
      const task = args.find((arg) => arg?.goals);
      if (task) this[TARGET_KEY] = task;
      ensureTaskButton(this);
    });
    patched = true;
  }
  if (!patched) log("no township task elements registered; skipping task buttons.");

  // The task list is rendered before onInterfaceReady and rebuilt as you switch
  // between categories / casual tasks, so re-sweep on every render path.
  const menuProto = customElements.get("township-tasks-menu")?.prototype;
  for (const method of [
    "setCasualTasks",
    "showCasualTasks",
    "showCategoryTasks",
    "showAllCategories",
    "updateCasualTaskGoals",
    "updateTaskGoals",
  ]) {
    if (menuProto) patchAfter(menuProto, method, () => sweepTownshipTasks());
  }
}

// Rather than stocking the bank with what the task wants, mark its goals met — the
// only thing that works for non-item goals like "Defeat 50 Skeletons". The player then
// just clicks Claim Rewards.
function ensureTaskButton(element) {
  const anchor = element?.goalContainer ?? element?.completeButton?.parentElement;
  if (!anchor || !element?.[TARGET_KEY]?.goals) return;

  attachActionButton(anchor, {
    label: "Claim",
    title: "Mark every goal met and claim this task's rewards",
    onClick: (button) => {
      // Read the task off the element at CLICK time: the menu pools and REUSES these
      // elements for different tasks while our button survives, so capturing the task
      // here would leave the button forever completing whichever task came first.
      const task = element[TARGET_KEY];
      if (!task) return;

      const claimed = claimTownshipTask(task);
      refreshTownshipTasks(element, task);
      flash(button, claimed ? "Claimed" : "Failed");
    },
  });
}

// Hand the whole thing to the game's own completeTask, which awards the rewards, marks
// the task completed and updates its own UI.
//
// Two things had to be neutered first (both read straight from the decompiled source):
//   completeTask() gates on `task.goals.checkIfMet()`, a method that RECOMPUTES every
//   goal from the bank/stats — it ignores the `isMet` flags, which is why setting them
//   looked right but completed nothing; and
//   it then calls `goals.removeItemsFromBank()`, which would try to take items the
//   player never actually collected.
// Shadow both on the instance for the duration of the call, then restore the prototype
// methods. Casual tasks go through the same path (their completeTask gates on
// isTaskComplete -> checkIfMet), so one route covers both.
function claimTownshipTask(task) {
  const township = getGame()?.township;
  const goals = task?.goals;
  if (!township || !goals) return false;

  const owner = township.casualTasks?.currentCasualTasks?.includes(task)
    ? township.casualTasks
    : township.tasks;
  if (!owner?.completeTask) return false;

  // Mark the goals met first: onTaskMet increments the "tasks ready" counters, and
  // completeTask decrements them — do neither and the counters drift negative.
  completeTaskGoals(task);

  const hadCheck = Object.prototype.hasOwnProperty.call(goals, "checkIfMet");
  const hadRemove = Object.prototype.hasOwnProperty.call(goals, "removeItemsFromBank");
  goals.checkIfMet = () => true;
  goals.removeItemsFromBank = () => {};

  try {
    owner.completeTask(task);
    return true;
  } catch (err) {
    console.error("[Shop Requirement Filler] completeTask failed", err);
    return false;
  } finally {
    if (!hadCheck) delete goals.checkIfMet;
    if (!hadRemove) delete goals.removeItemsFromBank;
  }
}

// Each goal exposes `isMet` and emits 'metChanged'; the parent goals object counts
// those to decide whether the task is claimable. Flip each goal and fire the event so
// the count updates. Item goals are reversible (they re-check the bank on every bank
// event and would flip straight back), so detach their handler to make it stick.
function completeTaskGoals(task) {
  const goals = task?.goals?.allGoals;
  if (!Array.isArray(goals)) return 0;

  let completed = 0;
  for (const goal of goals) {
    if (goal.isMet) continue;

    goal.isMet = true;
    completed += 1;

    try {
      goal._events?.emit?.("metChanged", true);
    } catch (err) {
      console.warn("[Shop Requirement Filler] goal metChanged failed", err);
    }
    try {
      goal._unassignHandler?.(goal._eventHandler);
    } catch {
      /* nothing to detach */
    }
  }
  return completed;
}

function refreshTownshipTasks(element, task) {
  const township = getGame()?.township;

  try {
    element.updateGoals?.(task);
  } catch {
    /* signature varies; the render queues below still repaint it */
  }

  const menu = document.querySelector("township-tasks-menu");
  for (const method of ["updateCasualTaskGoals", "updateTaskGoals", "updateCasualReady", "updateCategoryReady"]) {
    try {
      menu?.[method]?.(task);
    } catch {
      /* not applicable to this task type */
    }
  }

  // Pass the task itself: the task render queues hold Sets of "redraw exactly these",
  // not plain booleans, so flipping flags alone left the card stale.
  for (const owner of [township?.tasks, township?.casualTasks]) {
    queueFullRender(owner, task);
    try {
      owner?.render?.();
    } catch (err) {
      console.warn("[Shop Requirement Filler] task render failed", err);
    }
  }

  safeRender(township, ["renderTaskReadyIcon"]);
}

// Task elements are built when the tasks page renders, which can predate our patch.
// The menu keeps task<->element maps; the key/value order isn't documented, so accept
// either orientation.
function sweepTownshipTasks() {
  const menu = document.querySelector("township-tasks-menu");
  if (!menu) return;

  const apply = (a, b) => {
    const element = a?.tagName ? a : b?.tagName ? b : undefined;
    if (!element) return;
    const task = element === a ? b : a;
    if (!task?.goals) return;
    element[TARGET_KEY] = task;
    ensureTaskButton(element);
  };

  menu.casualTaskMap?.forEach?.((value, key) => apply(value, key));
  menu.taskMap?.forEach?.((value, key) => apply(value, key));
}

// The <building-in-town> element doesn't store its building, so resolve it from the
// name it displays.
function resolveTownshipBuilding(element) {
  const name = element.buildingName?.textContent?.trim();
  if (!name) return undefined;

  // Re-resolve whenever the card now shows a different building (these elements are
  // reused), otherwise a cached one would price the wrong building forever.
  const cached = element[TARGET_KEY];
  if (cached?.name === name) return cached;

  const buildings = getGame()?.township?.buildings?.allObjects;
  if (!Array.isArray(buildings)) return undefined;

  const building = buildings.find((candidate) => candidate.name === name);
  if (building) element[TARGET_KEY] = building;
  return building;
}

function ensureTownshipButton(element) {
  const township = getGame()?.township;
  const building = resolveTownshipBuilding(element);
  if (!township || !building?.costs) return;

  // Anchor to the cost list, not the button group — the group already holds the
  // qty ("Max") dropdown and our button overlapped it.
  // Most of the ~108 building elements are hidden and price out to nothing in the
  // current biome; a button there would just report "Already have all".
  const buildAnchor = element.upgradesToCosts ?? element.upgradeButtonGroup?.parentElement;
  if (buildAnchor && getTownshipBuildCosts(township, building).length > 0) {
    // A dropdown, not a top-up: the town's qty selector has a "Max" option meaning
    // "as many as you can afford", so topping up to afford ONE build makes Max == 1.
    // Picking N here funds N builds outright, and then Max actually builds N.
    attachAmountButton(buildAnchor, {
      title: "Add the town resources to build/upgrade this N times",
      // Re-resolve the building at click time — the cards are reused across biomes.
      resolveCosts: () =>
        normalizeTownshipCosts(getTownshipBuildCosts(township, resolveTownshipBuilding(element))),
      maxAmount: () => getTownshipRemainingBuilds(element),
      refresh: () => safeRender(township, ["renderBuildingCosts", "renderResourceAmounts"]),
    });
  }

  const repairAnchor = element.repairCosts ?? element.repairButton?.parentElement;
  if (repairAnchor) {
    attachTopUpButton(repairAnchor, {
      title: "Add the town resources needed to repair this building",
      resolveCosts: () => normalizeTownshipCosts(getTownshipRepairCosts(township)),
      refresh: () => safeRender(township, ["renderBuildingCosts", "renderResourceAmounts"]),
    });
  }
}

// getRepairCostInBiomeForBuilding's 2nd argument is NOT a TownshipBiome (it blew up on
// biome.getBuildingEfficiency) and townData has no biome map, so use the biome-wide
// repair total, which is confirmed to return a Map<resource, quantity>. That can cover
// more than this one building, which is harmless for topping up.
// Builds still needed to reach the upgrade threshold, read off the "6 / 20 built until
// Large School" line the card renders (the count isn't exposed on the element itself).
function getTownshipRemainingBuilds(element) {
  const text = element?.upgradesToName?.textContent ?? "";
  const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
  if (!match) return 0;

  const built = Number(match[1].replace(/,/g, ""));
  const target = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(built) || !Number.isFinite(target)) return 0;
  return Math.max(0, target - built);
}

// Cost of ONE build in the current biome. The dropdown multiplies it — deliberately
// ignoring township.upgradeQty, which is -1 ("Max") and would be circular to chase.
function getTownshipBuildCosts(township, building) {
  const biome = township.currentTownBiome;
  if (!building || !biome) return [];
  return toResourceEntries(township.getBuildingCostsForBiome(building, biome));
}

function getTownshipRepairCosts(township) {
  try {
    return toResourceEntries(township.getTotalRepairCostInBiome(township.currentTownBiome));
  } catch {
    return [];
  }
}

// These township cost helpers return either [{resource, quantity}] or a Map.
function toResourceEntries(costs) {
  if (Array.isArray(costs)) return costs;
  if (costs instanceof Map) return Array.from(costs, ([resource, quantity]) => ({ resource, quantity }));
  return [];
}

// --- Astrology stardust ------------------------------------------------------

// <astrology-exploration-panel> owns three arrays of <astrology-modifier-display>
// rows (standard / unique / abyssal) and is handed the constellation via
// setConstellation — the rows themselves don't know which modifier they show, so we
// pair row[i] with constellation.<kind>Modifiers[i] from the panel.
//
// Costs: getAstroModUpgradeCost(constellation, modifier) returns a plain
// { item, quantity } for the NEXT level (Stardust / Golden Stardust are bank items,
// not currencies). modifier.costs is the per-level price table (one entry per level,
// length === maxCount), so the remaining levels are costs[timesBought .. maxCount-1].
function patchAstrologyMenus(log) {
  const proto = customElements.get("astrology-exploration-panel")?.prototype;
  if (!proto) {
    log("astrology-exploration-panel is not registered; skipping stardust buttons.");
    return;
  }

  patchAfter(proto, "setConstellation", function (constellation) {
    this[TARGET_KEY] = constellation;
    ensureAstrologyButtons(this);
  });
  // Re-runs whenever the cost displays are refreshed (e.g. after an upgrade).
  patchAfter(proto, "setUpgradeCosts", function () {
    ensureAstrologyButtons(this);
  });
}

function ensureAstrologyButtons(panel) {
  const constellation = panel?.[TARGET_KEY];
  if (!constellation) return;

  const groups = [
    [panel.standardModifiers, constellation.standardModifiers],
    [panel.uniqueModifiers, constellation.uniqueModifiers],
    [panel.abyssalModifiers, constellation.abyssalModifiers],
  ];

  for (const [rows, modifiers] of groups) {
    if (!Array.isArray(rows) || !Array.isArray(modifiers)) continue;
    // The panel has a fixed number of row slots; a constellation may use fewer.
    rows.forEach((row, index) => {
      const modifier = modifiers[index];
      if (modifier) ensureAstrologyButton(row, constellation, modifier);
    });
  }
}

function ensureAstrologyButton(row, constellation, modifier) {
  const anchor = row?.upgradeButton?.parentElement;
  if (!anchor || anchor.querySelector(`.${MARK}-group`)) return;

  const { group, main } = createMenuButton({
    label: "Add",
    title: "Add the stardust for this upgrade",
    color: "btn-info",
    onClick: () => addAstrologyCost(constellation, modifier, 1, main),
    buildMenu: (close) =>
      buildActionMenu(
        [{ label: "Add max", onSelect: () => addAstrologyCost(constellation, modifier, Infinity, main) }],
        close,
      ),
  });
  anchor.append(group);
}

// Total stardust for the next `levels` upgrades of this modifier (capped at max).
function getAstrologyCosts(constellation, modifier, levels) {
  const astrology = getGame()?.astrology;
  const bought = Number(modifier?.timesBought) || 0;
  const max = Number(modifier?.maxCount) || 0;
  const count = Math.min(levels, Math.max(0, max - bought));
  if (count <= 0) return { items: [], currencies: [] };

  const totals = new Map();
  for (let i = 0; i < count; i += 1) {
    // The next level's price comes from the skill (it applies modifiers); later
    // levels are read straight off the modifier's per-level cost table.
    const cost =
      i === 0 ? astrology?.getAstroModUpgradeCost(constellation, modifier) : modifier.costs?.[bought + i];

    const item = cost?.item;
    const quantity = Math.floor(Number(cost?.quantity));
    if (!item || !Number.isFinite(quantity) || quantity <= 0) continue;
    totals.set(item, (totals.get(item) ?? 0) + quantity);
  }

  return {
    items: Array.from(totals, ([item, quantity]) => ({ item, quantity })),
    currencies: [],
  };
}

function addAstrologyCost(constellation, modifier, levels, button) {
  let costs;
  try {
    costs = getAstrologyCosts(constellation, modifier, levels);
  } catch (err) {
    console.error("[Shop Requirement Filler] could not read stardust cost", err);
    flash(button, "Failed");
    return;
  }

  if (costs.items.length === 0) {
    flash(button, "Maxed");
    return;
  }

  const { types } = addMissingCosts(costs);
  refreshAstrology();
  flash(button, types > 0 ? "Added" : "Already have");
}

// The astrology screen doesn't react to bank changes on its own.
function refreshAstrology() {
  const astrology = getGame()?.astrology;
  for (const render of ["renderStardustQuantities", "renderUpgradeCosts"]) {
    try {
      astrology?.[render]?.();
    } catch (err) {
      console.warn(`[Shop Requirement Filler] astrology ${render} failed`, err);
    }
  }
}

// --- Artisan ("crafting") skills ---------------------------------------------

// Smithing, Fletching, Crafting, Runecrafting, Herblore and Summoning all render an
// <artisan-menu> (Herblore subclasses it) reachable as `skill.menu`, and all expose
// getCurrentRecipeCosts() -> Costs for the selected recipe, already reduced by cost
// modifiers. We hang a quantity dropdown off the menu's "Requires:" box.
const artisanSkillByMenu = new Map();

function patchArtisanMenus(log) {
  const game = getGame();
  if (!game?.skills?.allObjects) return;

  for (const skill of game.skills.allObjects) {
    if (typeof skill.getCurrentRecipeCosts !== "function") continue;

    let menu;
    try {
      // `menu` is a getter and throws on skills that never built one.
      menu = skill.menu;
    } catch {
      continue;
    }
    if (!isArtisanMenu(menu)) continue;

    artisanSkillByMenu.set(menu, skill);
    ensureArtisanButton(menu, skill);
  }

  // Re-inject when the selected recipe changes and the box is re-rendered.
  const proto = customElements.get("artisan-menu")?.prototype;
  if (!proto) {
    log("artisan-menu is not registered; skipping the crafting dropdown.");
    return;
  }
  patchAfter(proto, "setIngredients", function () {
    const skill = artisanSkillByMenu.get(this);
    if (skill) ensureArtisanButton(this, skill);
  });
}

function isArtisanMenu(menu) {
  return Boolean(menu?.tagName?.toLowerCase?.().includes("artisan-menu") && menu.requires);
}

function ensureArtisanButton(menu, skill) {
  attachAmountButton(menu.requires, {
    title: "Add the materials to craft the selected recipe N times",
    resolveCosts: () => normalizeCosts(skill.getCurrentRecipeCosts()),
    refresh: () => refreshArtisanMenu(menu, skill),
  });
}

// Nudge the "You Have:" box, which doesn't reliably react to bank changes on its own.
function refreshArtisanMenu(menu, skill) {
  safeRender(skill);
  try {
    menu.updateQuantities(getGame());
  } catch (err) {
    console.warn("[Shop Requirement Filler] artisan quantity refresh failed", err);
  }
}

// --- Dropdown menu widget ----------------------------------------------------

// Modelled on the shop's "Buy x1,000 ▾" menu.
//
// The menu is portaled to <body> rather than nested in the game card on purpose:
// the click guard swallows every event inside an injected control (it has to, or
// the card's capture-phase handler fires), which would stop the number input from
// ever taking focus. Outside the card there's no handler to beat, so the menu's own
// listeners work normally.

let openMenu; // only one menu open at a time

function closeOpenMenu() {
  if (!openMenu) return;
  openMenu.cleanup();
  openMenu.element.remove();
  openMenu = undefined;
}

// `onClick` optional: with it you get a split button (action + caret), without it
// the whole button just opens the menu.
function createMenuButton({ label, title, color = "btn-success", onClick, buildMenu }) {
  const group = document.createElement("div");
  group.className = `${MARK}-group ${UI_CLASS}`;

  const main = document.createElement("button");
  main.type = "button";
  main.className = `btn btn-sm ${color} ${BUTTON_CLASS}`;
  main.textContent = onClick ? label : `${label} ▾`;
  if (title) main.title = title;
  group.append(main);

  if (onClick) {
    main[ACTION_KEY] = () => onClick(main);

    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = `btn btn-sm ${color} ${MARK}-caret`;
    caret.textContent = "▾";
    caret[ACTION_KEY] = () => toggleMenu(group, caret, buildMenu);
    group.append(caret);
  } else {
    main[ACTION_KEY] = () => toggleMenu(group, main, buildMenu);
  }

  return { group, main };
}

function toggleMenu(owner, anchor, buildMenu) {
  if (openMenu?.owner === owner) {
    closeOpenMenu();
    return;
  }
  closeOpenMenu();

  const menu = document.createElement("div");
  menu.className = `${MARK}-menu`;
  menu.append(buildMenu(closeOpenMenu));
  document.body.append(menu);
  positionMenu(menu, anchor);

  const onPointerDown = (event) => {
    if (menu.contains(event.target) || owner.contains(event.target)) return;
    closeOpenMenu();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closeOpenMenu();
  };
  const onReflow = () => closeOpenMenu();

  // Deferred, so the very click that opened the menu doesn't immediately close it.
  setTimeout(() => document.addEventListener("pointerdown", onPointerDown, true), 0);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onReflow, true);
  window.addEventListener("resize", onReflow);

  openMenu = {
    owner,
    element: menu,
    cleanup() {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    },
  };
}

function positionMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = menu;

  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;

  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);

  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;
}

// Preset amounts + a custom-amount field with its own Add button beneath.
// `maxAmount` (optional) is resolved each time the menu opens and, when positive,
// adds a "Max (N)" row at the top.
function buildAmountMenu({ presets = [1, 10, 100, 1000], onPick, maxAmount }, close) {
  const wrap = document.createElement("div");

  if (typeof maxAmount === "function") {
    const max = Math.floor(Number(maxAmount()));
    if (Number.isFinite(max) && max > 0) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `${MARK}-menu-row ${MARK}-menu-max`;
      row.textContent = `Max (${formatQty(max)})`;
      row.addEventListener("click", () => {
        close();
        onPick(max);
      });
      wrap.append(row);

      const divider = document.createElement("div");
      divider.className = `${MARK}-menu-divider`;
      wrap.append(divider);
    }
  }

  for (const amount of presets) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `${MARK}-menu-row`;
    row.textContent = `x${formatQty(amount)}`;
    row.addEventListener("click", () => {
      close();
      onPick(amount);
    });
    wrap.append(row);
  }

  const divider = document.createElement("div");
  divider.className = `${MARK}-menu-divider`;
  wrap.append(divider);

  const label = document.createElement("div");
  label.className = `${MARK}-menu-label`;
  label.textContent = "Custom Amount:";
  wrap.append(label);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.placeholder = "100";
  input.className = `form-control ${MARK}-menu-input`;
  wrap.append(input);

  const add = document.createElement("button");
  add.type = "button";
  add.className = `btn btn-sm btn-success ${MARK}-menu-add`;
  add.textContent = "Add";
  add.addEventListener("click", () => {
    const amount = Math.floor(Number(input.value));
    if (!Number.isFinite(amount) || amount <= 0) {
      input.focus();
      return;
    }
    close();
    onPick(amount);
  });
  wrap.append(add);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") add.click();
  });

  return wrap;
}

// Plain list of labelled actions (used by astrology's "Add max").
function buildActionMenu(actions, close) {
  const wrap = document.createElement("div");
  for (const { label, onSelect } of actions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `${MARK}-menu-row`;
    row.textContent = label;
    row.addEventListener("click", () => {
      close();
      onSelect();
    });
    wrap.append(row);
  }
  return wrap;
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
    let items = 0;
    let currencies = 0;
    const CHUNK = 20;
    for (let i = 0; i < list.length; i += CHUNK) {
      for (let j = i; j < Math.min(i + CHUNK, list.length); j += 1) {
        const entry = list[j];
        if (!addEntryToPlayer(entry, quantity)) continue;
        if (entry.kind === "currency") currencies += 1;
        else items += 1;
      }
      if (i + CHUNK < list.length) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    add.disabled = false;

    // Break the count out by kind: if currency silently fails, it shows up here
    // rather than being hidden inside a generic "N entries".
    const parts = [];
    if (items > 0) parts.push(`${items} item${items === 1 ? "" : "s"}`);
    if (currencies > 0) parts.push(`${currencies} currenc${currencies === 1 ? "y" : "ies"}`);
    notify(
      parts.length > 0
        ? `✓ Added ${formatQty(quantity)} × ${parts.join(" + ")}`
        : "Nothing could be added — check the console",
    );

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

  // Currencies FIRST: there are ~3,400 items and the grid only renders RENDER_CAP
  // cells, so appending the 5 currencies at the end left them off the "All categories"
  // view entirely — they were unreachable unless you filtered to Currency.
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
  try {
    if (entry.kind === "currency") {
      if (typeof entry.ref?.add !== "function") {
        console.error("[Shop Requirement Filler] currency has no add():", entry.name, entry.ref);
        return false;
      }
      const before = Number(entry.ref.amount);
      entry.ref.add(quantity);
      const after = Number(entry.ref.amount);
      if (after === before) {
        console.error(
          `[Shop Requirement Filler] ${entry.name}.add(${quantity}) did nothing (still ${after})`,
          entry.ref,
        );
      }
      return true;
    }

    // addItem(item, quantity, logLost, found, ignoreSpace, notify)
    // notify:false — a per-item toast is what made bulk adds freeze the game for
    // seconds; we show a single summary toast instead.
    getGame()?.bank?.addItem(entry.ref, quantity, false, false, true, false);
    return true;
  } catch (err) {
    console.error(`[Shop Requirement Filler] failed to add ${entry?.kind} "${entry?.name}"`, err);
    return false;
  }
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

    .${MARK}-group {
      display: inline-flex;
      align-self: center;
      vertical-align: middle;
    }
    .${MARK}-group .${BUTTON_CLASS} { margin-right: 0; }
    .${MARK}-caret {
      align-self: center;
      border-left: 1px solid rgba(0, 0, 0, 0.25);
      border-bottom-left-radius: 0;
      border-top-left-radius: 0;
      font-size: 11px;
      line-height: 1;
      padding: 3px 6px;
    }
    .${MARK}-group .${BUTTON_CLASS}:not(:only-child) {
      border-bottom-right-radius: 0;
      border-top-right-radius: 0;
    }

    .${MARK}-artisan-actions,
    .${MARK}-actions {
      margin-top: 6px;
      text-align: center;
    }
    .${MARK}-artisan-actions .${BUTTON_CLASS},
    .${MARK}-actions .${BUTTON_CLASS} { margin-left: 0; }

    .${MARK}-menu {
      position: fixed;
      z-index: 100003;
      min-width: 160px;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      background: var(--bs-body-bg, #2d2f36);
      color: var(--bs-body-color, #cfd2da);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .${MARK}-menu-row {
      display: block;
      width: 100%;
      padding: 6px 10px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
      text-align: left;
    }
    .${MARK}-menu-row:hover { background: rgba(255, 255, 255, 0.1); }
    .${MARK}-menu-divider {
      margin: 6px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }
    .${MARK}-menu-label {
      padding: 0 10px 4px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0.8;
    }
    .${MARK}-menu-input {
      width: 100%;
      margin-bottom: 6px;
    }
    .${MARK}-menu-add {
      width: 100%;
      font-weight: 600;
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
