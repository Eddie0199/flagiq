const debugToolsEnv = String(process.env.REACT_APP_DEBUG_TOOLS || "").toLowerCase();
const hiddenDebuggerEnv = String(
  process.env.REACT_APP_HIDDEN_DEBUGGER || ""
).toLowerCase();

export const IS_DEBUG_BUILD =
  process.env.NODE_ENV !== "production" && debugToolsEnv !== "false";

export const IS_HIDDEN_DEBUGGER_ENABLED = hiddenDebuggerEnv !== "false";
