"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DataConnection, Peer } from "peerjs";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crown,
  Hourglass,
  LogIn,
  RefreshCw,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  peerIdForCode,
  type HostMessage,
  type HostPhase,
  type PublicQuestion,
  type PublicQuiz,
  type StudentAnswerState,
  type StudentMessage,
  type StudentReveal,
  type StudentState,
} from "@/lib/quiz-classroom";
import { readSession, writeSession, uid } from "@/lib/storage";
import { useHydrated } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Podium } from "@/components/Podium";
import { LeaderboardTable } from "@/components/quiz/QuizHostView";
import { cn } from "@/lib/cn";

const IDENTITY_KEY = "dbs_quiz_identity_v1";

/** Quizizz-style answer-card palette (yellow-green, purple, orange, teal — cycled for >4 options). */
const OPTION_STYLES = [
  { card: "bg-lime-500 hover:bg-lime-400" },
  { card: "bg-violet-500 hover:bg-violet-400" },
  { card: "bg-orange-500 hover:bg-orange-400" },
  { card: "bg-teal-500 hover:bg-teal-400" },
];

/**
 * Student side of a classroom quiz session.
 *
 * Connects to the teacher's device as a PeerJS client (peer id derived from
 * the room code), receives questions WITHOUT any correctness information, and
 * answers independently. Local queue survives disconnects; results arrive only
 * after the teacher reveals them.
 */
