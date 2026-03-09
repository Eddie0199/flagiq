import { useCallback, useRef } from "react";
import { IS_DEBUG_BUILD } from "../debugTools";

const PRESS_DEBUG_ENABLED =
  IS_DEBUG_BUILD &&
  (typeof window === "undefined" || window.__FLAGIQ_PRESS_DEBUG__ !== false);

function logPress(payload) {
  if (!PRESS_DEBUG_ENABLED) return;
  console.debug("[press-debug]", payload);
}

export default function usePressAction({ id, onPress, disabled = false }) {
  const pointerHandledRef = useRef(false);

  const runAction = useCallback(
    (event, eventType) => {
      logPress({ id, eventType, handlerFired: !disabled, actionCompleted: false });
      if (disabled || typeof onPress !== "function") return;
      try {
        const result = onPress(event, eventType);
        if (result && typeof result.then === "function") {
          result
            .then(() => {
              logPress({ id, eventType, handlerFired: true, actionCompleted: true });
            })
            .catch((error) => {
              logPress({
                id,
                eventType,
                handlerFired: true,
                actionCompleted: false,
                error: error?.message || String(error),
              });
            });
          return;
        }
        logPress({ id, eventType, handlerFired: true, actionCompleted: true });
      } catch (error) {
        logPress({
          id,
          eventType,
          handlerFired: true,
          actionCompleted: false,
          error: error?.message || String(error),
        });
      }
    },
    [disabled, id, onPress]
  );

  const onPointerDown = useCallback(
    (event) => {
      if (disabled) return;
      pointerHandledRef.current = true;
      runAction(event, "pointerdown");
      window.setTimeout(() => {
        pointerHandledRef.current = false;
      }, 0);
    },
    [disabled, runAction]
  );

  const onClick = useCallback(
    (event) => {
      if (disabled || pointerHandledRef.current) return;
      runAction(event, "click");
    },
    [disabled, runAction]
  );

  return { onPointerDown, onClick };
}
