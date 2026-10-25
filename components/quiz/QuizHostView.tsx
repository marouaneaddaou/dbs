"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DataConnection, Peer } from "peerjs";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Crown,
  Facebook,
  LayoutDashboard,
  Link2,
  ListChecks,
  Play,
  RotateCcw,
  Share2,
  ShieldCheck,
  Square,
  Trophy,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { QuizHistoryMap, QuizRoom, QuizSessionRecord } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useLocalStorage, useHydrated } from "@/lib/hooks";
import { findQuizByCode, addHistoryEntry, buildRoomShareUrl, buildWhatsAppShareUrl } from "@/lib/quiz";
import { copyToClipboard } from "@/lib/io";
import { normalizeCode } from "@/lib/voting";
import { HostSession, peerIdForCode, type HostMessage, type HostTransport } from "@/lib/quiz-classroom";
import { useAdminAuth } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Podium } from "@/components/Podium";
import { cn } from "@/lib/cn";

/**
 * Teacher side of a classroom quiz session.
 *
 * This device hosts the shared room (PeerJS peer id `dbs-quiz-<CODE>`), keeps
 * the answer key local, tracks every student's progress, and reveals results
 * only when all active students completed — or when the teacher explicitly
 * ends the session or removes an unfinished participant.
 */
export function QuizHostView({ code }: { code: string }) {
  const params = useSearchParams();
  const wantsHost = params.get("host") === "1";
  const { authed, hydrated: authHydrated } = useAdminAuth();
  const normalizedCode = normalizeCode(code);

  if (!authHydrated) return <HostSkeleton />;
  if (wantsHost && !authed) {
    return (
      <AdminLogin
        title="Host-Anmeldung erforderlich"
        description="Melde dich mit dem Admin-Passwort an, um die Host-Steuerung für dieses Quiz zu öffnen."
      />
    );
  }
  return <HostSessionScreen code={normalizedCode} />;
}

function HostSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
    </div>
  );
}