export function QuizStudentView({ code, name: initialName }: { code: string; name: string }) {
  const hydrated = useHydrated();

  const [studentId, setStudentId] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [phase, setPhase] = useState<HostPhase>("lobby");
  const [you, setYou] = useState<StudentState["you"] | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerState>>({});
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState<StudentReveal | null>(null);

  const [kicked, setKicked] = useState(false);
  const [late, setLate] = useState(false);
  const [reachable, setReachable] = useState(true);
  const [connState, setConnState] = useState<"connecting" | "connected" | "offline">("connecting");
  const [allowEditing, setAllowEditing] = useState(false);

  const [pickedId, setPickedId] = useState<string | null>(null);
  /** When the current question's timer started (keyed by index to avoid stale fires). */
  const [timer, setTimer] = useState<{ index: number; start: number }>({ index: -1, start: 0 });
  const [now, setNow] = useState(() => Date.now());

  /* ------------------------------- identity -------------------------------- */
  useEffect(() => {
    if (!hydrated) return;
    const storedName = readSession<string>("dbs_player_name", "");
    if (!initialName && storedName) {
      setName(storedName);
    } else if (initialName) {
      writeSession("dbs_player_name", initialName);
    }
    const identities = readSession<Record<string, string>>(IDENTITY_KEY, {});
    if (!identities[code]) {
      identities[code] = uid("stu");
      writeSession(IDENTITY_KEY, identities);
    }
    setStudentId(identities[code]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /* ------------------------------ connection ------------------------------- */
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const terminalRef = useRef(false);
  const outboxRef = useRef<StudentMessage[]>([]);
  const advanceLockRef = useRef(-1);
  const timeoutHandledRef = useRef(-1);
  const questionStartRef = useRef(Date.now());
  const retryNowRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const canJoin = hydrated && !!studentId && !!name.trim() && !kicked && !late;

  useEffect(() => {
    if (!canJoin) return;
    let cancelled = false;

    const handleHostMessage = (raw: unknown) => {
      if (cancelled || !raw || typeof raw !== "object") return;
      const msg = raw as HostMessage;
      switch (msg.type) {
        case "state": {
          const q = msg.quiz;
          const state = msg.state;
          if (!q || !state) return;
          setQuiz(q);
          setPhase(state.phase);
          setAllowEditing(state.allowEditing === true);
          setYou(state.you);
          setAnswers((prev) => {
            const merged: Record<string, StudentAnswerState> = {};
            for (const a of state.answers ?? []) merged[a.questionId] = a;
            return { ...merged, ...prev };
          });
          setIndex((prev) =>
            Math.max(prev, Math.min(Number(state.you?.currentIndex) || 0, q.questions.length)),
          );
          setReveal(state.reveal ?? null);
          break;
        }
        case "started":
          setPhase("playing");
          break;
        case "answered": {
          // Live Quizizz-style feedback for our own submission (incl. points).
          setAnswers((prev) => ({
            ...prev,
            [msg.questionId]: {
              questionId: msg.questionId,
              answerId: msg.answerId,
              elapsedMs: prev[msg.questionId]?.elapsedMs ?? 0,
              correct: msg.correct,
              correctAnswerId: msg.correctAnswerId,
              points: msg.points,
            },
          }));
          break;
        }
        case "session-reset":
          outboxRef.current = [];
          advanceLockRef.current = -1;
          setAnswers({});
          setIndex(0);
          setReveal(null);
          setPickedId(null);
          setPhase("lobby");
          setYou((prev) => (prev ? { ...prev, status: "joined", currentIndex: 0 } : prev));
          break;
        case "kicked":
          terminalRef.current = true;
          outboxRef.current = [];
          if (msg.reason === "reset") {
            setPhase("lobby");
            setReveal(null);
            setIndex(0);
            setAnswers({});
          } else {
            setKicked(true);
          }
          break;
        case "late":
          terminalRef.current = true;
          setLate(true);
          break;
      }
    };

    const flush = () => {
      const conn = connRef.current;
      if (!conn || !conn.open) return;
      while (outboxRef.current.length > 0) {
        const queued = outboxRef.current[0];
        try {
          conn.send(queued);
          outboxRef.current.shift();
        } catch {
          return; // connection dropped mid-flush; keep the rest queued
        }
      }
    };

    const send = (msg: StudentMessage) => {
      const conn = connRef.current;
      if (conn && conn.open) {
        try {
          conn.send(msg);
          return;
        } catch {
          /* fall through to queue */
        }
      }
      outboxRef.current.push(msg);
    };

    const tryConnect = () => {
      const peer = peerRef.current;
      if (!peer || peer.destroyed || !peer.open) return;
      if (connRef.current && !connRef.current.open) {
        try {
          connRef.current.close();
        } catch {
          /* ignore */
        }
      }
      let conn: DataConnection;
      try {
        conn = peer.connect(peerIdForCode(code), { reliable: true, serialization: "json" });
      } catch {
        scheduleRetry();
        return;
      }
      connRef.current = conn;
      conn.on("open", () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnState("connected");
        setReachable(true);
        try {
          conn.send({ type: "join", studentId: studentId!, name: name.trim() });
        } catch {
          /* handled by close/error below */
        }
        flush();
      });
      conn.on("data", (data) => handleHostMessage(data));
      const onDrop = () => {
        if (cancelled) return;
        setConnState("offline");
        if (connRef.current === conn) connRef.current = null;
        scheduleRetry();
      };
      conn.on("close", onDrop);
      conn.on("error", onDrop);
    };

    const scheduleRetry = () => {
      if (cancelled || terminalRef.current || retryTimerRef.current !== null) return;
      const delay = Math.min(1500 * 2 ** Math.min(attemptRef.current, 3), 8000);
      attemptRef.current += 1;
      setConnState((s) => (s === "connected" ? "offline" : s));
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        ensureConnected();
      }, delay);
    };

    const ensureConnected = () => {
      if (cancelled || terminalRef.current) return;
      const peer = peerRef.current;
      if (!peer || peer.destroyed) {
        void startPeer();
        return;
      }
      if (!peer.open) {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
        scheduleRetry();
        return;
      }
      if (connRef.current?.open) return;
      tryConnect();
    };

    const startPeer = async () => {
      const { default: PeerCtor } = await import("peerjs");
      if (cancelled) return;
      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      const peer = new PeerCtor();
      peerRef.current = peer;

      peer.on("open", () => {
        if (!cancelled) tryConnect();
      });
      peer.on("error", (err: Error & { type?: string }) => {
        if (cancelled || terminalRef.current) return;
        const type = err.type ?? "";
        if (type === "peer-unavailable") {
          // Teacher's device is not hosting right now — keep retrying gently.
          setReachable(false);
          setConnState("connecting");
          scheduleRetry();
          return;
        }
        if (type === "network" || type === "disconnected") {
          setReachable(false);
          setConnState("offline");
          scheduleRetry();
          return;
        }
        if (type === "server-error" || type === "browser-incompatible" || type === "webrtc") {
          setConnState("offline");
          setReachable(false);
          scheduleRetry();
        }
      });
      peer.on("disconnected", () => {
        if (!cancelled) {
          try {
            peer.reconnect();
          } catch {
            /* ignore */
          }
        }
      });
    };

    retryNowRef.current = () => {
      attemptRef.current = 0;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      ensureConnected();
    };

    void startPeer();

    return () => {
      cancelled = true;
      clearTimers();
      try {
        connRef.current?.close();
      } catch {
        /* ignore */
      }
      connRef.current = null;
      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      peerRef.current = null;
      retryNowRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canJoin, studentId, name, code]);

  /* ------------------------------ question flow ---------------------------- */
  const total = quiz?.questions.length ?? 0;
  const current: PublicQuestion | null =
    quiz && index < total ? quiz.questions[index] : null;
  const submitted = current ? answers[current.id] !== undefined : false;
  const canProceed = current !== null && (pickedId !== null || submitted);
  const isLast = index + 1 >= total;
  // Running total of points earned so far (host-confirmed points only).
  const totalScore = Object.values(answers).reduce((sum, a) => sum + (a.points ?? 0), 0);

  // Per-question reset: fresh timer, fresh locks, restore any saved pick.
  useEffect(() => {
    const stamp = Date.now();
    questionStartRef.current = stamp;
    setTimer({ index, start: stamp });
    setNow(stamp);
    advanceLockRef.current = -1;
    timeoutHandledRef.current = -1;
    setPickedId(current ? (answers[current.id]?.answerId ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, quiz?.code]);

  // Countdown deadline for the current question only (null until the reset
  // above binds the timer to this index — prevents stale fires on question
  // changes).
  const deadline =
    timer.index === index && current?.timeLimitSec && current.timeLimitSec > 0
      ? timer.start + current.timeLimitSec * 1000
      : null;
  const timerTotalMs = current?.timeLimitSec ? current.timeLimitSec * 1000 : 0;
  const remainingMs = deadline !== null ? Math.max(0, deadline - now) : 0;
  const timerPct =
    deadline !== null && timerTotalMs > 0 ? Math.min(100, (remainingMs / timerTotalMs) * 100) : 0;
  const timerUrgent = deadline !== null && remainingMs <= 5000;

  const sendMsg = useCallback((msg: StudentMessage) => {
    const conn = connRef.current;
    if (conn && conn.open) {
      try {
        conn.send(msg);
        return;
      } catch {
        /* connection dropped mid-send — queue below */
      }
    }
    outboxRef.current.push(msg);
  }, []);

  const goNext = () => {
    if (!studentId || !current) return;
    if (index + 1 >= total) {
      sendMsg({ type: "complete", studentId });
      setYou((prev) => (prev ? { ...prev, status: "completed", currentIndex: total } : prev));
      setIndex(total);
    } else {
      sendMsg({ type: "progress", studentId, index: index + 1 });
      setIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (!studentId || index <= 0) return;
    sendMsg({ type: "progress", studentId, index: index - 1 });
    setIndex((i) => i - 1);
  };

  const recordAnswer = (question: PublicQuestion, answerId: string | null) => {
    if (!studentId) return;
    if (answerId !== null) {
      if (!allowEditing) {
        if (advanceLockRef.current === index) return; // one submission per question
        advanceLockRef.current = index;
      } else if (answers[question.id]?.answerId === answerId) {
        return; // no identical re-submission while editing
      }
    }
    const elapsedMs = Math.max(0, Date.now() - questionStartRef.current);
    sendMsg({ type: "answer", studentId, questionId: question.id, answerId, elapsedMs });
    setAnswers((prev) => ({
      ...prev,
      [question.id]: { questionId: question.id, answerId, elapsedMs },
    }));
  };

  const selectAnswer = (answerId: string) => {
    if (!current) return;
    if (!allowEditing && (pickedId !== null || submitted)) return;
    setPickedId(answerId);
    recordAnswer(current, answerId);
  };

  const handleTimeout = () => {
    if (!current || !studentId) return;
    if (timeoutHandledRef.current === index) return;
    timeoutHandledRef.current = index;
    // Never overwrite an already submitted answer on expiry.
    if (answers[current.id] !== undefined) return;
    recordAnswer(current, null); // save as unanswered
    goNext(); // auto-advance — navigation stays per-student
  };

  // Live countdown tick for the bar (200ms + CSS transition = smooth).
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [deadline]);

  // Auto-submit as unanswered + move on when the timer runs out.
  useEffect(() => {
    if (deadline === null || now < deadline) return;
    handleTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline]);

  useEffect(() => clearTimers, [clearTimers]);

  /* --------------------------------- screens -------------------------------- */
  if (!hydrated || !studentId) {
    return <StudentSkeleton text="Preparing your seat…" />;
  }

  if (!name.trim()) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <Card className="border-gold-200 bg-gold-50/40">
          <CardHeader
            title="What's your name?"
            subtitle={`Room ${code} — your teacher will see this name.`}
            icon={<LogIn className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
              }}
              placeholder="e.g. Alex"
              maxLength={40}
              className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base font-medium text-ink-900 outline-none transition-colors focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
            />
            {nameError ? <p className="text-sm text-brand-600">{nameError}</p> : null}
            <Button
              className="w-full"
              size="lg"
              icon={<ArrowRight className="h-5 w-5" />}
              onClick={submitName}
            >
              Join the quiz
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  function submitName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Please enter your name.");
      return;
    }
    writeSession("dbs_player_name", trimmed);
    setName(trimmed);
  }

  if (kicked) {
    return (
      <StudentShell code={code} quizTitle={quiz?.title} connState={connState}>
        <EmptyState
          icon={<XCircle className="h-7 w-7 text-brand-500" />}
          title="You were removed"
          description="The teacher removed you from this session. Ask them for a new room code if this was a mistake."
          action={
            <Link href="/quiz" className="text-sm font-medium text-gold-600 hover:text-gold-700">
              Join another quiz
            </Link>
          }
        />
      </StudentShell>
    );
  }

  if (late) {
    return (
      <StudentShell code={code} quizTitle={quiz?.title} connState={connState}>
        <EmptyState
          icon={<Hourglass className="h-7 w-7 text-gold-500" />}
          title="This quiz already started"
          description="You joined after the teacher began (or the session already finished). Ask your teacher for a fresh room code."
          action={
            <div className="flex gap-3">
              <Button
                variant="secondary"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => {
                  terminalRef.current = false;
                  setLate(false);
                }}
              >
                Try again
              </Button>
              <Link href="/quiz">
                <Button variant="secondary">Back to join page</Button>
              </Link>
            </div>
          }
        />
      </StudentShell>
    );
  }

  if (!quiz) {
    return (
      <StudentShell code={code} connState={connState}>
        <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
            {reachable && connState !== "offline" ? (
              <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-gold-500 border-t-transparent" />
            ) : (
              <WifiOff className="h-6 w-6" />
            )}
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink-900">
            {reachable ? "Connecting to your teacher…" : "Can't reach the room yet"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {reachable
              ? `Joining room ${code} as ${name}.`
              : `Room ${code} isn't hosting right now. Make sure your teacher has the room open on their screen — or ask for a new code if this room was deleted. We keep retrying automatically.`}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => retryNowRef.current()}>
              Try now
            </Button>
            <Link href="/quiz">
              <Button variant="ghost">Leave</Button>
            </Link>
          </div>
        </div>
      </StudentShell>
    );
  }

  if (phase === "lobby") {
    return (
      <StudentShell code={code} quizTitle={quiz.title} connState={connState}>
        <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink-900">You&apos;re in!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Welcome, <span className="font-semibold text-ink-900">{name}</span>. Waiting for your teacher to start
            the quiz — stay on this screen.
          </p>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Room code</p>
            <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em] text-ink-900">{code}</p>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Wifi className="h-3.5 w-3.5 text-emerald-500" /> Connected to your teacher
          </p>
        </div>
      </StudentShell>
    );
  }

  const finished = phase === "finished";

  if (phase === "playing" && (you?.status === "completed" || !current)) {
    return (
      <StudentShell code={code} quizTitle={quiz.title} connState={connState}>
        <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-600 ring-1 ring-sky-200">
            <Trophy className="h-8 w-8" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink-900">Quiz beendet</h1>
          <p className="mt-2 text-sm font-medium text-ink-700">
            Du hast den Quiz beendet. Bitte warte auf die anderen Teilnehmer.
          </p>
          <p className="mt-1.5 text-sm text-gray-500">
            Results and the answer key appear here for everyone once{" "}
            <span className="font-semibold text-ink-900">all classmates finish</span> (or your teacher ends the
            quiz).
          </p>
          <p className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-500">
            Your score:{" "}
            <span className="font-extrabold text-gold-600">{totalScore.toLocaleString("en-US")}</span> pts
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
            Waiting for the rest of the class…
          </div>
        </div>
      </StudentShell>
    );
  }

  if (finished && reveal) {
    return (
      <StudentShell code={code} quizTitle={quiz.title} connState={connState}>
        <StudentResults quiz={quiz} reveal={reveal} studentId={studentId} />
      </StudentShell>
    );
  }

  if (finished && !reveal) {
    return (
      <StudentShell code={code} quizTitle={quiz.title} connState={connState}>
        <StudentSkeleton text="Finalizing results…" />
      </StudentShell>
    );
  }

  if (!current) {
    return <StudentShell code={code} quizTitle={quiz.title} connState={connState}><StudentSkeleton text="Loading question…" /></StudentShell>;
  }

  // Answer grid adapts to the actual number of choices (2, 3, 4, or more).
  const answerCount = current.answers.length;
  const answerCols =
    answerCount <= 1
      ? "grid-cols-1"
      : answerCount === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : answerCount === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : answerCount === 4
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  // Host-validated feedback for this question (present once answered).
  const feedbackEntry = answers[current.id];
  const feedback: StudentAnswerState | null =
    feedbackEntry &&
    typeof feedbackEntry.correct === "boolean" &&
    typeof feedbackEntry.correctAnswerId === "string" &&
    feedbackEntry.correctAnswerId.length > 0
      ? feedbackEntry
      : null;

  return (
    <StudentShell
      code={code}
      quizTitle={quiz.title}
      connState={connState}
      dark
      controls={
        canProceed ? (
          <>
            {allowEditing && index > 0 ? (
              <QuizNavButton label="Back" icon={<ArrowLeft className="h-4 w-4" />} onClick={goBack} />
            ) : null}
            <QuizNavButton
              label={isLast ? "Finish Quiz" : "Next"}
              icon={
                isLast ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />
              }
              onClick={goNext}
              primary
            />
          </>
        ) : null
      }
    >
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        {/* Countdown timer bar — very top, above the question card */}
        {deadline !== null ? (
          <div className="mb-3 flex items-center gap-3" aria-label="Question timer">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200 ease-linear",
                  timerUrgent ? "bg-rose-500" : "bg-lime-400",
                )}
                style={{ width: `${Math.max(0, Math.min(100, timerPct)).toFixed(2)}%` }}
              />
            </div>
            <span
              className={cn(
                "w-12 shrink-0 text-right font-mono text-sm font-bold tabular-nums",
                timerUrgent ? "animate-pulse text-rose-300" : "text-white/90",
              )}
            >
              {Math.ceil(remainingMs / 1000)}s
            </span>
          </div>
        ) : null}

        {/* Overall quiz progress — thin line under the timer */}
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-lime-400 transition-all duration-300"
            style={{ width: `${((index + (submitted ? 1 : 0)) / total) * 100}%` }}
          />
        </div>

        {/* Running total — updated with every confirmed answer */}
        <div className="mb-4 flex justify-end">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
            Your score:{" "}
            <span className="font-extrabold text-lime-300">{totalScore.toLocaleString("en-US")}</span> pts
          </span>
        </div>

        {/* Question card — large, centered, dark purple */}
        <div className="rounded-3xl border border-white/10 bg-[#2f1863]/85 px-5 py-6 shadow-2xl shadow-violet-950/50 sm:px-8 sm:py-8">
          {/* meta row: points · counter pill · editing chip */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80 sm:justify-self-start">
              {current.points} pts + speed bonus · faster = more
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-extrabold tracking-wide text-white">
              Question {index + 1} of {total}
            </span>
            <span className="sm:justify-self-end">
              {allowEditing ? (
                <span className="whitespace-nowrap rounded-full border border-amber-300/30 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                  Editing on
                </span>
              ) : null}
            </span>
          </div>

          <p className="mt-5 text-center text-xl font-semibold leading-snug text-white sm:text-2xl">
            {current.text}
          </p>

          {/* Answer cards — colorful, adaptive count, Quizizz-style feedback */}
          <div className={cn("mt-6 grid gap-3", answerCols)}>
            {current.answers.map((answer, i) => {
              const style = OPTION_STYLES[i % OPTION_STYLES.length];
              const isSelected = pickedId === answer.id;
              const locked = !allowEditing && (pickedId !== null || submitted);
              // Live feedback (host-validated): green key, red wrong pick,
              // everything else fades out — only after this answer is recorded.
              const isKey = feedback !== null && answer.id === feedback.correctAnswerId;
              const isWrongPick = isSelected && feedback !== null && feedback.correct === false;
              const faded = feedback !== null && !isKey && !isWrongPick;
              return (
                <button
                  key={answer.id}
                  type="button"
                  onClick={() => selectAnswer(answer.id)}
                  disabled={locked || faded}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-4 text-left text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition-all duration-300 sm:text-base",
                    isKey
                      ? "bg-emerald-500 ring-2 ring-white/90"
                      : isWrongPick
                        ? "bg-rose-500 ring-2 ring-white/90"
                        : cn(
                            style.card,
                            isSelected
                              ? "scale-[1.02] ring-2 ring-white"
                              : "hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]",
                          ),
                    faded && "pointer-events-none scale-95 opacity-0",
                    locked && !isKey && !isWrongPick && !faded && "pointer-events-none opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 text-sm font-extrabold text-white ring-1 ring-white/20",
                      (isSelected || isKey) && "bg-white/25",
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">{answer.text}</span>
                  {isSelected || isKey ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : null}
                </button>
              );
            })}
          </div>

          {/* Points earned for this question — host-confirmed with the answer */}
          {feedback !== null ? (
            <p
              className={cn(
                "mt-5 text-center text-sm font-extrabold tracking-wide",
                feedback.correct ? "text-lime-300" : "text-rose-300",
              )}
            >
              {feedback.correct
                ? `+${(feedback.points ?? 0).toLocaleString("en-US")} pts — correct!`
                : "0 pts — not correct"}
            </p>
          ) : null}

          <p className={cn("text-center text-xs text-white/50", feedback !== null ? "mt-2" : "mt-5")}>
            {allowEditing
              ? "Your answer is checked instantly — green means correct, red means wrong — and you can revise until you finish. Correct answers always keep their full points and earn up to 50% more by speed. Full results appear when everyone finishes."
              : "Your answer is checked instantly — green means correct, red means wrong. Correct answers always keep their full points and earn up to 50% more by speed — the faster, the more. Full results appear when everyone finishes."}
          </p>
        </div>
      </div>
    </StudentShell>
  );
}

