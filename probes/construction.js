// PROBE: Construction (modded skill) — rooms, buildings, build costs.
//
// Run this in the browser console with the CONSTRUCTION page OPEN. A building card
// showing "Costs Remaining / You Have: / Build" is ideal, but not required: every
// property read here is guarded, so a getter that throws ("none is selected") is
// reported instead of aborting the probe.
//
// If the console refuses to paste, type `allow pasting` (typed, not pasted) + Enter first.
// The result is printed AND copied to your clipboard.

(() => {
  const lines = [];
  const add = (...parts) => lines.push(parts.join(""));
  const names = (obj) => {
    try {
      return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).join(", ");
    } catch {
      return "-";
    }
  };
  // Every read goes through this: mod skills use throwing getters for "nothing selected".
  const get = (obj, key) => {
    try {
      return { ok: true, value: obj[key] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };
  const label = (v) => (v && (v.name || v.id)) || String(v);

  // 0. Find the game object. `game.skills` came back undefined once, so don't trust the
  //    bare name: check it looks right, and otherwise hunt for the real one (a shadowed
  //    `game`, or the game living in an iframe, would both look like this).
  //    On the STEAM build the page is a shell and the game runs inside an <iframe>, so in
  //    the top frame `window.game` is the IFRAME ELEMENT, not the game. Select
  //    "game (index_game.php)" in the console's context dropdown and run it there.
  const looksLikeGame = (g) => Boolean(g && g.skills && g.skills.allObjects && g.bank);

  // The bare name is the one that resolves inside the game frame; window.game is the decoy.
  let G;
  try {
    if (looksLikeGame(game)) G = game;
  } catch {
    /* not in scope */
  }
  if (!G && looksLikeGame(window.game)) G = window.game;

  if (!G) {
    add("=== GAME LOOKUP ===");
    add("window.game: typeof=", typeof window.game, " ctor=", window.game?.constructor?.name);
    if (window.game?.tagName === "IFRAME") {
      add("!! You are in the TOP frame — the game runs inside this iframe (src=", window.game.src, ").");
      add("!! Switch the Console's context dropdown (top-left, currently 'top') to");
      add("!! 'game (index_game.php)' and run this probe again.");
    }

    const found = Object.getOwnPropertyNames(window).find((k) => {
      try {
        return looksLikeGame(window[k]);
      } catch {
        return false;
      }
    });
    if (found) {
      add("FOUND a game-shaped object at window.", found);
      G = window[found];
    }
  }

  if (!G) {
    const text = lines.join("\n");
    console.log(text);
    copy(text);
    return "copied to clipboard";
  }

  // 1. The skill itself. It's mod-registered, so find it by name rather than game.construction.
  const skill = G.skills.allObjects.find(
    (s) =>
      (s.name || "").toLowerCase().includes("construction") ||
      (s.id || "").toLowerCase().includes("construction"),
  );

  add("=== SKILL ===");
  if (!skill) {
    add("NO construction skill. ALL: ", G.skills.allObjects.map((s) => `${s.name} [${s.id}]`).join(" | "));
  } else {
    add("name = ", skill.name, "  id = ", skill.id, "  ctor = ", skill.constructor.name);
    add("OWN PROPS: ", Object.keys(skill).join(", "));
    add("PROTO: ", names(skill));
    add("renderQueue keys: ", Object.keys(get(skill, "renderQueue").value || {}).join(", "));

    // 2. EVERY prototype accessor — this is where the selection lives, and which ones
    //    throw when nothing is selected (that's the error you hit).
    add("=== ACCESSORS (prototype getters) ===");
    const proto = Object.getPrototypeOf(skill);
    for (const key of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, key);
      if (!d || !d.get) continue;
      const r = get(skill, key);
      if (!r.ok) {
        add("  ", key, " THROWS: ", r.error);
        add("    getter src: ", d.get.toString().slice(0, 300));
      } else {
        const v = r.value;
        const kind = v && v.constructor ? v.constructor.name : typeof v;
        add("  ", key, " = ", label(v), " [", kind, "]");
        if (v && typeof v === "object" && /building|room|recipe|structure/i.test(key)) {
          add("    KEYS: ", Object.keys(v).join(", "));
          add("    PROTO: ", names(v));
        }
      }
    }

    // 3. Registries of buildable things, so a card can be resolved back to its game object.
    add("=== REGISTRIES ===");
    for (const key of Object.keys(skill)) {
      const value = get(skill, key).value;
      const objs = value && value.allObjects;
      if (!Array.isArray(objs) || objs.length === 0) continue;
      const first = objs[0];
      add("--- skill.", key, " (", objs.length, ") first = ", label(first), " [", first.constructor.name, "]");
      add("    KEYS: ", Object.keys(first).join(", "));
      add("    PROTO: ", names(first));
      add("    DUMP: ", JSON.stringify(first, (k, v) => (v && v.id ? v.id : v)).slice(0, 500));
    }

    // 4. THE important bit: the cost API. Dump the source so we call the modifier-aware
    //    getter with the right args instead of adding a raw base cost.
    const costish = Object.getOwnPropertyNames(proto).filter((n) => {
      const d = Object.getOwnPropertyDescriptor(proto, n);
      if (!d || typeof d.value !== "function") return false;
      const x = n.toLowerCase();
      return x.includes("cost") || x.includes("build") || x.includes("remaining") || x.includes("progress");
    });
    add("=== COST/BUILD METHODS ===");
    add(costish.join(", "));
    for (const n of costish) {
      add("----- ", n, " (arity ", skill[n].length, ") -----");
      add(skill[n].toString().slice(0, 1000));
    }

    // 5. Price whatever IS selected, through every 0/1-arg cost method.
    const selected = ["selectedBuilding", "activeBuilding", "selectedRecipe", "activeRecipe", "selectedRoom"]
      .map((k) => get(skill, k).value)
      .find(Boolean);
    add("=== PRICING selected = ", label(selected), " ===");
    for (const n of costish) {
      if (typeof skill[n] !== "function" || skill[n].length > 1) continue;
      try {
        const c = skill[n].length === 0 ? skill[n]() : selected && skill[n](selected);
        if (!c) continue;
        add("  ", n, "() -> ", c.constructor.name);
        if (typeof c.getItemQuantityArray === "function") {
          add("    items: ", JSON.stringify(c.getItemQuantityArray().map((e) => [e.item.name, e.quantity])));
          add("    curr:  ", JSON.stringify(c.getCurrencyQuantityArray().map((e) => [e.currency.name, e.quantity])));
        } else {
          add("    raw: ", JSON.stringify(c, (k, v) => (v && v.id ? v.id : v)).slice(0, 400));
        }
      } catch (e) {
        add("  ", n, "() ERR: ", e.message);
      }
    }
  }

  // 6. The UI: which custom elements make up the card, what they hold (anchor for the
  //    button) and which method hands them their building (that's what we patch).
  add("=== ELEMENTS ===");
  const tags = new Set();
  document.querySelectorAll("*").forEach((el) => {
    const t = el.tagName.toLowerCase();
    if (t.includes("-") && /construct|room|building|structure|furniture|mobilia/.test(t)) tags.add(t);
  });
  if (tags.size === 0) {
    document.querySelectorAll("*").forEach((el) => {
      const t = el.tagName.toLowerCase();
      if (t.includes("-") && el.offsetParent) tags.add(t);
    });
    add("(no construction-ish tag matched; dumping every VISIBLE custom tag instead)");
  }
  add("TAGS: ", Array.from(tags).join(", "));

  for (const tag of tags) {
    const el = document.querySelector(tag);
    if (!el) continue;
    add("=== <", tag, "> x", document.querySelectorAll(tag).length, " ===");
    add("CTOR: ", el.constructor.name);
    add("OWN PROPS: ", Object.keys(el).join(", "));
    add("PROTO: ", names(el));
    add("HTML: ", el.outerHTML.slice(0, 700));
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
