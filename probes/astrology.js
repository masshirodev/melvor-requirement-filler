// PROBE: Astrology constellation modifier rows
//
// Run this in the browser console with a CONSTELLATION OPEN — the screen showing
// the modifier rows with the stardust upgrade buttons (the "✨ 10" / "✨ 50" ones).
//
// If the console refuses to paste, type `allow pasting` (typed, not pasted) + Enter first.
// The result is printed AND copied to your clipboard.

(() => {
  const lines = [];

  // 1. Which custom elements on screen belong to the astrology UI?
  const tags = new Set();
  document.querySelectorAll("*").forEach((el) => {
    const t = el.tagName.toLowerCase();
    if (!t.includes("-")) return;
    if (t.includes("astrology") || t.includes("constellation") || t.includes("modifier") || t.includes("star")) {
      tags.add(t);
    }
  });
  lines.push("TAGS: " + Array.from(tags).join(", "));

  // 2. For each: constructor, the props we could anchor a button to, and the
  //    methods we could patch (to inject) / replay (to refresh after adding).
  for (const tag of tags) {
    const el = document.querySelector(tag);
    if (!el) continue;
    lines.push("=== " + tag + " ===");
    lines.push("CTOR: " + el.constructor.name);
    lines.push("OWN PROPS: " + Object.keys(el).join(", "));
    lines.push("PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(el)).join(", "));
    lines.push("HTML: " + el.outerHTML.slice(0, 900));
  }

  // 3. The skill: what's the cost API, and how do we read current/max level?
  const a = game.astrology;
  lines.push("=== ASTROLOGY ===");
  lines.push("CTOR: " + a.constructor.name);
  lines.push(
    "METHODS: " +
      Object.getOwnPropertyNames(Object.getPrototypeOf(a))
        .filter((n) => {
          const x = n.toLowerCase();
          return (
            x.includes("cost") ||
            x.includes("star") ||
            x.includes("modifier") ||
            x.includes("upgrade") ||
            x.includes("buy") ||
            x.includes("level")
          );
        })
        .join(", "),
  );

  // 4. A constellation + one of its modifiers: what shape are they?
  const c = a.actions.allObjects[0];
  lines.push("CONSTELLATION: " + c.name);
  lines.push("CONSTELLATION KEYS: " + Object.keys(c).join(", "));

  const mod = (c.standardModifiers && c.standardModifiers[0]) || null;
  if (mod) {
    lines.push("MODIFIER[0] KEYS: " + Object.keys(mod).join(", "));
    try {
      lines.push("MODIFIER[0] JSON: " + JSON.stringify(mod).slice(0, 500));
    } catch (e) {
      lines.push("MODIFIER[0] JSON: (not serializable) " + e.message);
    }
  }

  // 5. Player-side progress on that constellation (current levels per modifier).
  try {
    const progress = a.actionMastery && a.actionMastery.get(c);
    lines.push("MASTERY: " + (progress ? JSON.stringify(progress) : "none"));
  } catch (e) {
    lines.push("MASTERY ERR: " + e.message);
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
