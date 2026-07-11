// PROBE 13: read the ACTUAL source of the township task completion methods.
//
// I've now guessed twice at how a task gets completed. Rather than guess a third time,
// dump the real implementations — Function.prototype.toString() gives us the code.
//
// Run from anywhere.

(() => {
  const lines = [];
  const t = game.township;

  const src = (obj, name, label) => {
    const fn = obj && obj[name];
    lines.push("===== " + label + " =====");
    if (typeof fn !== "function") {
      lines.push("  MISSING");
      return;
    }
    lines.push("  arity = " + fn.length);
    lines.push(fn.toString());
  };

  // Regular tasks
  src(t.tasks, "completeTask", "TownshipTasks.completeTask");
  src(t.tasks, "giveTaskRewards", "TownshipTasks.giveTaskRewards");
  src(t.tasks, "onTaskMet", "TownshipTasks.onTaskMet");
  src(t.tasks, "notifyTaskComplete", "TownshipTasks.notifyTaskComplete");

  // Casual tasks
  src(t.casualTasks, "completeTask", "TownshipCasualTasks.completeTask");
  src(t.casualTasks, "isTaskComplete", "TownshipCasualTasks.isTaskComplete");
  src(t.casualTasks, "onTaskMet", "TownshipCasualTasks.onTaskMet");

  // How is "met" actually read? The goals object had no getters, but the GOAL might.
  const task = t.tasks.tasks.allObjects[0];
  const goal = task.goals.allGoals[0];
  lines.push("===== goal =====");
  lines.push("goal ctor = " + goal.constructor.name);
  lines.push("goal PROTO = " + Object.getOwnPropertyNames(Object.getPrototypeOf(goal)).join(", "));
  for (const key of ["isMet", "progress", "noEventsHandled"]) {
    const d =
      Object.getOwnPropertyDescriptor(goal, key) ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(goal), key);
    lines.push("  " + key + ": own=" + Boolean(Object.getOwnPropertyDescriptor(goal, key)) +
      " getter=" + Boolean(d && d.get) + " value=" + (d && "value" in d ? d.value : "(accessor)"));
    if (d && d.get) lines.push("    getter src: " + d.get.toString());
  }

  // What tracks completion?
  lines.push("===== completion state =====");
  lines.push("tasks.completedTasks = " + (t.tasks.completedTasks && t.tasks.completedTasks.constructor.name) +
    " size=" + (t.tasks.completedTasks && t.tasks.completedTasks.size));
  lines.push("tasks._totalTasksReady = " + t.tasks._totalTasksReady);
  lines.push("tasks.renderQueue keys = " + Object.keys(t.tasks.renderQueue || {}).join(", "));
  for (const k of Object.keys(t.tasks.renderQueue || {})) {
    const v = t.tasks.renderQueue[k];
    lines.push("  renderQueue." + k + " = " + (v instanceof Set ? "Set(" + v.size + ")" : typeof v + " " + v));
  }

  const text = lines.join("\n");
  console.log(text);
  copy(text);
  return "copied to clipboard";
})();
