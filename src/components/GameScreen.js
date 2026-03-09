// src/components/GameScreen.js
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { clamp, flagSrc, shuffle } from "../App";
import { submitTimeTrialResult } from "../timeTrialResultsApi";
import { HINT_ICON_BY_TYPE } from "../uiIcons";
import { getHintTranslation, HINT_IDS } from "../hints";
import {
  PERMANENTLY_EXCLUDED_FLAGS,
  normalizeFlagCode,
} from "../flagExclusions";
import { IS_DEBUG_BUILD } from "../debugTools";

const QUESTION_COUNT_FALLBACK = 10;

// ---------- TIME TRIAL CONSTANTS ----------
const TT_MAX_PER_Q = 1000;
const TT_MS_PER_Q = 10000;
const TT_TICK_MS = 120;
const TT_STAR3 = 8000;
const TT_STAR2 = 6000;

// helper to store hint-popup per user per device
const getHintSeenKey = (playerId) => `hasSeenHintInfo_${playerId || "default"}`;

// schedule work on the next frame (falls back to micro-delay)
const nextFrame = (fn) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(fn);
  } else {
    setTimeout(fn, 0);
  }
};

const WRONG_ANSWER_RESET_MS = 120;
const CORRECT_ANSWER_HOLD_MS = 260;
const PAUSE_HINT_MS = 1500;
const INPUT_LOCK_WATCHDOG_MS = 1500;
const FLAG_PRELOAD_CACHE = "flagiq-flag-assets-v1";
const NEXT_FLAG_WARMUP_COUNT = 4;
const PRELOAD_MAX_WAIT_MS = 1800;
const PRELOAD_ASSET_TIMEOUT_MS = 700;
const successSummaryTextStyle = {
  fontSize: 16,
  marginBottom: 6,
  color: "#ffffff",
};

const afterCorrectHighlight = (fn) => {
  nextFrame(() => {
    fn();
  });
};

const normalizeOptionValue = (value) => String(value || "").trim().toLowerCase();

