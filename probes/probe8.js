// PROBE 8: Township tasks (the "Give 0 / 1 Leather Gloves to your Town" goals)
//          + the town's biome data (needed for repair costs).
//
// Run with the Township TASKS view open (casual tasks visible).
// My last probe guessed the wrong property name — the live ones are on
// casualTasks.currentCasualTasks.

(() => {
  const lines = [];
  const t = game.township;

  const dump = (obj, prefix, depth) => {
    if (!obj || typeof obj !== "object") {
      lines.push(prefix + " = " + obj);
      return;
    }
    lines.push(prefix + " ctor = " + (obj.constructor && obj.constructor.name));
    lines.push(prefix + " keys = " + Object.keys(obj).join(", "));
    if (depth <= 0) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object") {
        if (Array.isArray(v)) {
          lines.push(prefix + "." + k + " = Array[" + v.length + "]");
          if (v[0] && typeof v[0] === "object") dump(v[0], prefix + "." + k + "[0]", depth - 1);
          else if (v[0] !== undefined) lines.push(prefix + "." + k + "[0] = " + v[0]);
        } else if (v instanceof Map) {
          lines.push(prefix + "." + k + " = Map(" + v.size + ")");
          const first = v.entries().next().value;
          if (first) {
            lines.push(prefix + "." + k + " key = " + (first[0] && (first[0].name || first[0].constructor.name)));
            lines.push(prefix + "." + k + " val = " + (first[1] && (first[1].name || first[1])));
          }
        } else {
          lines.push(prefix + "." + k + " = " + (v.name || (v.constructor && v.constructor.name)));
        }
      } else {
        lines.push(prefix + "." + k + " = " + v);
      }
    }
  };

  // ---------- CASUAL TASKS ----------
  lines.push("########## CASUAL TASKS ##########");
  const casual = t.casualTasks;
  const current = casual && casual.currentCasualTasks;
  lines.push("currentCasualTasks type = " + (current && current.constructor.name));
  const list = Array.isArray(current) ? current : current && (current.allObjects || Array.from(current));
  lines.push("count = " + (list ? list.length : "?"));

  if (list && list[0]) {
    dump(list[0], "task[0]", 2);
  }

  // ---------- REGULAR TASKS ----------
  lines.push("########## REGULAR TASKS ##########");
  const tasks = t.tasks && t.tasks.tasks;
  lines.push("tasks.tasks type = " + (tasks && tasks.constructor.name));
  const tlist = Array.isArray(tasks) ? tasks : tasks && (tasks.allObjects || Array.from(tasks));
  if (tlist && tlist[0]) dump(tlist[0], "regularTask[0]", 2);

  // ---------- TASK ELEMENTS ----------
  lines.push("########## TASK ELEMENTS ##########");
  const seen = new Set();
  document.querySelectorAll("*").forEach((e) => {
    const tag = e.tagName.toLowerCase();
    if (!tag.includes("task") || seen.has(tag)) return;
    seen.add(tag);
    lines.push("=== <" + tag + "> " + e.constructor.name + " ===");
    lines.push("  PROTO: " + Object.getOwnPropertyNames(Object.getPrototypeOf(e)).join(", "));
    lines.push("  setTask.length = " + (e.setTask ? e.setTask.length : "n/a"));
    for (const k of Object.keys(e)) {
      const v = e[k];
      if (v && v.tagName) lines.push("    ." + k + " = <" + v.tagName.toLowerCase() + ">");
    }
  });

  // ---------- TOWN DATA (for repair costs) ----------
  lines.push("########## TOWN DATA ##########");
  dump(t.townData, "townData", 1);
  lines.push("getTotalRepairCostInBiome exists = " + (typeof t.getTotalRepairCostInBiome === "function"));
  if (typeof t.getTotalRepairCostInBiome === "function") {
    lines.push("getTotalRepairCostInBiome.length = " + t.getTotalRepairCostInBiome.length);
    try {
      const r = t.getTotalRepairCostInBiome(t.currentTownBiome);
      lines.push("  -> " + (r && r.constructor.name) + (r instanceof Map ? " size=" + r.size : ""));
    } catch (e) {
      lines.push("  ERR: " + e.message);
    }
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
