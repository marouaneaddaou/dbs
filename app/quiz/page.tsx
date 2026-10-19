"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, LogIn, Trophy, Users } from "lucide-react";
import type { QuizRoom } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useHydrated, useLocalStorage } from "@/lib/hooks";
import { isSharedRoomMissing, normalizeCode } from "@/lib/quiz";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";

/**
 * Public quiz page — participants only.
 * Creating and hosting quizzes lives behind the admin area (/admin).
 *
 * Shared links land here as `/quiz/?code=XXXX`: the code is filled in
 * automatically, but the participant still picks a username themselves —
 * there are no accounts. If this browser manages quizzes and the linked
 * room was deleted, a clear error replaces the form.
 */
export default function QuizPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { value: rooms, hydrated: roomsHydrated } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkedCode, setLinkedCode] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [ignoreMissing, setIgnoreMissing] = useState(false);

  // Read the room code from the shared link once, after mount.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("code") ?? "";
    const clean = normalizeCode(raw);
    if (clean) {
      setLinkedCode(clean);
      setCode(clean);
    }
    setReady(true);
  }, []);

  // Only browsers that store quiz rooms (the admin's) can recognise a
  // deleted room — participant devices never have that key, so their links
  // always open the normal join form.
  const roomsKeyPresent =
    hydrated && window.localStorage.getItem(STORAGE_KEYS.quizRooms) !== null;
  const missingRoom =
    ready &&
    hydrated &&
    roomsHydrated &&
    !ignoreMissing &&
    isSharedRoomMissing(linkedCode ?? "", roomsKeyPresent, rooms);

  function handleJoin() {
    setError(null);
    const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!clean) {
      setError("Enter the quiz code you received.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a username to play with.");
      return;
    }
    router.push(`/quiz/room?code=${clean}&name=${encodeURIComponent(name.trim())}`);
  }

  if (missingRoom && linkedCode) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          backHref="/"
          backLabel="Back to home"
          eyebrow="Invalid link"
          title="This quiz room no longer exists"
          description={`The link points to room ${linkedCode}, but that quiz isn't saved in this browser anymore — it may have been deleted.`}
          icon={<AlertTriangle className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="space-y-4 text-sm text-gray-500">
            <p>
              Ask your teacher for a fresh link or a new room code, or go back to the join page and enter a
              different code by hand.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setIgnoreMissing(true);
                  setLinkedCode(null);
                  setCode("");
                  router.replace("/quiz");
                }}
              >
                Enter a different code
              </Button>
              <Button variant="secondary" onClick={() => setIgnoreMissing(true)}>
                Open the room anyway
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Timed competitions"
        title="Join a Quiz"
        description="Enter the room code from your teacher and a username — then answer on your own device while the class plays."
        icon={<Trophy className="h-6 w-6" />}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Join a quiz"
            subtitle="Use the room code shown on your teacher's screen."
            icon={<KeyRound className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <Field label="Quiz code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 12355"
                className="font-mono tracking-[0.3em]"
                maxLength={12}
                autoFocus
              />
            </Field>
            <Field label="Your username">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
                placeholder="e.g. Sam"
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-sm text-brand-700">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />} onClick={handleJoin}>
              Join quiz
            </Button>
            <p className="text-xs text-gray-400">
              Everyone joins from their own device with the same code. Correct answers stay hidden
              until all classmates finish (or your teacher reveals them).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How it works"
            subtitle="From joining to results."
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>1. Your teacher creates the quiz and opens the room from the dashboard.</p>
            <p>2. Enter the room code with your username to join from your own device.</p>
            <p>3. Answer each question at your own pace — faster answers earn speed bonuses.</p>
            <p>4. When everyone finishes, the leaderboard and answer key reveal on every screen.</p>
          </CardBody>
        </Card>
      </div>

      {linkedCode && ready ? (
        <p className="mt-6 text-center text-xs text-gray-400">
          Link filled in room code{" "}
          <span className="font-mono font-bold tracking-[0.2em] text-gold-600">{linkedCode}</span> — just add
          your username to join.{" "}
          <Link href="/quiz" className="font-medium text-gold-600 hover:text-gold-700">
            Not your room?
          </Link>
        </p>
      ) : null}
    </div>
  );
}
