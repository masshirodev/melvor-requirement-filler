// PROBE 12: why "Complete" does nothing on township tasks.
//
// The mod sets each goal's `isMet = true` and emits 'metChanged' on the goal, expecting
// the parent goals object to count it and light up Claim Rewards. Clearly something in
// that chain isn't the real mechanism. This replicates the mutation on a LIVE casual
// task and reports what actually changed.
//
// Run with the Township TASKS view open (casual tasks visible).
// NOTE: this really does mutate task[0]'s goals.

(() => {
  const lines = [];
  const t = game.township;
  const ct = t.casualTasks;

  lines.push("TownshipCasualTasks PROTO:");
  lines.push("  " + Object.getOwnPropertyNames(Object.getPrototypeOf(ct)).join(", "));
  lines.push("TownshipTasks PROTO:");
  lines.push("  " + Object.getOwnPropertyNames(Object.getPrototypeOf(t.tasks)).join(", "));

  const task = ct.currentCasualTasks[0];
  const goals = task.goals;
  lines.push("--- task[0] ---");
  lines.push("description = " + (task.description || task._description));
  lines.push("goals ctor = " + goals.constructor.name);
  lines.push("goals PROTO = " + Object.getOwnPropertyNames(Object.getPrototypeOf(goals)).join(", "));

  // Is there a computed "all met" anywhere?
  for (const key of ["isMet", "allMet", "complete", "isComplete", "met"]) {
    lines.push("  goals." + key + " = " + goals[key]);
  }

  const state = (label) => {
    lines.push(
      label +
        ": _goalsMet=" + goals._goalsMet +
        "  allGoals.isMet=[" + goals.allGoals.map((g) => g.isMet).join(", ") + "]" +
        "  totalTasksReady=" + ct._totalTasksReady,
    );
    const el = document.querySelector("township-casual-task");
    if (el && el.completeButton) {
      lines.push(
        "  completeButton: disabled=" + el.completeButton.disabled +
          " class='" + el.completeButton.className + "'" +
          " hidden=" + (el.completeButton.offsetParent === null),
      );
    }
  };

  state("BEFORE");

  // --- exactly what the mod does ---
  for (const goal of goals.allGoals) {
    if (goal.isMet) continue;
    goal.isMet = true;
    try {
      goal._events?.emit?.("metChanged", true);
    } catch (e) {
      lines.push("  emit threw: " + e.message);
    }
  }

  state("AFTER mod's mutation");

  // Does the goals object itself have listeners we should be firing instead?
  lines.push("goals._events keys = " + Object.keys(goals._events || {}).join(", "));
  try {
    const ev = goals._events;
    // Peek at the emitter's internal handler map, whatever it's called.
    for (const k of Object.keys(ev)) {
      const v = ev[k];
      if (v instanceof Map) lines.push("  emitter." + k + " = Map keys: " + Array.from(v.keys()).join(", "));
      else if (v && typeof v === "object") lines.push("  emitter." + k + " = " + Object.keys(v).join(", "));
    }
  } catch (e) {
    lines.push("  emitter inspect ERR: " + e.message);
  }

  // Try firing on the GOALS object rather than each goal.
  try {
    goals._events?.emit?.("metChanged", true);
    state("AFTER emitting on goals itself");
  } catch (e) {
    lines.push("goals emit threw: " + e.message);
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