function HostSessionScreen({ code }: { code: string }) {
  const toast = useToast();
  const hydrated = useHydrated();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const { value: rooms, hydrated: roomsHydrated } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );
  const { value: sessions, setValue: setSessions, hydrated: sessionsHydrated } = useLocalStorage<
    Record<string, QuizSessionRecord>
  >(STORAGE_KEYS.quizSessions, {});
  const { setValue: setHistory } = useLocalStorage<QuizHistoryMap>(
    STORAGE_KEYS.quizHistory,
    {},
  );

  const [peerStatus, setPeerStatus] = useState<"starting" | "open" | "error">("starting");
  const [peerError, setPeerError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const sessionRef = useRef<HostSession | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connsRef = useRef<Set<DataConnection>>(new Set());
  const retryTimerRef = useRef<number | null>(null);

  const room = roomsHydrated ? findQuizByCode(rooms, code) ?? null : null;
  const session = sessionRef.current;

  /* --------------------------- host peer lifecycle --------------------------- */
  useEffect(() => {
    if (!hydrated || !roomsHydrated || !sessionsHydrated || !room) return;
    let cancelled = false;
    let attempts = 0;
    let lastPeerFailure: string | null = null;

    const transport: HostTransport = {
      send(token, message: HostMessage) {
        const conn = token as DataConnection;
        try {
          if (conn && conn.open) conn.send(message);
        } catch {
          /* connection already gone — the next sync will repair state */
        }
      },
      drop(token) {
        try {
          (token as DataConnection).close();
        } catch {
          /* ignore */
        }
      },
      onChange: forceUpdate,
      persistSession(record) {
        setSessions((prev) => ({ ...prev, [room.code]: record }));
      },
      persistHistory(entry) {
        setHistory((prev) => {
          const runs = prev[entry.roomCode] ?? [];
          if (runs.some((run) => run.finishedAt === entry.finishedAt)) return prev;
          return addHistoryEntry(prev, entry);
        });
      },
    };

    sessionRef.current = new HostSession(room, transport, sessions[room.code] ?? null);
    forceUpdate();

    async function createPeer() {
      if (cancelled) return;
      const { default: PeerCtor } = await import("peerjs");
      if (cancelled) return;

      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }

      const peer = new PeerCtor(peerIdForCode(room!.code));
      peerRef.current = peer;

      peer.on("open", () => {
        if (cancelled) return;
        attempts = 0;
        setPeerStatus("open");
        setPeerError(null);
      });

      peer.on("connection", (conn: DataConnection) => {
        if (cancelled) {
          conn.close();
          return;
        }
        connsRef.current.add(conn);
        conn.on("data", (data) => sessionRef.current?.handleRaw(conn, data));
        const handleClose = () => {
          connsRef.current.delete(conn);
          sessionRef.current?.handleDisconnect(conn);
        };
        conn.on("close", handleClose);
        conn.on("error", handleClose);
      });

      peer.on("error", (err: Error & { type?: string }) => {
        if (cancelled) return;
        const type = err.type ?? "";
        lastPeerFailure = type || "unknown";
        if (type === "unavailable-id") {
          // The signaling server can briefly hold a just-released id (page
          // reload or an immediately reopened room). Keep the retry loop
          // running; only report "already open" if it never frees up.
          setPeerStatus((s) => (s === "open" ? s : "starting"));
          return;
        }
        if (type === "peer-unavailable" || type === "network" || type === "disconnected") {
          setPeerStatus((s) => (s === "open" ? s : "starting"));
          return;
        }
        setPeerStatus("error");
        setPeerError("Der gemeinsame Raum konnte nicht gestartet werden. Prüfe deine Internetverbindung und lade die Seite neu.");
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
    }

    async function boot() {
      await createPeer();
      // The signaling server may briefly hold a just-released id (dev remounts).
      const retryIfStuck = () => {
        if (cancelled) return;
        if (peerRef.current && peerRef.current.open) return;
        attempts += 1;
        if (attempts > 20) {
          // ~30s of retries: the id was either genuinely taken or we are offline.
          setPeerStatus("error");
          setPeerError(
            lastPeerFailure === "unavailable-id"
              ? `Für den Raumcode ${room!.code} ist bereits eine Sitzung geöffnet (möglicherweise in einem anderen Tab oder Fenster). Schließe sie und öffne diese Seite erneut.`
              : "Der gemeinsame Raum konnte nicht gestartet werden. Prüfe deine Internetverbindung und lade die Seite neu.",
          );
          return;
        }
        retryTimerRef.current = window.setTimeout(async () => {
          if (cancelled) return;
          if (peerRef.current && peerRef.current.open) return;
          await createPeer();
          retryIfStuck();
        }, 1500);
      };
      retryIfStuck();
    }

    void boot();

    // connsRef.current never changes identity (same Set), so capturing it here
    // keeps the cleanup stable for lint while still closing live connections.
    const conns = connsRef.current;
    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      for (const conn of conns) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
      }
      conns.clear();
      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      peerRef.current = null;
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, roomsHydrated, sessionsHydrated, room?.code]);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(`Code ${code} kopiert.`),
      () => toast.error("Der Code konnte nicht kopiert werden."),
    );
  }, [code, toast]);

  /* ------------------------------ share popup ------------------------------ */

  // Built from the live origin so it works on localhost, a classroom LAN and
  // any deployed domain — never a hardcoded host. Only computed once the
  // popup is open (client-only), so SSR stays window-free.
  const shareUrl =
    shareOpen && typeof window !== "undefined"
      ? buildRoomShareUrl(room?.code ?? code, window.location.origin)
      : "";
  const shareTitle = room?.title || `Quiz ${room?.code ?? code}`;
  const shareText = shareUrl
    ? `Mach beim Quiz „${shareTitle}“ mit – Raum ${room?.code ?? code}: ${shareUrl}`
    : "";

  async function copyRoomLink() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) toast.success(`Raumlink kopiert – ${shareUrl}`);
    else toast.error("Der Raumlink konnte nicht kopiert werden.");
  }

  function shareToWhatsApp() {
    window.open(buildWhatsAppShareUrl(shareText), "_blank", "noopener,noreferrer");
  }

  function shareToFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function shareViaApps() {
    if (typeof navigator.share !== "function") {
      // No Web Share API here (e.g. desktop browsers) — fall back to copying.
      const ok = await copyToClipboard(shareUrl);
      if (ok) toast.success("Teilen wird in diesem Browser nicht unterstützt – der Raumlink wurde stattdessen kopiert.");
      else toast.error("Teilen wird in diesem Browser nicht unterstützt.");
      return;
    }
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
    } catch (err) {
      // A dismissed share sheet is not an error worth reporting.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Das Teilen-Menü konnte nicht geöffnet werden.");
      }
    }
  }

  if (!hydrated || !roomsHydrated || !sessionsHydrated) return <HostSkeleton />;

  if (!room) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title={`Quiz „${code}“ wurde nicht gefunden`}
          description="Die Sitzung wird auf dem Gerät gehostet, auf dem du sie öffnest. Stelle sicher, dass das Quiz im gemeinsamen Speicher vorhanden ist, oder erstelle bzw. importiere es zuerst."
          action={
            <Link href="/admin" className="text-sm font-medium text-gold-600 hover:text-gold-700">
              Zurück zum Dashboard
            </Link>
          }
        />
      </div>
    );
  }

  if (!session) return <HostSkeleton />;

  const students = session.listStudents();
  const progress = session.progress();
  const phase = session.phase;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref="/admin"
        backLabel="Zurück zum Dashboard"
        eyebrow={`Quiz ${room.code}`}
        title={room.title || "Unbenanntes Quiz"}
        description={room.description || undefined}
        icon={<Trophy className="h-6 w-6" />}
        action={
          <Badge tone={phase === "lobby" ? "neutral" : phase === "playing" ? "brand" : "success"}>
            {phase === "lobby" ? "Warteraum" : phase === "playing" ? "Läuft" : "Beendet"}
          </Badge>
        }
      />

      {/* Room code + connection status */}
      <Card className={cn("mb-6", peerStatus === "error" ? "border-brand-300" : "border-gold-200 bg-gold-50/50")}>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Raumcode – mit den Teilnehmenden teilen</p>
            <p className="mt-1 font-mono text-4xl font-extrabold tracking-[0.3em] text-ink-900">{room.code}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              {peerStatus === "open" ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" /> Raum offen – Teilnehmende können von jedem Gerät beitreten.
                </>
              ) : peerStatus === "starting" ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />{" "}
                  Gemeinsamer Raum wird geöffnet…
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-brand-600" /> Raum konnte nicht geöffnet werden.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copyCode}>
              Code kopieren
            </Button>
            <Button variant="gold" icon={<Share2 className="h-4 w-4" />} onClick={() => setShareOpen(true)}>
              Raum teilen
            </Button>
          </div>
        </CardBody>
        {peerStatus === "error" && peerError ? (
          <div className="border-t border-brand-200 bg-brand-50 px-5 py-3 text-sm text-brand-700">{peerError}</div>
        ) : null}
      </Card>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        size="sm"
        title="Raum teilen"
        description={`Raum ${room.code} – sende den Beitrittslink an die Teilnehmenden.`}
      >
        <div className="space-y-3">
          <p className="break-all rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
            {shareUrl}
          </p>
          <div className="space-y-2">
            <ShareOption
              icon={<Link2 className="h-4 w-4" />}
              label="Raumlink kopieren"
              hint="Kopiert den direkten Link in die Zwischenablage"
              onClick={copyRoomLink}
            />
            <ShareOption
              icon={<WhatsAppGlyph className="h-4 w-4" />}
              label="Über WhatsApp teilen"
              onClick={shareToWhatsApp}
            />
            <ShareOption
              icon={<Facebook className="h-4 w-4" />}
              label="Über Facebook teilen"
              onClick={shareToFacebook}
            />
            <ShareOption
              icon={<Share2 className="h-4 w-4" />}
              label="Über andere Apps teilen"
              hint={
                typeof navigator !== "undefined" && typeof navigator.share === "function"
                  ? undefined
                  : "Hier nicht unterstützt – der Link wird stattdessen kopiert"
              }
              onClick={shareViaApps}
            />
          </div>
        </div>
      </Modal>

      {/* Progress summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Users className="h-4 w-4" />} label="Beigetreten" value={progress.joined} />
        <Stat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Abgeschlossen"
          value={progress.completed}
          tone={progress.completed > 0 ? "success" : undefined}
        />
        <Stat icon={<Play className="h-4 w-4" />} label="Läuft" value={progress.playing} />
        <Stat icon={<WifiOff className="h-4 w-4" />} label="Getrennt" value={progress.disconnected} tone={progress.disconnected > 0 ? "warning" : undefined} />
      </section>

      {/* ------------------------------- LOBBY ------------------------------- */}
      {phase === "lobby" ? (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Teilnehmende"
              subtitle={`${students.length} beigetreten – sie antworten auf ihren eigenen Geräten`}
              icon={<Users className="h-5 w-5" />}
            />
            <CardBody className="space-y-3">
              {students.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-400">
                  Warte darauf, dass Teilnehmende den Code <span className="font-mono font-bold">{room.code}</span>{" "}
                  mit ihrem Namen eingeben…
                </p>
              ) : (
                <ul className="space-y-2">
                  {students.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                        {s.name}
                        {s.connected ? null : (
                          <Badge tone="warning">offline</Badge>
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-gray-400 hover:text-brand-600"
                        onClick={() => session.removeStudent(s.id)}
                      >
                        Entfernen
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Bereit zum Start?"
              subtitle={`${room.questions.length} Fragen`}
              icon={<Play className="h-5 w-5" />}
            />
            <CardBody className="space-y-4">
              <ul className="space-y-2 text-sm text-gray-500">
                <li className="flex items-center justify-between">
                  <span>Fragen</span> <span className="font-medium text-ink-900">{room.questions.length}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Zeitlimits</span>{" "}
                  <span className="font-medium text-ink-900">
                    {room.questions.filter((q) => q.timeLimitSec).length ? "Aktiviert" : "Deaktiviert"}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Antworten sichtbar</span>{" "}
                  <span className="font-medium text-ink-900">Erst wenn alle fertig sind (oder du beendest)</span>
                </li>
              </ul>
              <Button
                className="w-full"
                size="lg"
                icon={<Play className="h-5 w-5" />}
                disabled={students.length === 0}
                onClick={() => {
                  const result = session.start();
                  if (!result.ok) toast.error(result.error ?? "Das Quiz konnte nicht gestartet werden.");
                  else toast.success("Quiz gestartet – die Teilnehmenden können auf ihren Bildschirmen antworten.");
                }}
              >
                Quiz starten
              </Button>
              <p className="text-center text-xs text-gray-400">
                Nach dem Start können keine neuen Teilnehmenden mehr beitreten.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* ------------------------------ PLAYING ------------------------------ */}
      {phase === "playing" ? (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader
              title="Rangliste"
              subtitle="Aktualisiert sich nach jeder Antwort – sortiert nach Punkten, richtigen Antworten und Geschwindigkeit"
              icon={<Crown className="h-5 w-5" />}
            />
            <CardBody>
              <LeaderboardTable rows={session.finalLeaderboard()} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Teilnehmende"
              subtitle="Alle antworten unabhängig auf ihrem eigenen Gerät"
              icon={<Users className="h-5 w-5" />}
            />
            <CardBody className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-1.5">
                <Switch
                  checked={session.allowEditing}
                  onChange={(value) => session.setAllowEditing(value)}
                  label="Antwortänderung erlauben"
                  description={
                    session.allowEditing
                      ? "An – Teilnehmende können zu früheren Fragen zurückkehren und abgegebene Antworten bis zum Abschluss ändern."
                      : "Aus – abgegebene Antworten sind gesperrt; es geht nur vorwärts."
                  }
                />
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {students.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{s.name}</span>
                      <span className="text-xs text-gray-500">
                        {session.responses.filter((r) => r.playerId === s.id).length}/{room.questions.length} beantwortet
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusChip status={s.status} connected={s.connected} />
                      {s.status !== "completed" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-gray-400 hover:text-brand-600"
                          title="Teilnehmende Person entfernen (ermöglicht das Enthüllen, falls sie nicht fertig wird)"
                          onClick={() => session.removeStudent(s.id)}
                        >
                          Entfernen
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Fortschritt pro Frage"
              subtitle="Wie viele Teilnehmende jede Frage beantwortet haben"
              icon={<ListChecks className="h-5 w-5" />}
            />
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Frage</th>
                    <th className="px-3 py-2 text-right">Beantwortet</th>
                    <th className="px-3 py-2 text-right">Richtig</th>
                  </tr>
                </thead>
                <tbody>
                  {session.questionStats().map((stat, i) => (
                    <tr key={stat.questionId} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold text-gray-400">{i + 1}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-ink-900">
                        {room.questions[i]?.text || "Ohne Titel"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-ink-900">
                        {stat.answered}/{stat.total}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600">{stat.correct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="danger" size="lg" icon={<Square className="h-4 w-4" />} onClick={() => setConfirmEnd(true)}>
              Quiz beenden & Ergebnisse zeigen
            </Button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------ FINISHED ------------------------------ */}
      {phase === "finished" ? (
        <div className="mt-6 space-y-6">
          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-600 ring-1 ring-emerald-200">
                <Trophy className="h-7 w-7" />
              </span>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">Ergebnisse enthüllt</h2>
              <p className="max-w-md text-sm text-gray-500">
                Lösungen, Punkte und Rangliste sind jetzt für alle verbundenen Geräte sichtbar. Dieser Durchlauf
                wurde im Quiz-Verlauf gespeichert.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rangliste" subtitle="Platz, Punkte, richtig / falsch, Trefferquote" icon={<Crown className="h-5 w-5" />} />
            <CardBody className="space-y-6">
              <Podium
                entries={session.finalLeaderboard().slice(0, 3).map((s) => ({
                  id: s.playerId,
                  name: s.name,
                  points: s.points,
                  rank: s.rank,
                  subtitle: `${s.correct} richtig · ${s.accuracy} %`,
                }))}
              />
              <LeaderboardTable rows={session.finalLeaderboard()} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Schwierigkeit der Fragen"
              subtitle="Fragen, die schwer waren, haben eine niedrige Anzahl richtiger Antworten"
              icon={<ListChecks className="h-5 w-5" />}
            />
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Frage</th>
                    <th className="px-3 py-2 text-right">Beantwortet</th>
                    <th className="px-3 py-2 text-right">Richtig</th>
                    <th className="px-3 py-2 text-right">Erfolg</th>
                  </tr>
                </thead>
                <tbody>
                  {session.questionStats().map((stat, i) => (
                    <tr key={stat.questionId} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold text-gray-400">{i + 1}</td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-ink-900">
                        {room.questions[i]?.text || "Ohne Titel"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{stat.answered}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{stat.correct}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink-900">
                        {stat.answered > 0 ? Math.round((stat.correct / stat.answered) * 100) : 0} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                session.newSession();
                toast.success("Neue Sitzung gestartet – gleicher Code, neuer Warteraum.");
              }}
            >
              Neue Sitzung (gleicher Code)
            </Button>
            <Link href="/admin">
              <Button icon={<LayoutDashboard className="h-4 w-4" />}>Zurück zum Dashboard</Button>
            </Link>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmEnd}
        title="Quiz jetzt beenden?"
        description={
          progress.completed < progress.joined
            ? `${progress.joined - progress.completed} Teilnehmende sind noch nicht fertig. Ihre offenen Fragen bleiben unbeantwortet; Lösungen und Rangliste werden sofort für alle sichtbar.`
            : "Lösungen und Rangliste werden sofort für alle sichtbar."
        }
        confirmLabel="Beenden & zeigen"
        tone="primary"
        onConfirm={() => {
          session.endQuiz();
          setConfirmEnd(false);
          toast.success("Quiz beendet – Ergebnisse wurden gezeigt und gespeichert.");
        }}
        onCancel={() => setConfirmEnd(false)}
      />

      <p className="mt-6 flex items-start gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
        Während der Live-Sitzung bleiben die Lösungen auf dem Gerät der Lehrkraft, bis du sie freigibst.
        Teilnehmende erhalten nur Fragetext und Optionen über eine verschlüsselte Peer-to-Peer-Verbindung – niemals
        die Markierung der richtigen Antwort. Ergebnisse werden dauerhaft gespeichert.
      </p>
      <p className="mt-2 text-center text-xs text-gray-400">
        Lass diese Seite während des Spiels geöffnet – die Sitzung läuft auf dem Gerät der Lehrkraft.{" "}
        {progress.disconnected > 0
          ? `${progress.disconnected} getrennte Teilnehmende können während der Sitzung wieder beitreten.`
          : ""}
      </p>
    </div>
  );
}

/* --------------------------------- shared --------------------------------- */

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className={tone === "success" ? "text-emerald-500" : tone === "warning" ? "text-amber-500" : "text-gold-500"}>
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function StatusChip({ status, connected }: { status: string; connected: boolean }) {
  if (status === "completed") return <Badge tone="success">Abgeschlossen</Badge>;
  if (status === "removed") return <Badge tone="neutral">Entfernt</Badge>;
  if (!connected) return <Badge tone="warning">Getrennt</Badge>;
  if (status === "playing") return <Badge tone="brand">Läuft</Badge>;
  return <Badge tone="neutral">Beigetreten</Badge>;
}

export function LeaderboardTable({ rows }: { rows: import("@/types/quiz").QuizPlayerScore[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">Keine Teilnehmenden erfasst.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-gray-400">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2 text-right">Punkte</th>
            <th className="px-3 py-2 text-right">Richtig</th>
            <th className="px-3 py-2 text-right">Falsch</th>
            <th className="px-3 py-2 text-right">Offen</th>
            <th className="px-3 py-2 text-right">Quote</th>
            <th className="px-3 py-2 text-right">Zeit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId} className="border-t border-gray-100">
              <td className="px-3 py-2 font-semibold text-gray-400">{s.rank}</td>
              <td className="px-3 py-2 font-medium text-ink-900">{s.name}</td>
              <td className="px-3 py-2 text-right font-bold text-gold-600">{s.points}</td>
              <td className="px-3 py-2 text-right text-emerald-600">{s.correct}</td>
              <td className="px-3 py-2 text-right text-brand-600">{s.incorrect}</td>
              <td className="px-3 py-2 text-right text-gray-400">{s.unanswered}</td>
              <td className="px-3 py-2 text-right text-gray-700">{s.accuracy} %</td>
              <td className="px-3 py-2 text-right text-gray-500">{formatTime(s.totalTimeMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "–";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} Sek.`;
  return `${minutes} Min. ${String(seconds).padStart(2, "0")} Sek.`;
}

/** One row in the "Share room" popup — icon + label (+ optional hint). */
function ShareOption({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gold-300 hover:bg-gold-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-gray-500">{hint}</span> : null}
      </span>
    </button>
  );
}

/** WhatsApp glyph (lucide has no brand icons) drawn in the current text color. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
