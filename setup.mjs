const MOD_ID = "shop-requirement-filler";
const BUTTON_CLASS = `${MOD_ID}-button`;
const BUTTON_HOST_CLASS = `${MOD_ID}-host`;
const PURCHASE_PROP = Symbol.for(`${MOD_ID}.purchase`);
const PURCHASE_ID_PROP = Symbol.for(`${MOD_ID}.purchase-id`);

export function setup(ctx) {
  const log = (...args) => console.log("[Shop Requirement Filler]", ...args);

  const runWhenReady = (fn) => {
    const tryRun = () => {
      if (globalThis.game?.bank && document.body) {
        fn();
      } else {
        setTimeout(tryRun, 500);
      }
    };

    if (ctx?.onCharacterLoaded) {
      ctx.onCharacterLoaded(tryRun);
    } else {
      tryRun();
    }
  };

  runWhenReady(() => {
    injectStyles();
    installShopRenderHooks(log);
    installShopObserver(log);
    refreshButtons();
    log("Loaded.");
  });
}

function injectStyles() {
  if (document.getElementById(`${MOD_ID}-styles`)) return;

  const style = document.createElement("style");
  style.id = `${MOD_ID}-styles`;
  style.textContent = `
    .${BUTTON_HOST_CLASS} {
      display: inline-flex;
      margin-left: 4px;
      vertical-align: middle;
    }

    .${BUTTON_CLASS} {
      align-items: center;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      font-size: 11px;
      font-weight: 600;
      justify-content: center;
      line-height: 1;
      min-height: 24px;
      padding: 4px 7px;
      white-space: nowrap;
    }
  `;
  document.head.append(style);
}

function installShopRenderHooks(log) {
  const constructors = [
    globalThis.ShopMenu,
    globalThis.ShopMenuElement,
    globalThis.ShopPurchaseElement,
    globalThis.ShopUpgradeChainElement,
  ].filter(Boolean);

  const methodNames = [
    "updateForCost",
    "updateForBuyQty",
    "updatePurchase",
    "updateForItem",
    "setPurchase",
    "setShopPurchase",
    "setUpgrade",
    "setData",
    "render",
    "update",
  ];

  let patched = 0;
  for (const constructor of constructors) {
    const proto = constructor?.prototype;
    if (!proto) continue;

    for (const methodName of methodNames) {
      const original = proto[methodName];
      if (typeof original !== "function" || original[MOD_ID]) continue;

      proto[methodName] = function patchedShopRenderMethod(...args) {
        capturePurchaseReference(this, args);
        const result = original.apply(this, args);
        queueMicrotask(refreshButtons);
        return result;
      };
      proto[methodName][MOD_ID] = true;
      patched += 1;
    }
  }

  if (patched === 0) {
    log("No known shop render methods found; using DOM observer only.");
  }
}

function installShopObserver(log) {
  if (globalThis[`${MOD_ID}Observer`]) return;

  const observer = new MutationObserver(() => refreshButtons());
  observer.observe(document.body, { childList: true, subtree: true });
  globalThis[`${MOD_ID}Observer`] = observer;
  log("Watching shop DOM for rows to decorate.");
}

function capturePurchaseReference(element, args) {
  const candidates = [
    ...args,
    element.purchase,
    element.shopPurchase,
    element.upgrade,
    element.data,
    element._purchase,
  ];

  const purchase = candidates.find(isShopPurchaseLike);
  if (!purchase) return;

  element[PURCHASE_ID_PROP] = purchase.id ?? purchase.localID ?? purchase.name ?? "";
  element[PURCHASE_PROP] = purchase;
}

