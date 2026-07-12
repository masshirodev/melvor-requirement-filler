// PROBE: the bank's "Upgrade Item" modal.
//
// Run in the game frame's console (context dropdown -> "game (index_game.php)") with the
// UPGRADE ITEM modal OPEN on an upgrade you CANNOT afford (like the Golden Fire Cape one),
// so we can see what the game does with the Upgrade button when the cost isn't met.

(() => {
  const lines = [];
  const add = (...parts) => lines.push(parts.join(""));
  const names = (o) => {
    try {
      return Object.getOwnPropertyNames(Object.getPrototypeOf(o)).join(", ");
    } catch {
      return "-";
    }
  };
  const src = (obj, name) => {
    const proto = obj && Object.getPrototypeOf(obj);
    const d = (proto && (Object.getOwnPropertyDescriptor(proto, name) || {})) || {};
    const fn = d.value || d.get;
    add("----- ", name, d.get ? " (getter)" : ` (arity ${fn ? fn.length : "?"})`, " -----");
    add(fn ? fn.toString().slice(0, 1000) : "  MISSING");
  };
  const dumpCosts = (c, label) => {
    add("  ", label, ": ", c && c.constructor ? c.constructor.name : String(c));
    if (!c || typeof c !== "object") return;
    try {
      if (typeof c.getItemQuantityArray === "function") {
        add("    items: ", JSON.stringify(c.getItemQuantityArray().map((e) => [e.item.name, e.quantity])));
        add("    curr:  ", JSON.stringify(c.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])));
        if (typeof c.checkIfOwned === "function") add("    checkIfOwned(): ", c.checkIfOwned());
      } else {
        add("    KEYS: ", Object.keys(c).join(", "));
        add("    RAW: ", JSON.stringify(c, (k, v) => (v && v.id ? v.id : v)).slice(0, 400));
      }
    } catch (e) {
      add("    ERR: ", e.message);
    }
  };

  // 1. Which custom element is the modal, and what's inside it?
  const tags = new Set();
  document.querySelectorAll("*").forEach((el) => {
    const t = el.tagName.toLowerCase();
    if (t.includes("-") && /upgrade/.test(t)) tags.add(t);
  });
  add("=== TAGS: ", Array.from(tags).join(", ") || "(none matched 'upgrade')");

  for (const tag of tags) {
    const el = document.querySelector(tag);
    if (!el) continue;
    add("=== <", tag, "> x", document.querySelectorAll(tag).length, " (visible: ", Boolean(el.offsetParent), ") ===");
    add("CTOR: ", el.constructor.name);
    add("OWN PROPS: ", Object.keys(el).join(", "));
    add("PROTO: ", names(el));
    // The cost row and the (possibly hidden) upgrade button are what we need to anchor to.
    for (const key of Object.keys(el)) {
      const child = el[key];
      if (!child || !child.tagName) continue;
      if (!/cost|button|quantity|qty|container/i.test(key)) continue;
      add(
        "  ",
        key,
        ": <",
        child.tagName.toLowerCase(),
        ' class="',
        child.className,
        '"> hidden=',
        !child.offsetParent,
        " text=",
        JSON.stringify((child.textContent || "").trim().slice(0, 60)),
      );
    }
    add("HTML: ", el.outerHTML.replace(/\s+/g, " ").slice(0, 1200));
    // What hands this element its upgrade? That's what we patch.
    for (const n of ["setUpgrade", "setItem", "updateQuantities", "setCosts", "setSelected"]) {
      if (Object.getOwnPropertyNames(Object.getPrototypeOf(el)).includes(n)) src(el, n);
    }
  }

  // 2. The upgrade objects themselves + how the bank prices and performs one.
  add("=== BANK ===");
  const bankProto = Object.getPrototypeOf(game.bank);
  add(
    "upgrade-ish methods: ",
    Object.getOwnPropertyNames(bankProto)
      .filter((n) => /upgrade/i.test(n))
      .join(", "),
  );
  for (const n of Object.getOwnPropertyNames(bankProto).filter((n) => /upgrade/i.test(n))) {
    src(game.bank, n);
  }
  add("bank.selectedBankItem: ", game.bank.selectedBankItem && game.bank.selectedBankItem.item.name);

  // 3. An ItemUpgrade: where do the costs live, and are they modifier-aware?
  //    `game.itemUpgrades` doesn't exist — find the registry instead of guessing at it.
  add("=== UPGRADE REGISTRY ===");
  const isUpgrade = (v) => Boolean(v && v.upgradedItem);
  const holdsUpgrades = (v) => {
    try {
      if (v instanceof Map) {
        const first = v.values().next().value;
        return isUpgrade(first) || (Array.isArray(first) && isUpgrade(first[0]));
      }
      if (Array.isArray(v && v.allObjects)) return isUpgrade(v.allObjects[0]);
      return false;
    } catch {
      return false;
    }
  };

  let registry;
  for (const [ownerName, owner] of [
    ["game", game],
    ["game.bank", game.bank],
  ]) {
    for (const key of Object.keys(owner)) {
      let value;
      try {
        value = owner[key];
      } catch {
        continue;
      }
      if (!holdsUpgrades(value)) continue;
      add("FOUND at ", ownerName, ".", key, " -> ", value.constructor.name, " size=", value.size ?? value.allObjects?.length);
      registry = registry || value;
    }
  }
  if (!registry) add("no upgrade registry found on game / game.bank");

  const fromRegistry = () => {
    if (!registry) return undefined;
    const values = registry instanceof Map ? Array.from(registry.values()) : registry.allObjects;
    const first = values && values[0];
    return Array.isArray(first) ? first[0] : first;
  };
  // Prefer the upgrade the OPEN MODAL is showing, so the costs match what's on screen.
  const selected = game.bank.selectedBankItem && game.bank.selectedBankItem.item;
  let upgrade;
  try {
    const forSelected = registry instanceof Map && selected ? registry.get(selected) : undefined;
    upgrade = (Array.isArray(forSelected) ? forSelected[0] : forSelected) || fromRegistry();
  } catch {
    upgrade = fromRegistry();
  }

  add("=== ItemUpgrade ===");
  if (!upgrade) {
    add("none found");
  } else {
    add("upgradedItem: ", upgrade.upgradedItem && upgrade.upgradedItem.name);
    add("KEYS: ", Object.keys(upgrade).join(", "));
    add("PROTO: ", names(upgrade));
    add("itemCosts: ", JSON.stringify((upgrade.itemCosts || []).map((c) => [c.item.name, c.quantity])));
    add("currencyCosts: ", JSON.stringify((upgrade.currencyCosts || []).map((c) => [c.currency.name, c.quantity])));
    add("rootItems: ", JSON.stringify((upgrade.rootItems || []).map((i) => i.name)));
    add("isDowngrade: ", upgrade.isDowngrade);
    // Is there a modifier-aware getter, like the other skills have?
    for (const n of Object.getOwnPropertyNames(bankProto).filter((n) => /cost/i.test(n))) {
      try {
        dumpCosts(game.bank[n](upgrade), `bank.${n}(upgrade)`);
      } catch (e) {
        add("  bank.", n, "(upgrade) ERR: ", e.message);
      }
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
