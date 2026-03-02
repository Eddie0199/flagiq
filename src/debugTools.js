const debugToolsEnv = String(process.env.REACT_APP_DEBUG_TOOLS || "").toLowerCase();

export const IS_DEBUG_BUILD =
  process.env.NODE_ENV !== "production" && debugToolsEnv !== "false";

