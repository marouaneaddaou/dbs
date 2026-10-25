"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  FileJson,
  Lock,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  Vote,
  XCircle,
} from "lucide-react";
import type { VoteBallot, VotingRoom, VotingRoomRecord } from "@/types/voting";
import { STORAGE_KEYS, readSession, writeSession } from "@/lib/storage";
import { useLocalStorage } from "@/lib/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CountdownTimer } from "@/components/CountdownTimer";
import { QuestionResults } from "@/components/voting/QuestionResults";
import { useToast } from "@/components/ui/Toast";
import { castVote, computeResults, isRoomExpired, isVotingOpen, normalizeCode } from "@/lib/voting";
import { downloadJSON, readJSONFile } from "@/lib/io";
import { useAdminAuth } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { cn } from "@/lib/cn";

export function VotingRoomClient() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const code = normalizeCode(params.get("code") ?? "");
  const wantsHost = params.get("host") === "1";
  const { authed: adminAuthed, hydrated: adminHydrated } = useAdminAuth();
  const { value: records, setValue: setRecords, hydrated } = useLocalStorage<VotingRoomRecord[]>(
    STORAGE_KEYS.votingRooms,
    [],
  );

  const recordIndex = useMemo(
    () => records.findIndex((r) => normalizeCode(r.room.code) === code),
    [records, code],
  );
  const record = recordIndex >= 0 ? records[recordIndex] : null;
  const room = record?.room ?? null;

  const [voter, setVoter] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const fromQuery = params.get("name");
    const remembered = fromQuery || readSession<string>("dbs_voter_name", "");
    if (remembered) setVoter(remembered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close the room when its own deadline passes.
  useEffect(() => {
    if (!room || !record) return;
    if (room.status === "open" && isRoomExpired(room)) {
      setRecords((prev) =>
        prev.map((r) =>
          r.room.code === room.code ? { ...r, room: { ...r.room, status: "closed" } } : r,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.closesAt]);

  if (!hydrated || !adminHydrated) {
    return <LoadingCard />;
  }

  // Opening a room with ?host=1 requires the admin session (creator controls).
  if (wantsHost && !adminAuthed) {
    return (
      <AdminLogin
        title="Host-Anmeldung erforderlich"
        description="Melde dich mit dem Admin-Passwort an, um die Steuerung für diesen Abstimmungsraum zu öffnen."
      />
    );
  }

  if (!code || !record || !room) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<XCircle className="h-7 w-7" />}
          title={code ? `Kein Raum für „${code}“ gefunden` : "Raumcode fehlt"}
          description={
            adminAuthed
              ? "Dieser Code existiert nicht. Prüfe den Code oder lade die Serverdaten neu. Falls du einen JSON-Export hast, kannst du den Raum auch darüber importieren."
              : "Dieser Code existiert nicht. Prüfe den Code oder den Link bei deinem Host."
          }
          action={
            <div className="flex flex-col items-center gap-3">
              {adminAuthed ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
                  <Upload className="h-4 w-4" />
                  Raum-JSON importieren
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const parsed = await readJSONFile(file);
                        const incoming = (parsed as { record?: VotingRoomRecord })?.record;
                        if (!incoming?.room?.code) throw new Error("invalid");
                        setRecords((prev) => [
                          incoming,
                          ...prev.filter((r) => r.room.code !== incoming.room.code),
                        ]);
                        toast.success(`Raum ${incoming.room.code} wurde importiert.`);
                        router.push(`/votes/room?code=${incoming.room.code}`);
                      } catch {
                        toast.error("Diese Datei ist kein gültiger Abstimmungsraum-Export.");
                      }
                    }}
                  />
                </label>
              ) : null}
              <Link href="/votes" className="text-sm font-medium text-gold-600 hover:text-gold-700">
