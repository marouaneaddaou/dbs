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
        title="Host login required"
        description="Sign in with the admin password to open the creator controls for this voting room."
      />
    );
  }

  if (!code || !record || !room) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<XCircle className="h-7 w-7" />}
          title={code ? `No room found for “${code}”` : "Missing room code"}
          description={
            adminAuthed
              ? "This code does not exist in this browser. Rooms are stored per-browser — import a JSON backup to open a room created elsewhere."
              : "This code does not exist in this browser. Check the code or link with your host."
          }
          action={
            <div className="flex flex-col items-center gap-3">
              {adminAuthed ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
                  <Upload className="h-4 w-4" />
                  Import room JSON
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
                        toast.success(`Imported room ${incoming.room.code}.`);
                        router.push(`/votes/room?code=${incoming.room.code}`);
                      } catch {
                        toast.error("That file is not a valid voting room export.");
                      }
                    }}
                  />
                </label>
              ) : null}
              <Link href="/votes" className="text-sm font-medium text-gold-600 hover:text-gold-700">
                Back to votes
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
      toast.error("Voting is closed.");
      return;
    }
    const result = castVote(room!, record!.votes, voter, answers);
    if (!result.ok) {
      toast.error(result.error ?? "Could not submit your vote.");
      return;
    }
    updateVotes(result.votes);
    writeSession("dbs_voter_name", voter.trim());
    toast.success(hasVoted ? "Your vote was updated." : "Your vote was recorded.");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref={adminAuthed ? "/admin" : "/votes"}
        backLabel={adminAuthed ? "Back to dashboard" : "Back to votes"}
        eyebrow={`Room ${room.code}`}
        title={room.title || "Untitled poll"}
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
                toast.success("Room exported as JSON.");
              }}
            >
              Export
            </Button>
          ) : null
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={open ? "success" : expired ? "warning" : "neutral"}>
          {open ? "Voting open" : expired ? "Deadline passed" : "Closed"}
        </Badge>
        <Badge tone="brand">{room.mode === "single" ? "Single choice" : "Multiple choice"}</Badge>
        <Badge tone="neutral">
          <Users className="h-3 w-3" /> {record.votes.length} voter(s)
        </Badge>
        <Badge tone={resultsVisible ? "info" : "warning"} icon={resultsVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}>
          {room.resultsVisibility === "during" ? "Results live" : "Results after closing"}
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
              <CardHeader title="Your ballot" icon={<Vote className="h-5 w-5" />} />
              <CardBody className="space-y-6">
                <Field label="Your username">
                  <Input
                    value={voter}
                    onChange={(e) => setVoter(e.target.value)}
                    placeholder="Enter your name"
                  />
                </Field>

                {room.questions.map((question, index) => (
                  <div key={question.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                    <p className="mb-3 text-sm font-semibold text-ink-900">
                      <span className="mr-2 text-gold-600">Q{index + 1}.</span>
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
                    You already voted and changes are disabled for this poll.
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" icon={<LogIn className="h-4 w-4" />} onClick={submit} disabled={hasVoted && !room.allowChange}>
                    {hasVoted ? "Update my vote" : "Submit vote"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Lock className="h-7 w-7" />}
                  title="Voting is closed"
                  description={
                    resultsVisible
                      ? "Here are the final results below."
                      : "The creator has not enabled results for this poll."
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
              <h2 className="text-base font-semibold text-ink-900">Results</h2>
              <QuestionResults results={results} />
            </div>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<EyeOff className="h-6 w-6" />}
                  title="Results are hidden"
                  description="This poll reveals results only after voting closes."
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
            title="Creator controls"
            subtitle="Available because you are signed in to the admin area."
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
                toast.success("Poll closed.");
              }}
            >
              Close poll
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                updateRoom({ status: "open", closesAt: null });
                toast.success("Poll reopened (unlimited).");
              }}
            >
              Reopen poll
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            icon={<AlertTriangle className="h-4 w-4" />}
            onClick={() => setConfirmReset(true)}
          >
            Reset votes
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
            Export JSON
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
            <Upload className="h-4 w-4" />
            Import results
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
                  toast.success("Results imported.");
                } catch {
                  toast.error("Invalid voting room file.");
                }
              }}
            />
          </label>
        </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        title="Reset all votes?"
        description="This permanently deletes every ballot for this poll. The questions and settings are kept."
        confirmLabel="Reset votes"
        onConfirm={() => {
          updateVotes([]);
          setConfirmReset(false);
          toast.success("All votes cleared.");
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
