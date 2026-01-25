// src/components/GameScreen.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import { clamp, flagSrc, shuffle } from "../App";
import { submitTimeTrialResult } from "../timeTrialResultsApi";

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
const CORRECT_ANSWER_HOLD_MS = 150;
const PAUSE_HINT_MS = 1500;

const afterCorrectHighlight = (fn) => {
  nextFrame(() => {
    setTimeout(fn, CORRECT_ANSWER_HOLD_MS);
  });
};

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
  const localFlagPreloadRef = useRef(new Set());

  // refs to know if run started / finished / already lost a life
  const runStartedRef = useRef(false);
  const runEndedRef = useRef(false);
  const lifeLostRef = useRef(false);
  const submittedTimeTrialResultRef = useRef(false);

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
  function buildQuestions(ld, qc) {
    if (!ld) return [];
    const pool = ld.pool || [];
    if (!pool.length) return [];

    const shuffledPool = shuffle(pool);
    const qs = [];

    for (let i = 0; i < qc; i++) {
      const correct = shuffledPool[i % shuffledPool.length];
      const correctName = correct.name;
      const others = shuffledPool.filter((f) => f.code !== correct.code);

      // score how similar each candidate is to the correct flag
      const scored = others.map((f) => ({
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
        const remaining = others.filter(
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
      while (uniqueNames.length < 4 && idxGuard < others.length) {
        const extra = others[idxGuard++];
        if (extra && !seen.has(extra.name)) {
          seen.add(extra.name);
          uniqueNames.push(extra.name);
        }
      }

      const opts = shuffle(uniqueNames);
      qs.push({ correct, options: opts });
    }

    return qs;
  }

  // initial questions
  const [questions, setQuestions] = useState(() =>
    buildQuestions(levelDef, questionCount)
  );

  // rebuild when level / count changes
  useEffect(() => {
    setQuestions(buildQuestions(levelDef, questionCount));
  }, [levelDef, questionCount]);

  // ---------- STATE ----------
  const [qIndex, setQIndex] = useState(0);
  const [skulls, setSkulls] = useState(0);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState(false);

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [hintError, setHintError] = useState("");

  // time trial
  const [ttScore, setTtScore] = useState(0);
  const [ttRemaining, setTtRemaining] = useState(TT_MS_PER_Q);
  const [ttPaused, setTtPaused] = useState(false); // pause state

  // show “you earned 100 coins!”
  const [showCoinReward, setShowCoinReward] = useState(false);

  // ⭐ this run's stars (what we show on the success screen)
  const [runStars, setRunStars] = useState(0);

  // reset base state on level/mode change
  useEffect(() => {
    setQIndex(0);
    setSkulls(0);
    setDone(false);
    setFail(false);
    setSelectedAnswer(null);
    setWrongAnswers([]);
    setTtScore(0);
    setTtRemaining(TT_MS_PER_Q);
    setTtPaused(false);
    setShowCoinReward(false);
    setRunStars(0);
    runStartedRef.current = false;
    runEndedRef.current = false;
    lifeLostRef.current = false;
  }, [levelId, mode]);

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
    
  }, [mode, done, fail, ttPaused]);

  const current = questions[qIndex];
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
  useEffect(() => {
    if (!current?.correct || !isLocalFlag(current.correct)) return;
    const code = current.correct.code;
    if (code && localFlagImages[code]) return;
    void loadLocalFlagImage(current.correct);
  }, [current?.correct, localFlagImages]);
  useEffect(() => {
    if (mode !== "local") return;
    const pool = levelDef?.pool || [];
    const localFlags = pool.filter(isLocalFlag);
    if (!localFlags.length) return;

    const queue = localFlags.filter(
      (flag) =>
        flag?.code &&
        !localFlagImages[flag.code] &&
        !localFlagPreloadRef.current.has(flag.code)
    );
    if (!queue.length) return;
    queue.forEach((flag) => localFlagPreloadRef.current.add(flag.code));

    const preloadNext = async (index) => {
      if (index >= queue.length) return;
      await loadLocalFlagImage(queue[index]);
      await preloadNext(index + 1);
    };
    void preloadNext(0);
  }, [levelDef, localFlagImages, mode]);
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
      ? localFlagImages[current.correct.code] ||
        current.correct.image ||
        current.correct.img ||
        flagSrc(current.correct, 320)
      : current?.correct
      ? flagSrc(current.correct, 320)
      : null;
  const isLocalCurrent = current?.correct && isLocalFlag(current.correct);
  const localFallbackSrc = current?.correct?.fallbackImg || "";
  const displayFlagSrc = isLocalCurrent
    ? localFlagImages[current.correct.code] ||
      currentFlagSrc ||
      localFallbackSrc
    : currentFlagSrc;

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
  }

  function handleUseAutoPass() {
    if (!hints || !setHints) return;
    if ((hints.autoPass ?? 0) <= 0) {
      setHintError(t && lang ? t(lang, "hint.notEnough") : "Not enough hints.");
      setTimeout(() => setHintError(""), 1400);
      return;
    }
    if (!current) return;

    // act as if we clicked the correct answer
    handleAnswer(current.correct.name, { fromHint: true });
    setHints((prev) => ({
      ...prev,
      autoPass: Math.max(0, (prev?.autoPass ?? 0) - 1),
    }));
  }

  function handleUsePause() {
    if (mode !== "timetrial") return;
    if (!hints || !setHints) return;
    if ((hints.pause ?? 0) <= 0) {
      setHintError(t && lang ? t(lang, "hint.notEnough") : "Not enough hints.");
      setTimeout(() => setHintError(""), 1400);
      return;
    }

    // pause for 3 seconds
    setTtPaused(true);
    setHints((prev) => ({
      ...prev,
      pause: Math.max(0, (prev?.pause ?? 0) - 1),
    }));
    setTimeout(() => {
      setTtPaused(false);
    }, PAUSE_HINT_MS);
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
  function handleAnswer(answer, { fromHint = false } = {}) {
    if (!current || done || fail) return;
    // normal clicks shouldn't work while we show colours
    if (!fromHint && selectedAnswer !== null) return;

    const isCorrect =
      current.correct && current.correct.name === answer ? true : false;

    // show highlight
    setSelectedAnswer(answer);

    // ----- CLASSIC -----
    if (isClassicMode) {
      if (isCorrect) {
        soundCorrect && soundCorrect();
        const lastQ = qIndex + 1 >= questionCount;

        afterCorrectHighlight(() => {
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
          } else {
            setQIndex((p) => p + 1);
            setSelectedAnswer(null);
            setWrongAnswers([]);
          }
        });
      } else {
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
        setTimeout(() => setSelectedAnswer(null), WRONG_ANSWER_RESET_MS);
      }
      return;
    }

    // ----- TIME TRIAL -----
    if (mode === "timetrial") {
      if (isCorrect) {
        soundCorrect && soundCorrect();
        const gain = Math.floor((ttRemaining / TT_MS_PER_Q) * TT_MAX_PER_Q);
        const newTotal = ttScore + gain;
        const lastQ = qIndex + 1 >= questionCount;

        afterCorrectHighlight(() => {
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
          } else {
            setTtScore(newTotal);
            setQIndex((p) => p + 1);
            setTtRemaining(TT_MS_PER_Q);
            setSelectedAnswer(null);
            setWrongAnswers([]);
          }
        });
      } else {
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
        setTimeout(() => setSelectedAnswer(null), WRONG_ANSWER_RESET_MS);
      }
    }
  }

  // if player leaves the GameScreen mid-run, count it as a lost life ONCE
  useEffect(() => {
    return () => {
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
    
  }, [mode, levelId]);

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
    setQuestions(buildQuestions(levelDef, questionCount));
    setQIndex(0);
    setSkulls(0);
    setDone(false);
    setFail(false);
    setSelectedAnswer(null);
    setWrongAnswers([]);
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
                  {t && lang ? t(lang, "hint.remove2Label") : "Remove 2"}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hint.remove2Desc")
                  : "removes two wrong answers."}
              </li>
              <li style={{ marginBottom: 6 }}>
                ✅{" "}
                <strong>
                  {t && lang ? t(lang, "hint.autoPassLabel") : "Auto Pass"}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hint.autoPassDesc")
                  : "picks the correct flag for you."}
              </li>
              <li style={{ marginBottom: 6 }}>
                ⏸️{" "}
                <strong>
                  {t && lang ? t(lang, "hint.pauseLabel") : "Pause"}
                </strong>{" "}
                —{" "}
                {t && lang
                  ? t(lang, "hint.pauseDesc")
                  : "pauses the timer for 3 seconds (Time Trial only)."}
              </li>
            </ul>
            <button
              onClick={() => {
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
          background: "#eef2ff",
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
      {done ? (
        mode === "timetrial" ? (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#166534",
                marginBottom: 10,
              }}
            >
              {t && lang ? t(lang, "timeTrialComplete") : "Time Trial Complete"}
            </h2>
            <div style={{ fontSize: 16, marginBottom: 6 }}>
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
                  ? t(lang, "hint.remove2Desc")
                  : "Remove 2 wrong answers"
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
              <span aria-hidden="true">🎯</span>
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
                  ? t(lang, "hint.autoPassDesc")
                  : "Auto-pass (correct answer)"
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
              <span aria-hidden="true">✅</span>
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
                  ? t(lang, "hint.pauseDesc")
                  : "Pause timer for 3 seconds"
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
              <span aria-hidden="true">⏸️</span>
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
              background: "#e2e8f0",
              borderRadius: 16,
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              position: "relative",
            }}
          >
            {current ? (
              <img
                src={displayFlagSrc || flagSrc(current.correct, 320)}
                alt={current.correct.name}
                onError={async (event) => {
                  const fallback = current?.correct?.fallbackImg;
                  if (current?.correct && isLocalFlag(current.correct)) {
                    const resolved = await loadLocalFlagImage(current.correct);
                    if (resolved && event.currentTarget.src !== resolved) {
                      event.currentTarget.src = resolved;
                      return;
                    }
                  }
                  if (process.env.NODE_ENV !== "production") {
                    console.warn(
                      "Missing local flag image; using fallback.",
                      current?.correct?.code
                    );
                  }
                  if (fallback && event.currentTarget.src !== fallback) {
                    event.currentTarget.src = fallback;
                  }
                }}
                style={{
                  maxWidth: 256,
                  maxHeight: 160,
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                }}
              />
            ) : (
              <div>{t && lang ? t(lang, "loading") : "Loading…"}</div>
            )}
          </div>

          {/* ANSWERS */}
          <div className="game-answers">
            {current
              ? current.options.map((opt) => {
                  const isSelected = selectedAnswer === opt;
                  const isWrong = wrongAnswers.includes(opt);
                  let border = "1px solid #e2e8f0";
                  let bg = "#fff";
                  if (isSelected) {
                    const correct = current.correct.name === opt;
                    border = correct
                      ? "2px solid #22c55e"
                      : "2px solid #ef4444";
                    bg = correct ? "#ecfdf3" : "#fef2f2";
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
                      key={opt}
                      onClick={() => handleAnswer(opt)}
                      disabled={isWrong || selectedAnswer !== null}
                      style={{
                        background: bg,
                        border,
                        borderRadius: 14,
                        padding: "10px 12px",
                        textAlign: "left",
                        fontWeight: 500,
                        cursor:
                          isWrong || selectedAnswer !== null
                            ? "not-allowed"
                            : "pointer",
                        opacity: isWrong ? 0.5 : 1,
                        transition: "background 0.15s ease, border 0.15s ease",
                      }}
                      className="game-answer-button"
                    >
                      {label}
                    </button>
                  );
                })
              : t && lang
              ? t(lang, "loadingChoices")
              : "Loading choices…"}
          </div>
        </>
      )}
    </div>
  );
}