Zurück zu den Abstimmungen
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const open = isVotingOpen(room);
  const expired = isRoomExpired(room);
  const results = computeResults(room, record.votes);
  const resultsVisible = room.resultsVisibility === "during" || !open;
  const hasVoted = record.votes.some((v) => v.voter.toLowerCase() === voter.trim().toLowerCase());

  function updateRoom(patch: Partial<VotingRoom>) {
    setRecords((prev) =>
      prev.map((r) => (r.room.code === room!.code ? { ...r, room: { ...r.room, ...patch } } : r)),
    );
  }

  function updateVotes(votes: VoteBallot[]) {
    setRecords((prev) => prev.map((r) => (r.room.code === room!.code ? { ...r, votes } : r)));
  }

  function toggleOption(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (room!.mode === "single") {
        return { ...prev, [questionId]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== optionId) };
      }
      return { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function submit() {
    if (!open) {
      toast.error("Die Abstimmung ist geschlossen.");
      return;
    }
    const result = castVote(room!, record!.votes, voter, answers);
    if (!result.ok) {
      toast.error(result.error ?? "Deine Stimme konnte nicht abgegeben werden.");
      return;
    }
    updateVotes(result.votes);
    writeSession("dbs_voter_name", voter.trim());
    toast.success(hasVoted ? "Deine Stimme wurde aktualisiert." : "Deine Stimme wurde erfasst.");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref={adminAuthed ? "/admin" : "/votes"}
        backLabel={adminAuthed ? "Zurück zum Dashboard" : "Zurück zu den Abstimmungen"}
        eyebrow={`Raum ${room.code}`}
        title={room.title || "Unbenannte Umfrage"}
        description={room.description || undefined}
        icon={<Vote className="h-6 w-6" />}
        action={
          adminAuthed ? (
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                downloadJSON(`voting-room-${room.code}.json`, {
                  type: "voting-room",
                  exportedAt: Date.now(),
                  record: { room, votes: record!.votes },
                });
                toast.success("Raum wurde als JSON exportiert.");
              }}
            >
              Exportieren
            </Button>
          ) : null
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={open ? "success" : expired ? "warning" : "neutral"}>
          {open ? "Abstimmung offen" : expired ? "Frist abgelaufen" : "Geschlossen"}
        </Badge>
        <Badge tone="brand">{room.mode === "single" ? "Einzelwahl" : "Mehrfachwahl"}</Badge>
        <Badge tone="neutral">
          <Users className="h-3 w-3" /> {record.votes.length} Stimmen
        </Badge>
        <Badge tone={resultsVisible ? "info" : "warning"} icon={resultsVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}>
          {room.resultsVisibility === "during" ? "Ergebnisse live" : "Ergebnisse nach dem Schließen"}
        </Badge>
      </div>

      {room.closesAt !== null ? (
        <Card className="mb-6">
          <CardBody>
            <CountdownTimer
              deadline={room.closesAt}
              totalMs={room.durationMinutes ? room.durationMinutes * 60_000 : undefined}
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Ballot */}
        <div className="space-y-6">
          {open ? (
            <Card>
              <CardHeader title="Dein Stimmzettel" icon={<Vote className="h-5 w-5" />} />
              <CardBody className="space-y-6">
                <Field label="Dein Name">
                  <Input
                    value={voter}
                    onChange={(e) => setVoter(e.target.value)}
                    placeholder="Gib deinen Namen ein"
                  />
                </Field>

                {room.questions.map((question, index) => (
                  <div key={question.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                    <p className="mb-3 text-sm font-semibold text-ink-900">
                      <span className="mr-2 text-gold-600">F{index + 1}.</span>
                      {question.text}
                    </p>
                    <div className="space-y-2">
                      {question.options.map((option) => {
                        const selected = (answers[question.id] ?? []).includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleOption(question.id, option.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                              selected
                                ? "border-gold-400 bg-gold-50 text-ink-900"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center border",
                                room.mode === "single" ? "rounded-full" : "rounded",
                                selected ? "border-gold-500" : "border-gray-300",
                              )}
                            >
                              {selected ? <span className="h-2.5 w-2.5 rounded-full bg-gold-500" /> : null}
                            </span>
                            {option.text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {hasVoted && !room.allowChange ? (
                  <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <Lock className="h-4 w-4" />
                    Du hast bereits abgestimmt und Änderungen sind für diese Umfrage deaktiviert.
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" icon={<LogIn className="h-4 w-4" />} onClick={submit} disabled={hasVoted && !room.allowChange}>
                    {hasVoted ? "Stimme aktualisieren" : "Stimme abgeben"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Lock className="h-7 w-7" />}
                  title="Die Abstimmung ist geschlossen"
                  description={
                    resultsVisible
                      ? "Die finalen Ergebnisse findest du unten."
                      : "Die Ergebnisse dieser Umfrage wurden noch nicht freigegeben."
                  }
                />
              </CardBody>
            </Card>
          )}
        </div>

        {/* Sidebar: results preview + creator controls */}
        <div className="space-y-6">
          {resultsVisible ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-ink-900">Ergebnisse</h2>
              <QuestionResults results={results} />
            </div>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<EyeOff className="h-6 w-6" />}
                  title="Ergebnisse sind verborgen"
                  description="Diese Umfrage zeigt die Ergebnisse erst nach dem Schließen der Abstimmung."
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Creator controls — admin session required */}
      {adminAuthed ? (
        <Card className="mt-8">
          <CardHeader
            title="Steuerung für Ersteller"
            subtitle="Verfügbar, weil du im Admin-Bereich angemeldet bist."
            icon={<ShieldCheck className="h-5 w-5" />}
          />
          <CardBody className="flex flex-wrap gap-2">
          {room.status === "open" ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Lock className="h-4 w-4" />}
              onClick={() => {
                updateRoom({ status: "closed" });
                toast.success("Umfrage geschlossen.");
              }}
            >
              Umfrage schließen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                updateRoom({ status: "open", closesAt: null });
                toast.success("Umfrage wieder geöffnet (unbegrenzt).");
              }}
            >
              Umfrage wieder öffnen
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            icon={<AlertTriangle className="h-4 w-4" />}
            onClick={() => setConfirmReset(true)}
          >
            Stimmen zurücksetzen
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<FileJson className="h-4 w-4" />}
            onClick={() =>
              downloadJSON(`voting-room-${room.code}.json`, {
                type: "voting-room",
                exportedAt: Date.now(),
                record: { room, votes: record!.votes },
              })
            }
          >
            JSON exportieren
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
            <Upload className="h-4 w-4" />
            Ergebnisse importieren
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = await readJSONFile(file);
                  const incoming = (parsed as { record?: VotingRoomRecord })?.record;
                  if (!incoming?.room?.code || !Array.isArray(incoming.votes)) throw new Error("invalid");
                  setRecords((prev) => [
                    incoming,
                    ...prev.filter((r) => r.room.code !== incoming.room.code),
                  ]);
                  toast.success("Ergebnisse importiert.");
                } catch {
                  toast.error("Ungültige Abstimmungsraum-Datei.");
                }
              }}
            />
          </label>
        </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        title="Alle Stimmen zurücksetzen?"
        description="Alle abgegebenen Stimmen dieser Umfrage werden dauerhaft gelöscht. Fragen und Einstellungen bleiben erhalten."
        confirmLabel="Stimmen zurücksetzen"
        onConfirm={() => {
          updateVotes([]);
          setConfirmReset(false);
          toast.success("Alle Stimmen wurden gelöscht.");
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
    </div>
  );
}
