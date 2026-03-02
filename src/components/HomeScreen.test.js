import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import HomeScreen from "./HomeScreen";

function setup(overrides = {}) {
  const onStart = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <HomeScreen
        username="tester"
        onSettings={() => {}}
        hearts={{ current: 5, max: 5, lastRegenAt: null, nextRefreshAt: null }}
        coins={0}
        onShop={() => {}}
        onStart={onStart}
        maxLevelsByMode={{ classic: 10, timetrial: 10, local: 10 }}
        t={null}
        lang="en"
        setHints={() => {}}
        progress={null}
        dailySpinLastClaimedAt={null}
        onDailySpinClaim={async () => ({ success: true })}
        loggedIn
        onAuthRequest={() => {}}
        {...overrides}
      />
    );
  });

  const classicButton = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent.includes("Classic")
  );

  return {
    onStart,
    classicButton,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

test("homepage classic CTA navigates on pointer down without requiring second tap", () => {
  const { onStart, classicButton, cleanup } = setup();

  act(() => {
    classicButton.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    classicButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledWith(
    "classic",
    null,
    expect.objectContaining({ eventType: "pointerdown" })
  );

  cleanup();
});

test("homepage classic CTA still works with click fallback", () => {
  const { onStart, classicButton, cleanup } = setup();

  act(() => {
    classicButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledWith(
    "classic",
    null,
    expect.objectContaining({ eventType: "click" })
  );

  cleanup();
});