// small stars row
function StarsInline({ count }) {
  const arr = [1, 2, 3];
  return (
    <span>
      {arr.map((i) => (
        <span key={i} style={{ color: i <= count ? "#f59e0b" : "#d1d5db" }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function GameScreen({
  t,
  lang,
  FLAGS,
  mode = "classic", // "classic" | "timetrial" | "local"
  activeLocalPack,
  levelId,
  levelLabel,
  levels,
  currentStars, // no longer used for badge; kept for backward-compat
  storedStars = 0,
  onProgressUpdate,
  onRunLost,
  heartsCurrent,
  onNoLives,
  soundCorrect,
  soundWrong,
  onBack,
  onNextLevel,
  onShop,
  onMainMenu,
  starsFromLives,
  // hints
  hints,
  setHints,
  // coins
  activeUser,
  onCoinsChange,
  onGameplayDiagnostics,
  onQuestionFlowDiagnostics,
}) {
  // create / read per-device user id
  const [playerId] = useState(() => {
    if (typeof window === "undefined") return "default";
    let id = localStorage.getItem("playerId");
    if (!id) {
      const gen =
        globalThis.crypto && globalThis.crypto.randomUUID
          ? globalThis.crypto.randomUUID()
          : `player_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("playerId", gen);
      id = gen;
    }
    return id;
  });
  const hintKey = getHintSeenKey(playerId);
  const [showHintInfo, setShowHintInfo] = useState(false);
  const [localFlagImages, setLocalFlagImages] = useState({});
  const mountedRef = useRef(true);
  const [preloadReady, setPreloadReady] = useState(false);
  const [preloadError, setPreloadError] = useState("");
  const [flagImageCache, setFlagImageCache] = useState({});
  const [currentFlagLoaded, setCurrentFlagLoaded] = useState(false);
  const [brokenFlagCodesState, setBrokenFlagCodesState] = useState([]);
  const loggedMissingFlagKeysRef = useRef(new Set());
  const brokenFlagsRef = useRef(new Set());
  const lastFailedFlagCodeRef = useRef("");
  const lastFailedFlagUrlRef = useRef("");
  const lastResolvedFlagUrlRef = useRef("");
  const currentFlagRequestIdRef = useRef(0);
  const [currentFlagRequestId, setCurrentFlagRequestId] = useState(0);
  const preloadStatsRef = useRef({
    startedAt: 0,
    completedAt: 0,
    preloadMs: 0,
    firstQuestionMs: null,
    preloadNetworkCalls: 0,
    gameplayNetworkCalls: 0,
  });
  const firstQuestionMarkedRef = useRef(false);
  const gameplayDiagnosticsCallbackRef = useRef(onGameplayDiagnostics);

  // refs to know if run started / finished / already lost a life
  const runStartedRef = useRef(false);
  const runEndedRef = useRef(false);
  const lifeLostRef = useRef(false);
  const submittedTimeTrialResultRef = useRef(false);

  useEffect(() => {
    gameplayDiagnosticsCallbackRef.current = onGameplayDiagnostics;
  }, [onGameplayDiagnostics]);

  const noteGameplayDiagnostic = useCallback(() => {
    const snapshot = {
      ...preloadStatsRef.current,
      totalFlags: Number(FLAGS?.length || 0),
      excludedPermanent: PERMANENTLY_EXCLUDED_FLAGS.length,
      excludedBrokenSession: brokenFlagsRef.current.size,
      lastFailedFlagCode: lastFailedFlagCodeRef.current,
      lastFailedFlagUrl: lastFailedFlagUrlRef.current,
    };
    if (process.env.NODE_ENV !== "production") {
      if (IS_DEBUG_BUILD) console.debug("[gameplay-diag]", snapshot);
    }
    if (!gameplayDiagnosticsCallbackRef.current) return;
    gameplayDiagnosticsCallbackRef.current(snapshot);
  }, [FLAGS]);

  // show hint popup once per user per device
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(hintKey);
    if (!seen) {
      setShowHintInfo(true);
    }
  }, [hintKey]);

  // ---------- LEVEL / QUESTIONS ----------
  const levelDef = useMemo(
    () => levels.find((l) => l.id === levelId) || levels[0],
    [levels, levelId]
  );
  const questionCount = levelDef?.questionCount || QUESTION_COUNT_FALLBACK;

  // ---- similarity helpers for picking better wrong answers ----
  function getFlagColors(flag) {
    if (!flag || !Array.isArray(flag.colors)) return [];
    return flag.colors;
  }

  function colorOverlapScore(a, b) {
    const ca = getFlagColors(a);
    const cb = getFlagColors(b);
    if (!ca.length || !cb.length) return 0;
    const setB = new Set(cb);
    let count = 0;
    for (const c of ca) {
      if (setB.has(c)) count++;
    }
    if (count >= 2) return 3; // strong visual similarity
    if (count === 1) return 1; // weak similarity
    return 0;
  }

  function flagSimilarity(a, b) {
    if (!a || !b || a.code === b.code) return -Infinity;

    let score = 0;

    // 1) same region = geographically plausible
    if (a.region && b.region && a.region === b.region) {
      score += 2;
    }

    // 2) colour overlap = visually similar
    score += colorOverlapScore(a, b);

    // 3) difficulty closeness = similarly obscure
    const da = typeof a.difficulty === "number" ? a.difficulty : 0;
    const db = typeof b.difficulty === "number" ? b.difficulty : 0;
    if (Math.abs(da - db) <= 1) {
      score += 1;
    }

    return score;
  }

  // helper that actually builds random questions
  function buildQuestions(ld, qc, brokenSet = new Set()) {
    if (!ld) return [];
    const pool = (ld.pool || []).filter((flag) => {
      const code = normalizeFlagCode(flag?.code);
      return (
        code &&
        !PERMANENTLY_EXCLUDED_FLAGS.includes(code) &&
        !brokenSet.has(code)
      );
    });
    if (!pool.length) return [];

    const shuffledPool = shuffle(pool);
    const qs = [];
    let previousCorrect = null;

    for (let i = 0; i < qc; i++) {
      const correct = shuffledPool[i % shuffledPool.length];
      const correctName = correct.name;
      const others = shuffledPool.filter((f) => f.code !== correct.code);

      const previousCorrectCode = normalizeFlagCode(previousCorrect?.code);
      const previousCorrectName = normalizeOptionValue(previousCorrect?.name);
      const hasPreviousCorrect = Boolean(previousCorrectCode || previousCorrectName);
      const othersWithoutPrevCorrect = hasPreviousCorrect
        ? others.filter((flag) => {
            const candidateCode = normalizeFlagCode(flag?.code);
            const candidateName = normalizeOptionValue(flag?.name);
            if (previousCorrectCode && candidateCode === previousCorrectCode) return false;
            if (!previousCorrectCode && previousCorrectName && candidateName === previousCorrectName)
              return false;
            return true;
          })
        : others;
      const excludedOption =
        hasPreviousCorrect && othersWithoutPrevCorrect.length !== others.length
          ? previousCorrect?.code || previousCorrect?.name || null
          : null;

      // score how similar each candidate is to the correct flag
      const scored = othersWithoutPrevCorrect.map((f) => ({
        flag: f,
        score: flagSimilarity(correct, f),
      }));

      // sort by similarity (highest first)
      scored.sort((a, b) => b.score - a.score);

      // take only those with positive similarity
      let similar = scored.filter((x) => x.score > 0).map((x) => x.flag);

      let wrongs;
      if (similar.length >= 3) {
        // from top 8 most similar, pick 3 at random to keep variety
        const topFew = similar.slice(0, 8);
        wrongs = shuffle(topFew).slice(0, 3);
      } else {
        // fallback: use whatever we have, then pad with random others
        const base = similar;
        const remaining = othersWithoutPrevCorrect.filter(
          (f) => !base.some((s) => s.code === f.code)
        );
        wrongs = [...base, ...shuffle(remaining)].slice(0, 3);
      }

      // ---- ensure answer texts are unique ----
      const allCandidateNames = [correctName, ...wrongs.map((w) => w.name)];
      const uniqueNames = [];
      const seen = new Set();

      for (const name of allCandidateNames) {
        if (!seen.has(name)) {
          seen.add(name);
          uniqueNames.push(name);
        }
      }

      // if dedupe removed some wrongs, top up with extra distinct flags
      let idxGuard = 0;
      while (uniqueNames.length < 4 && idxGuard < othersWithoutPrevCorrect.length) {
        const extra = othersWithoutPrevCorrect[idxGuard++];
        if (extra && !seen.has(extra.name)) {
          seen.add(extra.name);
          uniqueNames.push(extra.name);
        }
      }

      const fallbackUsed = uniqueNames.length < 4;
      let fallbackIdxGuard = 0;
      while (uniqueNames.length < 4 && fallbackIdxGuard < others.length) {
        const extra = others[fallbackIdxGuard++];
        if (extra && !seen.has(extra.name)) {
          seen.add(extra.name);
          uniqueNames.push(extra.name);
        }
      }

      if (hasPreviousCorrect) {
        if (IS_DEBUG_BUILD) console.debug("[question-options] previous correct exclusion", {
          prevCorrect: previousCorrect?.code || previousCorrect?.name || "none",
          nextQuestionId: correct?.code || correct?.name || `index-${i}`,
          excludedOption,
          fallbackUsed,
        });
      }

      const opts = shuffle(uniqueNames);
      qs.push({ correct, options: opts });
      previousCorrect = correct;
    }

    return qs;
  }

  // initial questions
  const [questions, setQuestions] = useState(() =>
    buildQuestions(levelDef, questionCount, brokenFlagsRef.current)
  );

  // rebuild when level / count changes
  useEffect(() => {
    brokenFlagsRef.current = new Set();
    setBrokenFlagCodesState([]);
    setQuestions(buildQuestions(levelDef, questionCount, brokenFlagsRef.current));
  }, [levelDef, questionCount]);

  // ---------- STATE ----------
  const [qIndex, setQIndex] = useState(0);
  const [skulls, setSkulls] = useState(0);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState(false);

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [hintError, setHintError] = useState("");
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [isAnimatingTransition, setIsAnimatingTransition] = useState(false);
  const [isFetchingNextQuestion, setIsFetchingNextQuestion] = useState(false);
  const [lastTapTimestamp, setLastTapTimestamp] = useState(null);
  const [lastTapTarget, setLastTapTarget] = useState("none");
  const inputLockSinceRef = useRef(0);
  const pendingCorrectTransitionTimeoutRef = useRef(null);
  const pendingWrongResetTimeoutRef = useRef(null);
  const pendingPauseTimeoutRef = useRef(null);
  const questionTokenRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const lastProgressionErrorRef = useRef("");

  const clearPendingTransitionTimeout = useCallback(() => {
    if (pendingCorrectTransitionTimeoutRef.current) {
      clearTimeout(pendingCorrectTransitionTimeoutRef.current);
      pendingCorrectTransitionTimeoutRef.current = null;
    }
  }, []);

  const clearPendingWrongResetTimeout = useCallback(() => {
    if (pendingWrongResetTimeoutRef.current) {
      clearTimeout(pendingWrongResetTimeoutRef.current);
      pendingWrongResetTimeoutRef.current = null;
    }
  }, []);

  const clearPendingPauseTimeout = useCallback(() => {
    if (pendingPauseTimeoutRef.current) {
      clearTimeout(pendingPauseTimeoutRef.current);
      pendingPauseTimeoutRef.current = null;
    }
  }, []);

  const lockInput = useCallback(() => {
    inputLockSinceRef.current = Date.now();
    setIsInputLocked(true);
  }, []);

  const unlockInput = useCallback(() => {
    inputLockSinceRef.current = 0;
    actionInFlightRef.current = false;
    setIsInputLocked(false);
    setIsAnimatingTransition(false);
    setIsFetchingNextQuestion(false);
  }, []);

  const describeTapTarget = useCallback((target) => {
    if (!target || !(target instanceof Element)) return "unknown";
    const idPart = target.id ? `#${target.id}` : "";
    const classPart = target.className
      ? `.${String(target.className)
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .join(".")}`
      : "";
    return `${target.tagName.toLowerCase()}${idPart}${classPart}`;
  }, []);

  // time trial
  const [ttScore, setTtScore] = useState(0);
  const [ttRemaining, setTtRemaining] = useState(TT_MS_PER_Q);
  const [ttPaused, setTtPaused] = useState(false); // pause state

  // show “you earned 100 coins!”
  const [showCoinReward, setShowCoinReward] = useState(false);

  // ⭐ this run's stars (what we show on the success screen)
  const [runStars, setRunStars] = useState(0);

  const current = questions[qIndex];

  const emitQuestionFlowDiagnostics = useCallback(
    (extra = {}) => {
      if (!onQuestionFlowDiagnostics) return;
      const route =
        typeof window === "undefined"
          ? "unknown"
          : `${window.location?.pathname || "/"} (screen:game)`;
      const boosterState = JSON.stringify({
        remove2: Number(hints?.remove2 || 0),
        autoPass: Number(hints?.autoPass || 0),
        pause: Number(hints?.pause || 0),
        ttPaused: Boolean(ttPaused),
      });
      onQuestionFlowDiagnostics({
        route,
        screen: "game",
        mode,
        levelId,
        questionIndex: qIndex,
        questionCount,
        questionCode: current?.correct?.code || "",
        selectedAnswer,
        uiHasSelectedAnswer: selectedAnswer !== null,
        isValidationInProgress: Boolean(actionInFlightRef.current),
        isWaitingAsync: Boolean(isAnimatingTransition || isFetchingNextQuestion),
        isInputLocked: Boolean(isInputLocked),
        isLoading: Boolean(!preloadReady || !currentFlagLoaded),
        isAnimatingTransition: Boolean(isAnimatingTransition),
        isFetchingNextQuestion: Boolean(isFetchingNextQuestion),
        actionInFlight: Boolean(actionInFlightRef.current),
        boosterState,
        lastProgressionError: lastProgressionErrorRef.current,
        timestamp: new Date().toISOString(),
        ...extra,
      });
    },
    [
      onQuestionFlowDiagnostics,
      hints,
      ttPaused,
      mode,
      levelId,
      qIndex,
      questionCount,
      current,
      selectedAnswer,
      isAnimatingTransition,
      isFetchingNextQuestion,
      isInputLocked,
      preloadReady,
      currentFlagLoaded,
    ]
  );

  const logQuestionFlowEvent = useCallback(
    (eventName, meta = {}) => {
      console.log("[question-flow]", eventName, {
        mode,
        levelId,
        qIndex,
        questionCode: current?.correct?.code || null,
        selectedAnswer,
        isInputLocked,
        actionInFlight: actionInFlightRef.current,
        ...meta,
      });
      emitQuestionFlowDiagnostics({ lastEvent: eventName, lastEventMeta: meta });
    },
    [mode, levelId, qIndex, current, selectedAnswer, isInputLocked, emitQuestionFlowDiagnostics]
  );

  // reset base state on level/mode change
  useEffect(() => {
    setQIndex(0);
    setSkulls(0);
    setDone(false);
    setFail(false);
    setSelectedAnswer(null);
    setWrongAnswers([]);
    unlockInput();
    setTtScore(0);
    setTtRemaining(TT_MS_PER_Q);
    setTtPaused(false);
    setShowCoinReward(false);
    setRunStars(0);
    clearPendingTransitionTimeout();
    clearPendingWrongResetTimeout();
    clearPendingPauseTimeout();
    brokenFlagsRef.current = new Set();
    setBrokenFlagCodesState([]);
    lastFailedFlagCodeRef.current = "";
    lastFailedFlagUrlRef.current = "";
    lastResolvedFlagUrlRef.current = "";
    runStartedRef.current = false;
    runEndedRef.current = false;
    lifeLostRef.current = false;
    actionInFlightRef.current = false;
  }, [
    levelId,
    mode,
    unlockInput,
    clearPendingTransitionTimeout,
    clearPendingWrongResetTimeout,
    clearPendingPauseTimeout,
  ]);

  useEffect(() => {
    questionTokenRef.current += 1;
    actionInFlightRef.current = false;
    clearPendingTransitionTimeout();
    clearPendingWrongResetTimeout();
    setSelectedAnswer(null);
  }, [qIndex, clearPendingTransitionTimeout, clearPendingWrongResetTimeout]);

  useEffect(() => {
    if (!isInputLocked || !current || done || fail) return;
    const timer = setTimeout(() => {
      if (!inputLockSinceRef.current) return;
      const lockAge = Date.now() - inputLockSinceRef.current;
      if (lockAge < INPUT_LOCK_WATCHDOG_MS) return;
      console.warn("[input] Lock watchdog force-unlocked input", {
        lockAge,
        qIndex,
        questionCode: current?.correct?.code,
      });
      unlockInput();
      setSelectedAnswer(null);
    }, INPUT_LOCK_WATCHDOG_MS + 50);
    return () => clearTimeout(timer);
  }, [isInputLocked, current, done, fail, qIndex, unlockInput]);

  useEffect(() => {
    logQuestionFlowEvent(isInputLocked ? "state locked" : "state unlocked");
  }, [isInputLocked, logQuestionFlowEvent]);


  // mark run as started once they interact (move question / answer / wrong)
  useEffect(() => {
    const started =
      qIndex > 0 ||
      skulls > 0 ||
      selectedAnswer !== null ||
      wrongAnswers.length > 0;
    if (started) runStartedRef.current = true;
  }, [qIndex, skulls, selectedAnswer, wrongAnswers]);

  // helper: mark run as ended
  function markRunEnded() {
    runEndedRef.current = true;
  }

  // helper: lose life AT MOST ONCE per run
  function loseLifeOnce() {
    if (lifeLostRef.current) return;
    lifeLostRef.current = true;
    markRunEnded();
    if (onRunLost) onRunLost();
  }

  // ---------- TIME TRIAL TICKER ----------
  useEffect(() => {
    if (mode !== "timetrial") return;
    if (!preloadReady) return;
    if (!currentFlagLoaded) return;
    if (done || fail) return;
    if (ttPaused) return;

    const timer = setInterval(() => {
      setTtRemaining((prev) => {
        const next = prev - TT_TICK_MS;
        if (next <= 0) {
          clearInterval(timer);
          setFail(true);
          setSkulls((s) => clamp(s + 1, 0, 3));
          // time-out = failed run → lose exactly one life
          loseLifeOnce();
          return 0;
        }
        return next;
      });
    }, TT_TICK_MS);

    return () => clearInterval(timer);
    
  }, [mode, preloadReady, currentFlagLoaded, done, fail, ttPaused]);

  const isLocalFlag = (flag) =>
    Boolean(flag?.code && String(flag.code).includes("_"));
  const loadLocalFlagImage = async (flag) => {
    if (!flag?.code || !flag?.name) return null;
    const code = String(flag.code);
    if (localFlagImages[code]) return localFlagImages[code];
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.search = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: `Flag of ${flag.name}`,
      format: "json",
      srlimit: "1",
      origin: "*",
    }).toString();
    preloadStatsRef.current.preloadNetworkCalls += 1;
    const searchResponse = await fetch(searchUrl.toString());
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return null;
    const imageUrl = new URL("https://en.wikipedia.org/w/api.php");
    imageUrl.search = new URLSearchParams({
      action: "query",
      titles: title,
      prop: "pageimages",
      format: "json",
      pithumbsize: "640",
      origin: "*",
    }).toString();
    preloadStatsRef.current.preloadNetworkCalls += 1;
    const imageResponse = await fetch(imageUrl.toString());
    if (!imageResponse.ok) return null;
    const imageData = await imageResponse.json();
    const page = imageData?.query?.pages
      ? Object.values(imageData.query.pages)[0]
      : null;
    const src = page?.thumbnail?.source;
    if (!src) return null;
    setLocalFlagImages((prev) => ({ ...prev, [code]: src }));
    return src;
  };

  const cacheAndDecodeImage = useCallback(async (src) => {
    if (!src) return null;
    const normalised = String(src);

    if (normalised.startsWith("data:") || normalised.startsWith("blob:")) {
      return normalised;
    }

    try {
      if (typeof window !== "undefined" && window.caches) {
        const cache = await window.caches.open(FLAG_PRELOAD_CACHE);
        let response = await cache.match(normalised);
        if (!response) {
          preloadStatsRef.current.preloadNetworkCalls += 1;
          response = await fetch(normalised, { mode: "cors" });
          if (response.ok) {
            await cache.put(normalised, response.clone());
          }
        }
        if (response && response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          await new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = objectUrl;
          });
          return objectUrl;
        }
      }
    } catch (e) {
      // fall back to direct URL decode
    }

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = normalised;
    });
    return normalised;
  }, []);

  const withTimeout = useCallback(async (promise, timeoutMs) => {
    let timeoutId = null;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPreloadReady(false);
    setPreloadError("");
    setFlagImageCache({});
    firstQuestionMarkedRef.current = false;
    preloadStatsRef.current = {
      startedAt: performance.now(),
      completedAt: 0,
      preloadMs: 0,
      firstQuestionMs: null,
      preloadNetworkCalls: 0,
      gameplayNetworkCalls: 0,
    };

    const run = async () => {
      try {
        const flagsToResolve = new Map();
        questions.forEach((q) => {
          if (q?.correct?.code) {
            flagsToResolve.set(q.correct.code, q.correct);
          }
        });

        const localResolved = {};
        const deadline = performance.now() + PRELOAD_MAX_WAIT_MS;
        let timedOut = false;

        const localEntries = Array.from(flagsToResolve.values()).filter(isLocalFlag);
        for (const flag of localEntries) {
          if (cancelled) return;
          if (!flag?.code) continue;
          if (performance.now() > deadline) {
            timedOut = true;
            break;
          }
          const resolved = await withTimeout(
            loadLocalFlagImage(flag),
            PRELOAD_ASSET_TIMEOUT_MS
          );
          if (resolved) localResolved[flag.code] = resolved;
        }

        const urlMap = {};
        for (const flag of flagsToResolve.values()) {
          if (cancelled) return;
          if (performance.now() > deadline) {
            timedOut = true;
            break;
          }
          const localSrc = isLocalFlag(flag)
            ? localResolved[flag.code] || flag.image || flag.img || flag.fallbackImg || ""
            : "";
          const baseSrc = localSrc || flagSrc(flag, 320);
          const cachedSrc = await withTimeout(
            cacheAndDecodeImage(baseSrc),
            PRELOAD_ASSET_TIMEOUT_MS
          );
          if (cachedSrc && flag?.code) {
            urlMap[flag.code] = cachedSrc;
          }
        }

        if (cancelled || !mountedRef.current) return;
        if (timedOut && process.env.NODE_ENV !== "production") {
          console.warn("[gameplay-diag] Preload timed out; continuing with fallback assets.");
        }
        setLocalFlagImages((prev) => ({ ...prev, ...localResolved }));
        setFlagImageCache(urlMap);
        preloadStatsRef.current.completedAt = performance.now();
        preloadStatsRef.current.preloadMs =
          preloadStatsRef.current.completedAt - preloadStatsRef.current.startedAt;
        noteGameplayDiagnostic();
        setPreloadReady(true);
      } catch (error) {
        if (cancelled || !mountedRef.current) return;
        setPreloadError("Unable to preload this level. Please retry.");
        setPreloadReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [questions, cacheAndDecodeImage, withTimeout, levelId, mode, noteGameplayDiagnostic]);

  useEffect(() => {
    if (!preloadReady || !current || firstQuestionMarkedRef.current) return;
    firstQuestionMarkedRef.current = true;
    preloadStatsRef.current.firstQuestionMs =
      performance.now() - preloadStatsRef.current.startedAt;
    noteGameplayDiagnostic();
  }, [preloadReady, current, noteGameplayDiagnostic]);

  useEffect(() => {
    if (!preloadReady || !current) return;
    const upcoming = questions
      .slice(qIndex + 1, qIndex + 1 + NEXT_FLAG_WARMUP_COUNT)
      .map((q) => q?.correct)
      .filter(Boolean);
    upcoming.forEach((flag) => {
      const src = flagImageCache[flag.code];
      if (!src) return;
      const img = new Image();
      img.src = src;
    });
  }, [preloadReady, questions, qIndex, current, flagImageCache]);
  const optionNameKeys = useMemo(() => {
    const map = new Map();
    (levelDef?.pool || []).forEach((flag) => {
      if (flag?.name && flag?.nameKey) {
        map.set(flag.name, flag.nameKey);
      }
    });
    return map;
  }, [levelDef]);

  // ---------- PROGRESS ----------
  const isClassicMode = mode !== "timetrial";
  const classicProgress =
    isClassicMode && questionCount > 0
      ? done
        ? 100
        : (qIndex / questionCount) * 100
      : 0;

  const ttProgress =
    mode === "timetrial" ? clamp(1 - ttRemaining / TT_MS_PER_Q, 0, 1) * 100 : 0;

  const text = (key, fallback) => {
    if (!t || !lang) return fallback;
    const value = t(lang, key);
    return value === key ? fallback : value;
  };
  const localFlagsLabel = text("localFlags", "Local Flags");
  const localPackLabel = (() => {
    if (mode !== "local") return null;
    const packId = String(activeLocalPack?.packId || "").toLowerCase();
    if (packId && packId !== "all") {
      return text(
        `localFlags.packs.${packId}.name`,
        activeLocalPack?.title || localFlagsLabel
      );
    }
    if (packId === "all") {
      return text("localFlags.packs.all.short", "All");
    }
    return null;
  })();
  const localModeLabel = localPackLabel
    ? `${localPackLabel} - ${localFlagsLabel}`
    : localFlagsLabel;
  const modeLabel =
    mode === "timetrial"
      ? t && lang
        ? t(lang, "timeTrial")
        : "Time Trial"
      : mode === "local"
      ? localModeLabel
      : t && lang
      ? t(lang, "classic")
      : "Classic";
  const currentFlagSrc =
    current?.correct && isLocalFlag(current.correct)
      ? flagImageCache[current.correct.code] ||
        localFlagImages[current.correct.code] ||
        current.correct.image ||
        current.correct.img ||
        flagSrc(current.correct, 320)
      : current?.correct
      ? flagImageCache[current.correct.code] || flagSrc(current.correct, 320)
      : null;
  const isLocalCurrent = current?.correct && isLocalFlag(current.correct);
  const localFallbackSrc = current?.correct?.fallbackImg || "";
  const displayFlagSrc = isLocalCurrent
    ? localFlagImages[current.correct.code] ||
      flagImageCache[current.correct.code] ||
      currentFlagSrc ||
      localFallbackSrc
    : currentFlagSrc;

  const regenerateCurrentQuestion = useCallback(
    (excludeSet) => {
      if (!levelDef) return;

      setQuestions((prev) => {
        if (!prev.length) return prev;
        const replacement = buildQuestions(levelDef, 1, excludeSet)[0];
        if (!replacement) {
          return prev.filter((_, idx) => idx !== qIndex);
        }
        return prev.map((q, idx) => (idx === qIndex ? replacement : q));
      });
    },
    [levelDef, qIndex]
  );

  useEffect(() => {
    if (!current?.correct?.code) {
      setCurrentFlagLoaded(false);
      return;
    }
    currentFlagRequestIdRef.current += 1;
    setCurrentFlagRequestId(currentFlagRequestIdRef.current);
    setCurrentFlagLoaded(false);
    if (process.env.NODE_ENV !== "production") {
      const url = displayFlagSrc || flagSrc(current.correct, 320);
      lastResolvedFlagUrlRef.current = url;
      if (IS_DEBUG_BUILD) console.debug("[flags] requesting", {
        code: current.correct.code,
        url,
      });
    }
  }, [current?.correct?.code, displayFlagSrc, current?.correct]);

  useEffect(() => {
    if (!questions.length && !done && !fail) {
      markRunEnded();
      setDone(true);
    }
  }, [questions.length, done, fail]);

  useEffect(() => {
    noteGameplayDiagnostic();
  }, [brokenFlagCodesState, noteGameplayDiagnostic]);

  useEffect(() => {
    emitQuestionFlowDiagnostics();
  }, [emitQuestionFlowDiagnostics]);

  // ---------- best-ever stars for badge (from persistent store) ----------
  const bestStars = useMemo(() => {
    return Math.max(Number(storedStars || 0), Number(currentStars || 0));
  }, [storedStars, currentStars]);

  // ---------- HINT HANDLERS ----------
  function handleUseRemove2() {
    if (!hints || !setHints) return;
    if ((hints.remove2 ?? 0) <= 0) {
      setHintError(t && lang ? t(lang, "hint.notEnough") : "Not enough hints.");
      setTimeout(() => setHintError(""), 1400);
      return;
    }
    if (!current) return;

    const availWrongs = current.options.filter(
      (o) => o !== current.correct.name && !wrongAnswers.includes(o)
    );
    const toDisable = availWrongs.slice(0, 2);
    if (toDisable.length === 0) return;

    setWrongAnswers((prev) => [...prev, ...toDisable]);
    setHints((prev) => ({
      ...prev,
      remove2: Math.max(0, (prev?.remove2 ?? 0) - 1),
    }));
    logQuestionFlowEvent("booster used", {
      booster: "remove2",
      removedCount: toDisable.length,
    });
  }

  function handleUseAutoPass() {
    if (!hints || !setHints) return;
    if ((hints.autoPass ?? 0) <= 0) {
      setHintError(t && lang ? t(lang, "hint.notEnough") : "Not enough hints.");
      setTimeout(() => setHintError(""), 1400);
      return;
    }
    if (!current) return;

    // consume only if progression action accepted
    const actionAccepted = handleAnswer(current.correct.name, { fromHint: true });
    if (!actionAccepted) {
      return;
    }
    setHints((prev) => ({
      ...prev,
      autoPass: Math.max(0, (prev?.autoPass ?? 0) - 1),
    }));
    logQuestionFlowEvent("booster used", { booster: "autoPass" });
  }

  function handleUsePause() {
    if (mode !== "timetrial") return;
    if (!hints || !setHints) return;
    if ((hints.pause ?? 0) <= 0) {
      setHintError(t && lang ? t(lang, "hint.notEnough") : "Not enough hints.");
      setTimeout(() => setHintError(""), 1400);
      return;
    }

    if (ttPaused) return;

    // pause for a short window
    setTtPaused(true);
    setHints((prev) => ({
      ...prev,
      pause: Math.max(0, (prev?.pause ?? 0) - 1),
    }));
    clearPendingPauseTimeout();
    pendingPauseTimeoutRef.current = setTimeout(() => {
      pendingPauseTimeoutRef.current = null;
      setTtPaused(false);
    }, PAUSE_HINT_MS);
    logQuestionFlowEvent("booster used", { booster: "pause" });
  }

  // ---------- COIN AWARD (per-username store) ----------
  function awardCoinsOnce() {
    const reward = 100;

    // Tell App to add `reward` to the current wallet balance
    if (onCoinsChange) {
      onCoinsChange(reward); // treat as delta, not absolute total
    }

    setShowCoinReward(true);
  }

  // ---------- ANSWER HANDLER ----------
  function handleAnswer(answer, { fromHint = false, event } = {}) {
    setLastTapTimestamp(Date.now());
    setLastTapTarget(describeTapTarget(event?.target));
    logQuestionFlowEvent("answer tapped", {
      answer,
      fromHint,
      tapTarget: describeTapTarget(event?.target),
    });
    if (!preloadReady || !current || done || fail || !currentFlagLoaded) return false;
    if (isInputLocked || actionInFlightRef.current) return false;
    // normal clicks shouldn't work while we show colours
    if (!fromHint && selectedAnswer !== null) return false;

    actionInFlightRef.current = true;
    const questionToken = questionTokenRef.current;

    const isCorrect =
      current.correct && current.correct.name === answer ? true : false;

    logQuestionFlowEvent("validation started", {
      answer,
      isCorrect,
      questionToken,
    });

    // show highlight
    setSelectedAnswer(answer);

    // ----- CLASSIC -----
    if (isClassicMode) {
      if (isCorrect) {
        logQuestionFlowEvent("answer accepted", { answer, mode: "classic" });
        soundCorrect && soundCorrect();
        const lastQ = qIndex + 1 >= questionCount;
        lockInput();
        setIsAnimatingTransition(true);

        clearPendingTransitionTimeout();
        afterCorrectHighlight(() => {
          pendingCorrectTransitionTimeoutRef.current = setTimeout(() => {
            pendingCorrectTransitionTimeoutRef.current = null;
            try {
            if (questionToken !== questionTokenRef.current) return;
            if (lastQ) {
              const livesLeft = clamp(3 - skulls, 0, 3);
              const stars = starsFromLives
                ? starsFromLives(livesLeft)
                : clamp(livesLeft, 0, 3);

              // ⭐ set stars for THIS run
              setRunStars(stars);

              // check if this level had *any* stars before (per mode)
              const alreadyCompletedBefore = Number(storedStars || 0) > 0;

              // update BEST-EVER stars in the in-memory map (for unlocks, etc.)
              if (onProgressUpdate) {
                onProgressUpdate(mode, levelId, stars);
              }

              // award coins ONLY if this is the first completion of this level+mode
              if (!alreadyCompletedBefore && stars > 0) {
                awardCoinsOnce();
              }

              markRunEnded();
              setDone(true);
              logQuestionFlowEvent("validation completed", {
                answer,
                accepted: true,
                completedRun: true,
              });
            } else {
              setIsFetchingNextQuestion(true);
              logQuestionFlowEvent("next question requested", { nextIndex: qIndex + 1 });
              setQIndex((p) => p + 1);
              setSelectedAnswer(null);
              setWrongAnswers([]);
              logQuestionFlowEvent("next question loaded", { nextIndex: qIndex + 1 });
            }
          } catch (error) {
            lastProgressionErrorRef.current =
              error?.message || "Unknown question progression error";
            logQuestionFlowEvent("caught progression error", {
              message: lastProgressionErrorRef.current,
            });
            console.error("[question-flow] classic progression failure", error);
          } finally {
            actionInFlightRef.current = false;
            unlockInput();
          }
          }, CORRECT_ANSWER_HOLD_MS);
        });
      } else {
        logQuestionFlowEvent("answer rejected", { answer, mode: "classic" });
        actionInFlightRef.current = false;
        soundWrong && soundWrong();
        setSkulls((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            setFail(true);
            loseLifeOnce(); // lose exactly one life on fail
          }
          return next;
        });
        setWrongAnswers((prev) => [...prev, answer]);
        clearPendingWrongResetTimeout();
        pendingWrongResetTimeoutRef.current = setTimeout(() => {
          pendingWrongResetTimeoutRef.current = null;
          setSelectedAnswer(null);
          logQuestionFlowEvent("validation completed", {
            answer,
            accepted: false,
            resetSelection: true,
          });
        }, WRONG_ANSWER_RESET_MS);
      }
      return true;
    }

    // ----- TIME TRIAL -----
    if (mode === "timetrial") {
      if (isCorrect) {
        logQuestionFlowEvent("answer accepted", { answer, mode: "timetrial" });
        soundCorrect && soundCorrect();
        const gain = Math.floor((ttRemaining / TT_MS_PER_Q) * TT_MAX_PER_Q);
        const newTotal = ttScore + gain;
        const lastQ = qIndex + 1 >= questionCount;
        lockInput();
        setIsAnimatingTransition(true);

        clearPendingTransitionTimeout();
        afterCorrectHighlight(() => {
          pendingCorrectTransitionTimeoutRef.current = setTimeout(() => {
            pendingCorrectTransitionTimeoutRef.current = null;
            try {
            if (questionToken !== questionTokenRef.current) return;
            if (lastQ) {
              // stars based on score AND mistakes
              const maxByMistakes = clamp(3 - skulls, 0, 3);
              let stars = 1;
              if (newTotal >= TT_STAR3) stars = 3;
              else if (newTotal >= TT_STAR2) stars = 2;
              stars = Math.min(stars, maxByMistakes);

              // ⭐ set stars for THIS run
              setRunStars(stars);

              // check if this level had *any* stars before (per mode)
              const alreadyCompletedBefore = Number(storedStars || 0) > 0;

              if (onProgressUpdate) {
                onProgressUpdate(mode, levelId, stars);
              }

              // award coins ONLY if this is the first completion of this level+mode
              if (!alreadyCompletedBefore && stars > 0) {
                awardCoinsOnce();
              }

              markRunEnded();
              setTtScore(newTotal);
              setDone(true);
              logQuestionFlowEvent("validation completed", {
                answer,
                accepted: true,
                completedRun: true,
              });
            } else {
              setIsFetchingNextQuestion(true);
              logQuestionFlowEvent("next question requested", { nextIndex: qIndex + 1 });
              setTtScore(newTotal);
              setQIndex((p) => p + 1);
              setTtRemaining(TT_MS_PER_Q);
              setSelectedAnswer(null);
              setWrongAnswers([]);
              logQuestionFlowEvent("next question loaded", { nextIndex: qIndex + 1 });
            }
          } catch (error) {
            lastProgressionErrorRef.current =
              error?.message || "Unknown question progression error";
            logQuestionFlowEvent("caught progression error", {
              message: lastProgressionErrorRef.current,
            });
            console.error("[question-flow] timetrial progression failure", error);
          } finally {
            actionInFlightRef.current = false;
            unlockInput();
          }
          }, CORRECT_ANSWER_HOLD_MS);
        });
      } else {
        logQuestionFlowEvent("answer rejected", { answer, mode: "timetrial" });
        actionInFlightRef.current = false;
        soundWrong && soundWrong();
        setSkulls((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            setFail(true);
            loseLifeOnce(); // lose exactly one life on fail
          }
          return next;
        });
        setWrongAnswers((prev) => [...prev, answer]);
        clearPendingWrongResetTimeout();
        pendingWrongResetTimeoutRef.current = setTimeout(() => {
          pendingWrongResetTimeoutRef.current = null;
          setSelectedAnswer(null);
          logQuestionFlowEvent("validation completed", {
            answer,
            accepted: false,
            resetSelection: true,
          });
        }, WRONG_ANSWER_RESET_MS);
      }
      return true;
    }

    actionInFlightRef.current = false;
    return false;
  }

  // if player leaves the GameScreen mid-run, count it as a lost life ONCE
  useEffect(() => {
    return () => {
      clearPendingTransitionTimeout();
      clearPendingWrongResetTimeout();
      clearPendingPauseTimeout();

      if (
        runStartedRef.current &&
        !runEndedRef.current &&
        !lifeLostRef.current
      ) {
        loseLifeOnce();
      }

      if (
        mode === "timetrial" &&
        runStartedRef.current &&
        !submittedTimeTrialResultRef.current
      ) {
        submittedTimeTrialResultRef.current = true;
        submitTimeTrialResult(levelId, 0).catch((err) => {
          console.error("Failed to submit Time Trial result on exit", err);
        });
      }
    };
  }, [
    mode,
    levelId,
    clearPendingTransitionTimeout,
    clearPendingWrongResetTimeout,
    clearPendingPauseTimeout,
  ]);

  // submit Time Trial results once when the run is completed
  useEffect(() => {
    if (mode !== "timetrial") {
      submittedTimeTrialResultRef.current = false;
      return;
    }

    if (!done && !fail) {
      submittedTimeTrialResultRef.current = false;
      return;
    }

    if (submittedTimeTrialResultRef.current) return;

    submittedTimeTrialResultRef.current = true;

    const finalScore = done ? ttScore : 0;

    submitTimeTrialResult(levelId, finalScore).catch((err) => {
      console.error("Failed to submit Time Trial result", err);
    });
  }, [mode, done, fail, levelId, ttScore]);

  // skulls render
  const skullsRow = (
    <div style={{ fontSize: 14, marginTop: 0 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} style={{ opacity: i < skulls ? 1 : 0.3 }}>
          💀
        </span>
      ))}
    </div>
  );

  // reusable reset that ALSO rebuilds questions
  const resetAndRebuild = () => {
    brokenFlagsRef.current = new Set();
    setBrokenFlagCodesState([]);
    lastFailedFlagCodeRef.current = "";
    lastFailedFlagUrlRef.current = "";
    lastResolvedFlagUrlRef.current = "";
    setQuestions(buildQuestions(levelDef, questionCount, brokenFlagsRef.current));
    setQIndex(0);
    setSkulls(0);
    setDone(false);
    setFail(false);
    setSelectedAnswer(null);
    setWrongAnswers([]);
    unlockInput();
    if (mode === "timetrial") {
      setTtScore(0);
      setTtRemaining(TT_MS_PER_Q);
      setTtPaused(false);
    }
    setShowCoinReward(false);
    setRunStars(0);
    runStartedRef.current = false;
    runEndedRef.current = false;
    lifeLostRef.current = false;
    submittedTimeTrialResultRef.current = false;
  };

  const reloadCurrentQuestion = useCallback(() => {
    setSelectedAnswer(null);
    setWrongAnswers([]);
    unlockInput();
    regenerateCurrentQuestion(brokenFlagsRef.current);
  }, [regenerateCurrentQuestion, unlockInput]);

  const handleFailRetry = () => {
    if (typeof heartsCurrent === "number" && heartsCurrent <= 0) {
      if (onNoLives) onNoLives();
      return;
    }
    resetAndRebuild();
  };

  const actionGroupStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 10,
    justifyContent: "center",
    width: "min(260px, 90vw)",
    margin: "0 auto",
  };

  const actionButtonBase = {
    padding: "10px 14px",
    borderRadius: 16,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };

  const primaryActionButton = {
    ...actionButtonBase,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(15,23,42,0.25)",
  };

  const secondaryActionButton = {
    ...actionButtonBase,
    border: "1px solid #0f172a",
    background: "#fff",
    color: "#0f172a",
  };

  return (
    <div style={{ padding: "10px 12px 60px" }}>
      {/* HINT INFO POPUP (first time) */}
      {showHintInfo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              maxWidth: 340,
              width: "100%",
              padding: "18px 16px 14px",
              boxShadow: "0 12px 35px rgba(15,23,42,0.25)",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
              {t && lang ? t(lang, "hint.title") : "How hints work 💡"}
            </h3>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
              {t && lang
                ? t(lang, "hint.subtitle")
                : "Use these to help answer tough flags:"}
            </p>
            <ul
              style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}
            >
              <li style={{ marginBottom: 6 }}>
                🎯{" "}
                <strong>
                  {getHintTranslation(t, lang, HINT_IDS.REMOVE_TWO, "label")}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hints.removeTwo.description")
                  : "hints.removeTwo.description"}
              </li>
              <li style={{ marginBottom: 6 }}>
                ✅{" "}
                <strong>
                  {getHintTranslation(t, lang, HINT_IDS.AUTO_PASS, "label")}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hints.autoPass.description")
                  : "hints.autoPass.description"}
              </li>
              <li style={{ marginBottom: 6 }}>
                ⏸️{" "}
                <strong>
                  {getHintTranslation(t, lang, HINT_IDS.PAUSE_TIMER, "label")}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hints.pauseTimer.description")
                  : "hints.pauseTimer.description"}
              </li>
            </ul>
            <button
              onPointerDown={() => {
                localStorage.setItem(hintKey, "1");
                setShowHintInfo(false);
              }}
              style={{
                marginTop: 14,
                width: "100%",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "8px 0",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t && lang ? t(lang, "ok") : "Got it"}
            </button>
          </div>
        </div>
      )}

      {/* TOP INFO (blue box) */}
      <div
        style={{
          background: "#fff",
          borderRadius: 22,
          padding: "12px 16px 14px",
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* row 1 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          {/* progress text */}
          {mode === "timetrial" ? (
            <div style={{ fontSize: 13, color: "#475569" }}>
              {`${Math.min(qIndex + 1, questionCount)}/${questionCount}`}
            </div>
          ) : (
            <div></div>
          )}

          {/* title */}
          <div
            style={{
              textAlign: "center",
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            {(t && lang ? t(lang, "levelWord") : "Level") +
              " " +
              (levelLabel || levelId)}
          </div>

          {/* stars badge (BEST EVER) */}
          <div style={{ justifySelf: "end" }}>
            <div
              style={{
                background: "#fff",
                padding: "4px 12px 3px",
                borderRadius: 999,
                border: "1px solid rgba(15,23,42,0.04)",
              }}
            >
              <StarsInline count={bestStars} />
            </div>
          </div>
        </div>

        {/* row 2 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          {/* left (score for TT) */}
          <div style={{ minHeight: 18 }}>
            {mode === "timetrial" && !done && !fail ? (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#0f172a",
                  textAlign: "left",
                }}
              >
                {(t && lang ? t(lang, "score") : "Score") +
                  ": " +
                  ttScore.toLocaleString()}
              </div>
            ) : null}
          </div>

          {/* centre (skulls) */}
          <div style={{ textAlign: "center" }}>{skullsRow}</div>

          {/* right (mode pill) */}
          <div style={{ justifySelf: "end" }}>
            <span
              style={{
                background: "#e2e8f0",
                padding: "3px 12px 4px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                color: "#0f172a",
              }}
            >
              {modeLabel}
            </span>
          </div>
        </div>

        {/* progress bar */}
        <div>
          {isClassicMode ? (
            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: "#dbeafe",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${classicProgress}%`,
                  height: "100%",
                  background: "#1d4ed8",
                  transition: "width 0.25s ease",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: "#f59e0b",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  height: "100%",
                  width: `${ttProgress}%`,
                  background: "#fef9c3",
                  transition: "width 0.1s linear",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* STATES */}
      {!preloadReady ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 40,
          }}
          aria-label="Loading"
        >
          <div className="game-preload-spinner" />
        </div>
      ) : done ? (
        mode === "timetrial" ? (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#ffffff",
                marginBottom: 10,
              }}
            >
              {t && lang ? t(lang, "timeTrialComplete") : "Time Trial Complete"}
            </h2>
            <div style={successSummaryTextStyle}>
              {(t && lang ? t(lang, "finalScore") : "Final score") + ": "}
              <strong>{ttScore.toLocaleString()}</strong> /{" "}
              {(QUESTION_COUNT_FALLBACK * TT_MAX_PER_Q).toLocaleString()}
            </div>

            {/* ⭐ THIS RUN'S STARS ⭐ */}
            <div style={{ marginBottom: 20 }}>
              <StarsInline count={runStars || 0} />
            </div>

            {/* coin message */}
            {showCoinReward && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#dcfce7",
                  border: "1px solid #22c55e33",
                  padding: "7px 14px",
                  borderRadius: 999,
                  marginBottom: 16,
                  color: "#166534",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                🪙{" "}
                {t && lang
                  ? t(lang, "coinsEarnedMessage")
                  : "You earned 100 coins!"}
              </div>
            )}

            <div style={actionGroupStyle}>
              <button onClick={onNextLevel} style={primaryActionButton}>
                {t && lang ? t(lang, "nextLevel") : "Next Level"}
              </button>
              <button
                onClick={resetAndRebuild}
                style={secondaryActionButton}
              >
                {t && lang ? t(lang, "tryAgain") : "Try Again"}
              </button>
              <button onClick={onShop} style={secondaryActionButton}>
                {t && lang ? t(lang, "goToShop") : "Go to Shop"}
              </button>
              <button onClick={onMainMenu} style={secondaryActionButton}>
                {t && lang ? t(lang, "goToMainMenu") : "Go to Main Menu"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 10,
              }}
            >
              {t && lang ? t(lang, "levelComplete") : "Level Complete"}
            </h2>

            {/* ⭐ THIS RUN'S STARS ⭐ */}
            <div style={{ marginBottom: 20 }}>
              <StarsInline count={runStars || 0} />
            </div>

            {/* coin message */}
            {showCoinReward && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#dcfce7",
                  border: "1px solid #22c55e33",
                  padding: "7px 14px",
                  borderRadius: 999,
                  marginBottom: 16,
                  color: "#166534",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                🪙{" "}
                {t && lang
                  ? t(lang, "coinsEarnedMessage")
                  : "You earned 100 coins!"}
              </div>
            )}

            <div style={actionGroupStyle}>
              <button onClick={onNextLevel} style={primaryActionButton}>
                {t && lang ? t(lang, "nextLevel") : "Next Level"}
              </button>
              <button
                onClick={resetAndRebuild}
                style={secondaryActionButton}
              >
                {t && lang ? t(lang, "tryAgain") : "Try Again"}
              </button>
              <button onClick={onShop} style={secondaryActionButton}>
                {t && lang ? t(lang, "goToShop") : "Go to Shop"}
              </button>
              <button onClick={onMainMenu} style={secondaryActionButton}>
                {t && lang ? t(lang, "goToMainMenu") : "Go to Main Menu"}
              </button>
            </div>
          </div>
        )
      ) : fail ? (
        // ====== FAIL ======
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              marginBottom: 10,
            }}
          >
            {t && lang ? t(lang, "gameOver") : "Game over"}
          </h2>
          <div style={actionGroupStyle}>
            <button
              onClick={handleFailRetry}
              style={primaryActionButton}
            >
              {t && lang ? t(lang, "tryAgain") : "Try Again"}
            </button>
            <button onClick={onShop} style={secondaryActionButton}>
              {t && lang ? t(lang, "goToShop") : "Go to Shop"}
            </button>
            <button onClick={onMainMenu} style={secondaryActionButton}>
              {t && lang ? t(lang, "goToMainMenu") : "Go to Main Menu"}
            </button>
          </div>
          {hintError ? (
            <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 12 }}>
              {hintError}
            </div>
          ) : null}
        </div>
      ) : (
        // ====== PLAYING ======
        <>
          {/* HINTS BAR */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 12,
              alignItems: "center",
            }}
          >
            {/* Remove 2 */}
            <button
              onClick={handleUseRemove2}
              disabled={!hints || hints.remove2 <= 0 || selectedAnswer !== null}
              title={
                t && lang
                  ? t(lang, "hints.removeTwo.description")
                  : "hints.removeTwo.description"
              }
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: !hints || hints.remove2 <= 0 ? "#e2e8f0" : "#fff",
                border: "1px solid #cbd5f5",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                cursor:
                  !hints || hints.remove2 <= 0 || selectedAnswer !== null
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              <span aria-hidden="true">{HINT_ICON_BY_TYPE.remove2}</span>
              <span>{hints?.remove2 ?? 0}</span>
            </button>

            {/* Auto pass */}
            <button
              onClick={handleUseAutoPass}
              disabled={
                !hints || hints.autoPass <= 0 || selectedAnswer !== null
              }
              title={
                t && lang
                  ? t(lang, "hints.autoPass.description")
                  : "hints.autoPass.description"
              }
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: !hints || hints.autoPass <= 0 ? "#e2e8f0" : "#fff",
                border: "1px solid #cbd5f5",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                cursor:
                  !hints || hints.autoPass <= 0 || selectedAnswer !== null
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              <span aria-hidden="true">{HINT_ICON_BY_TYPE.autoPass}</span>
              <span>{hints?.autoPass ?? 0}</span>
            </button>

            {/* Pause */}
            <button
              onClick={handleUsePause}
              disabled={
                mode !== "timetrial" ||
                !hints ||
                hints.pause <= 0 ||
                selectedAnswer !== null
              }
              title={
                t && lang
                  ? t(lang, "hints.pauseTimer.description")
                  : "hints.pauseTimer.description"
              }
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background:
                  mode !== "timetrial" || !hints || hints.pause <= 0
                    ? "#e2e8f0"
                    : "#fff",
                border: "1px solid #cbd5f5",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                cursor:
                  mode !== "timetrial" ||
                  !hints ||
                  hints.pause <= 0 ||
                  selectedAnswer !== null
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              <span aria-hidden="true">{HINT_ICON_BY_TYPE.pause}</span>
              <span>{hints?.pause ?? 0}</span>
            </button>

            {/* info */}
            <button
              type="button"
              onClick={() => setShowHintInfo(true)}
              title={t && lang ? t(lang, "hint.info") : "What do hints do?"}
              style={{
                marginLeft: "auto",
                background: "#e2e8f0",
                border: "1px solid rgba(15,23,42,0.05)",
                borderRadius: 999,
                padding: "4px 10px 5px",
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#0f172a",
              }}
            >
              <span
                style={{
                  background: "#fff",
                  borderRadius: 999,
                  padding: "0 6px",
                  fontWeight: 600,
                }}
              >
                ?
              </span>
              <span>{t && lang ? t(lang, "hint.button") : "Hints"}</span>
            </button>
          </div>

          {/* show hint error */}
          {hintError ? (
            <div style={{ marginBottom: 10, color: "#b91c1c", fontSize: 12 }}>
              {hintError}
            </div>
          ) : null}

          {/* FLAG */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              position: "relative",
              pointerEvents: "none",
            }}
          >
            {current ? (
              <img
                src={displayFlagSrc || flagSrc(current.correct, 320)}
                alt={current.correct.name}
                data-request-id={currentFlagRequestId}
                onLoad={(event) => {
                  const requestId = Number(event.currentTarget.dataset.requestId || 0);
                  if (requestId !== currentFlagRequestIdRef.current) return;
                  setCurrentFlagLoaded(true);
                }}
                onError={(event) => {
                  const requestId = Number(event.currentTarget.dataset.requestId || 0);
                  if (requestId !== currentFlagRequestIdRef.current) return;
                  const failedCode = normalizeFlagCode(current?.correct?.code);
                  const failedUrl = event.currentTarget.currentSrc || event.currentTarget.src || "";
                  const missingKey = `${current?.correct?.name || "Unknown"}:${
                    current?.correct?.code || "?"
                  }`;
                  if (!loggedMissingFlagKeysRef.current.has(missingKey)) {
                    loggedMissingFlagKeysRef.current.add(missingKey);
                    console.warn("[flags] Missing flag asset", {
                      key: missingKey,
                      src: failedUrl,
                    });
                  }

                  if (failedCode) {
                    brokenFlagsRef.current.add(failedCode);
                    setBrokenFlagCodesState(Array.from(brokenFlagsRef.current));
                    lastFailedFlagCodeRef.current = failedCode;
                    lastFailedFlagUrlRef.current = failedUrl;
                    setCurrentFlagLoaded(false);
                    regenerateCurrentQuestion(brokenFlagsRef.current);
                  }
                }}
                style={{
                  maxWidth: 256,
                  maxHeight: 160,
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 12,
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            ) : (
              <div className="game-preload-spinner" aria-label="Loading" />
            )}
          </div>

          {/* ANSWERS */}
          <div className="game-answers">
            {current
              ? current.options.map((opt, optIndex) => {
                  const isSelected = selectedAnswer === opt;
                  const isWrong = wrongAnswers.includes(opt);
                  const isCorrect = current.correct.name === opt;
                  const showCorrectReveal = isSelected && isCorrect;
                  let border = "1px solid #e2e8f0";
                  let bg = "#fff";
                  let color = "#0f172a";
                  let boxShadow = "none";

                  if (showCorrectReveal) {
                    border = "2px solid var(--success-strong)";
                    bg = "var(--success-strong-bg)";
                    color = "#fff";
                    boxShadow = "0 0 0 3px var(--success-strong-glow)";
                  }

                  if (isSelected) {
                    border = isCorrect
                      ? "2px solid var(--success-strong)"
                      : "2px solid #ef4444";
                    bg = isCorrect ? "var(--success-strong-bg)" : "#fef2f2";
                    color = isCorrect ? "#fff" : "#7f1d1d";
                    boxShadow = isCorrect
                      ? "0 0 0 3px var(--success-strong-glow)"
                      : "none";
                  } else if (isWrong) {
                    bg = "#f8fafc";
                  }

                  const optionNameKey = optionNameKeys.get(opt);
                  const optionTranslated =
                    optionNameKey && t && lang
                      ? t(lang, optionNameKey)
                      : null;
                  const countryTranslated =
                    t && lang ? t(lang, "flag." + opt) : opt;
                  const label =
                    optionTranslated && optionTranslated !== optionNameKey
                      ? optionTranslated
                      : countryTranslated !== "flag." + opt
                      ? countryTranslated
                      : opt;

                  return (
                    <button
                      key={`${current?.correct?.code || `q${qIndex}`}-${optIndex}`}
                      onPointerDown={(event) => handleAnswer(opt, { event })}
                      disabled={isWrong || selectedAnswer !== null || isInputLocked}
                      style={{
                        background: bg,
                        border,
                        color,
                        boxShadow,
                        borderRadius: 14,
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        cursor:
                          isWrong || selectedAnswer !== null || isInputLocked
                            ? "not-allowed"
                            : "pointer",
                        opacity: isWrong ? 0.5 : 1,
                        transition:
                          "background 0.15s ease, border 0.15s ease, box-shadow 0.15s ease, color 0.15s ease",
                      }}
                      className={`game-answer-button${
                        showCorrectReveal ? " is-correct-reveal" : ""
                      }`}
                    >
                      <span className="game-answer-button-content">
                        <span className="game-answer-label">{label}</span>
                        {showCorrectReveal && (
                          <span className="game-answer-correct-icon" aria-hidden="true">
                            ✓
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              : t && lang
              ? t(lang, "loadingChoices")
              : "Loading choices…"}
          </div>
        </>
      )}

      {preloadError && (
        <div style={{ textAlign: "center", color: "#ef4444", marginTop: 10 }}>
          {preloadError}
        </div>
      )}

      {IS_DEBUG_BUILD && (
        <div
          style={{
            marginTop: 12,
            background: "rgba(15,23,42,0.7)",
            color: "#fff",
            borderRadius: 12,
            padding: 10,
            fontSize: 12,
            display: "grid",
            gap: 4,
          }}
        >
          <strong>Input State (debug)</strong>
          <div>isInputLocked: {String(isInputLocked)}</div>
          <div>currentQuestionId: {current?.correct?.code || "none"}</div>
          <div>selectedAnswerId: {selectedAnswer || "none"}</div>
          <div>isAnimatingTransition: {String(isAnimatingTransition)}</div>
          <div>isFetchingNextQuestion: {String(isFetchingNextQuestion)}</div>
          <div>
            lastTapTimestamp: {lastTapTimestamp ? new Date(lastTapTimestamp).toISOString() : "none"}
          </div>
          <div>tapTarget: {lastTapTarget}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={unlockInput}
              style={{ borderRadius: 8, border: "none", padding: "6px 8px", cursor: "pointer" }}
            >
              Force unlock input
            </button>
            <button
              type="button"
              onClick={reloadCurrentQuestion}
              style={{ borderRadius: 8, border: "none", padding: "6px 8px", cursor: "pointer" }}
            >
              Reload current question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
