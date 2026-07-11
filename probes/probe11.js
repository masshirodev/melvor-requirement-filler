// PROBE 11: why the Item Adder doesn't add player currency (GP / Slayer Coins / ...).
//
// The mod does `currency.add(qty)`, which is the same call the shop/agility buttons
// use successfully — so either the currency list is wrong, or .add() isn't what I think.
// This dumps the list and then actually calls .add(1234) on GP to see if it moves.
//
// Run from anywhere. NOTE: this really does give you 1234 GP.

(() => {
  const lines = [];
  const reg = game.currencies;

  lines.push("game.currencies = " + (reg ? reg.constructor.name : "MISSING"));
  const all = reg && reg.allObjects;
  lines.push("allObjects isArray = " + Array.isArray(all) + "  length = " + (all ? all.length : "-"));

  (all || []).forEach((c) => {
    lines.push(
      "  " +
        c.name +
        "  id=" + c.id +
        "  ctor=" + c.constructor.name +
        "  amount=" + c.amount +
        "  add=" + typeof c.add +
        "  media=" + Boolean(c.media),
    );
  });

  // What the mod's own accessor would produce.
  lines.push("--- mod's getAllCurrencies() equivalent ---");
  const modList = Array.isArray(all)
    ? all
    : [game.gp, game.slayerCoins, game.raidCoins, game.abyssalPieces, game.abyssalSlayerCoins].filter(
        (c) => c && typeof c.add === "function",
      );
  lines.push("count = " + modList.length + " :: " + modList.map((c) => c.name).join(", "));

  // Does .add() actually work?
  const gp = game.gp;
  lines.push("--- live test on GP ---");
  lines.push("gp ctor = " + gp.constructor.name);
  lines.push("gp PROTO = " + Object.getOwnPropertyNames(Object.getPrototypeOf(gp)).join(", "));
  const before = gp.amount;
  try {
    gp.add(1234);
    lines.push("gp.add(1234): before=" + before + "  after=" + gp.amount + "  => " + (gp.amount > before ? "WORKS" : "NO EFFECT"));
  } catch (e) {
    lines.push("gp.add THREW: " + e.message);
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