function refreshButtons() {
  const hosts = findPotentialShopHosts();
  for (const host of hosts) {
    if (host.querySelector(`.${BUTTON_CLASS}`)) continue;

    const purchase = resolvePurchaseForHost(host);
    if (!purchase) continue;

    const costs = getItemCosts(purchase);
    if (costs.length === 0) continue;

    const buttonHost = document.createElement("span");
    buttonHost.className = BUTTON_HOST_CLASS;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-sm btn-success ${BUTTON_CLASS}`;
    button.textContent = "Add items";
    button.title = "Add missing required item costs to your bank";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addMissingItems(purchase);
    });

    buttonHost.append(button);
    findButtonAnchor(host)?.append(buttonHost);
  }
}

function findPotentialShopHosts() {
  const elements = Array.from(document.querySelectorAll("*"));
  return elements.filter((element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.querySelector(`.${BUTTON_CLASS}`)) return false;
    if (resolvePurchaseForHost(element)) return true;

    const tag = element.tagName.toLowerCase();
    const classes = String(element.className || "").toLowerCase();
    return tag.includes("shop") || classes.includes("shop");
  });
}

function findButtonAnchor(host) {
  return (
    host.querySelector(".btn-group") ||
    Array.from(host.querySelectorAll("button")).at(-1)?.parentElement ||
    host
  );
}

function resolvePurchaseForHost(host) {
  let current = host;
  while (current && current instanceof HTMLElement) {
    const direct = current[PURCHASE_PROP] ?? scanElementForPurchase(current);
    if (isShopPurchaseLike(direct)) return direct;

    const id = current[PURCHASE_ID_PROP];
    const found = id ? findPurchaseById(id) : undefined;
    if (found) return found;

    current = current.parentElement;
  }

  return undefined;
}

function scanElementForPurchase(element) {
  for (const key of ["purchase", "shopPurchase", "upgrade", "data", "_purchase"]) {
    const value = element[key];
    if (isShopPurchaseLike(value)) {
      element[PURCHASE_PROP] = value;
      return value;
    }
  }

  return undefined;
}

function findPurchaseById(id) {
  const shop = globalThis.game?.shop;
  const collections = [
    shop?.purchases,
    shop?.upgrades,
    shop?.upgradeChains,
    globalThis.shopPurchases,
  ].filter(Boolean);

  for (const collection of collections) {
    const values = getCollectionValues(collection);
    const match = values.find((purchase) => {
      return String(purchase?.id ?? purchase?.localID ?? purchase?.name ?? "") === String(id);
    });
    if (match) return match;
  }

  return undefined;
}

function getCollectionValues(collection) {
  if (Array.isArray(collection)) return collection;
  if (collection instanceof Map) return Array.from(collection.values());
  if (typeof collection.allObjects === "object") return Array.from(collection.allObjects);
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection === "object") return Object.values(collection);
  return [];
}

function isShopPurchaseLike(value) {
  if (!value || typeof value !== "object") return false;
  return getItemCosts(value).length > 0;
}

function getItemCosts(purchase) {
  const costSources = [
    purchase.costs,
    purchase.cost,
    purchase.currentCosts,
    purchase.requirements,
    purchase.purchaseRequirements,
    purchase.itemCosts,
    purchase.items,
  ].filter(Boolean);

  const itemCosts = [];
  for (const source of costSources) {
    collectItemCosts(source, itemCosts);
  }

  const merged = new Map();
  for (const cost of itemCosts) {
    if (!cost.item || !Number.isFinite(cost.quantity) || cost.quantity <= 0) continue;
    merged.set(cost.item, (merged.get(cost.item) ?? 0) + Math.floor(cost.quantity));
  }

  return Array.from(merged, ([item, quantity]) => ({ item, quantity }));
}

function collectItemCosts(source, output) {
  if (!source) return;

  if (Array.isArray(source)) {
    for (const value of source) collectItemCosts(value, output);
    return;
  }

  if (source instanceof Map) {
    for (const [item, quantity] of source) {
      if (isItemLike(item)) output.push({ item, quantity: Number(quantity) });
    }
    return;
  }

  if (source.item && source.quantity !== undefined) {
    output.push({ item: source.item, quantity: Number(source.quantity) });
    return;
  }

  if (source.item && source.qty !== undefined) {
    output.push({ item: source.item, quantity: Number(source.qty) });
    return;
  }

  if (source.items) {
    collectItemCosts(source.items, output);
  }

  if (source.itemCosts) {
    collectItemCosts(source.itemCosts, output);
  }
}

function isItemLike(value) {
  return Boolean(value && typeof value === "object" && (value.id || value.localID || value.name));
}

function addMissingItems(purchase) {
  const bank = globalThis.game?.bank;
  if (!bank) return;

  let added = 0;
  for (const { item, quantity } of getItemCosts(purchase)) {
    const owned = getBankQuantity(item);
    const missing = Math.max(0, quantity - owned);
    if (missing === 0) continue;

    addItemToBank(item, missing);
    added += missing;
  }

  showToast(
    added > 0
      ? `Added ${formatQuantity(added)} missing shop item cost(s).`
      : "You already have the required item costs."
  );
}

function formatQuantity(value) {
  if (typeof globalThis.formatNumber === "function") return globalThis.formatNumber(value);
  return Number(value).toLocaleString();
}

function getBankQuantity(item) {
  const bank = globalThis.game?.bank;
  if (!bank) return 0;

  if (typeof bank.getQty === "function") return Number(bank.getQty(item)) || 0;
  if (typeof bank.getQuantity === "function") return Number(bank.getQuantity(item)) || 0;
  if (typeof bank.getItemQuantity === "function") return Number(bank.getItemQuantity(item)) || 0;

  const bankItem = bank.items?.get?.(item) ?? bank.items?.get?.(item.id);
  return Number(bankItem?.quantity ?? bankItem?.qty ?? 0) || 0;
}

function addItemToBank(item, quantity) {
  const bank = globalThis.game?.bank;
  if (typeof bank.addItem === "function") {
    bank.addItem(item, quantity, false, true, true);
  } else if (typeof bank.addItemByID === "function") {
    bank.addItemByID(item.id, quantity, false, true, true);
  }
}

function showToast(message) {
  if (typeof globalThis.notifyPlayer === "function") {
    globalThis.notifyPlayer(globalThis.game?.shop, message, "success");
  } else if (typeof globalThis.createToast === "function") {
    globalThis.createToast("Shop Requirement Filler", message, "success");
  } else {
    console.log(`[Shop Requirement Filler] ${message}`);
  }
}