/* --------------------------------- results -------------------------------- */

function StudentResults({
  quiz,
  reveal,
  studentId,
}: {
  quiz: PublicQuiz;
  reveal: StudentReveal;
  studentId: string;
}) {
  const mine = reveal.leaderboard.find((row) => row.playerId === studentId) ?? null;
  const correctByQuestion = new Map(reveal.answerKey.map((k) => [k.questionId, k.correctAnswerId]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardBody className="flex flex-col items-center gap-1 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gold-500 ring-1 ring-emerald-200">
            <Crown className="h-7 w-7" />
          </span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">Results revealed!</h1>
          <p className="text-sm text-gray-500">Everyone finished — here are the final standings.</p>
          {mine ? (
            <div className="mt-4 grid w-full max-w-xs grid-cols-3 gap-2 rounded-2xl bg-white p-4 ring-1 ring-emerald-200">
              <div>
                <p className="text-lg font-extrabold text-gold-600">{mine.points}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Points</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-emerald-600">{mine.correct}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Correct</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-ink-900">#{mine.rank}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Rank</p>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Top 3" subtitle="Gold, silver and bronze" icon={<Crown className="h-5 w-5" />} />
        <CardBody>
          <Podium
            entries={reveal.leaderboard.slice(0, 3).map((row) => ({
              id: row.playerId,
              name: row.name,
              points: row.points,
              rank: row.rank,
              subtitle: `${row.correct} correct · ${row.accuracy}%`,
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Everyone" subtitle="Rank, points, correct / incorrect, accuracy" icon={<Users className="h-5 w-5" />} />
        <CardBody>
          <LeaderboardTable rows={reveal.leaderboard} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Your answers"
          subtitle="Correct answers and points — now public"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <CardBody className="space-y-3">
          {quiz.questions.map((q, i) => {
            const correctId = correctByQuestion.get(q.id) ?? null;
            const correctText = q.answers.find((a) => a.id === correctId)?.text ?? "—";
            const yours = reveal.yourResponses.find((r) => r.questionId === q.id) ?? null;
            const yourId = yours?.answerId ?? null;
            const yourText = q.answers.find((a) => a.id === yourId)?.text ?? null;
            const isCorrect = yours?.correct === true;
            const isUnanswered = yourId === null;
            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-2xl border p-4",
                  isCorrect
                    ? "border-emerald-200 bg-emerald-50/50"
                    : isUnanswered
                      ? "border-gray-200 bg-gray-50/60"
                      : "border-brand-200 bg-brand-50/50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink-900">
                    <span className="mr-2 text-gray-400">{i + 1}.</span>
                    {q.text}
                  </p>
                  <span className="shrink-0 text-xs font-semibold">
                    {isCorrect ? (
                      <span className="text-emerald-600">+{yours?.points ?? 0} pts ✓</span>
                    ) : isUnanswered ? (
                      <span className="text-gray-400">Unanswered</span>
                    ) : (
                      <span className="text-brand-600">✗ 0 pts</span>
                    )}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-gray-500">
                    Your answer:{" "}
                    <span className={cn("font-medium", isCorrect ? "text-emerald-600" : isUnanswered ? "text-gray-400" : "text-brand-600")}>
                      {yourText ?? "Unanswered"}
                    </span>
                  </p>
                  <p className="text-gray-500">
                    Correct answer: <span className="font-medium text-ink-900">{correctText}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="flex justify-center pb-4">
        <Link href="/quiz">
          <Button size="lg" icon={<ArrowRight className="h-5 w-5" />}>
            Back to quizzes
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------- shell ---------------------------------- */

function StudentSkeleton({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
      </span>
      <p className="mt-4 text-sm text-gray-500">{text}</p>
    </div>
  );
}

/** Compact header control for the dark quiz screen (Back / Next / Finish Quiz). */
function QuizNavButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold shadow-sm transition-all duration-200 active:scale-95 sm:px-3.5 sm:text-sm",
        primary
          ? "border-transparent bg-lime-500 text-white hover:bg-lime-400"
          : "border-white/15 bg-white/10 text-white/90 hover:border-white/25 hover:bg-white/20",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StudentShell({
  code,
  quizTitle,
  connState,
  dark = false,
  controls,
  children,
}: {
  code: string;
  quizTitle?: string;
  connState: "connecting" | "connected" | "offline";
  dark?: boolean;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-[calc(100dvh-4rem)] transition-colors duration-300",
        dark && "quiz-grid-bg text-white",
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-20 border-b backdrop-blur-md",
          dark ? "border-white/10 bg-[#1d0f42]/90" : "border-gray-200 bg-white/90",
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className={cn("truncate text-sm font-bold", dark ? "text-white" : "text-ink-900")}>
              {quizTitle ?? "Quiz"}
            </p>
            <p className={cn("text-[11px] uppercase tracking-wide", dark ? "text-white/50" : "text-gray-400")}>
              Room{" "}
              <span className={cn("font-mono font-bold", dark ? "text-lime-300" : "text-gold-600")}>
                {code}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {controls}
            <span
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                connState === "connected"
                  ? dark
                    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : connState === "connecting"
                    ? dark
                      ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                      : "border-gold-200 bg-gold-50 text-gold-700"
                    : dark
                      ? "border-rose-300/25 bg-rose-300/10 text-rose-200"
                      : "border-brand-200 bg-brand-50 text-brand-700",
              )}
            >
              {connState === "connected" ? (
                <>
                  <Wifi className="h-3 w-3" /> Live
                </>
              ) : connState === "connecting" ? (
                <>
                  <span
                    className={cn(
                      "h-2 w-2 animate-pulse rounded-full",
                      dark ? "bg-amber-300" : "bg-gold-500",
                    )}
                  />{" "}
                  Connecting
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Offline — retrying
                </>
              )}
            </span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
