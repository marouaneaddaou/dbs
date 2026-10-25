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
      setError("Bitte gib den erhaltenen Quiz-Code ein.");
      return;
    }
    if (!name.trim()) {
      setError("Bitte gib einen Namen ein, mit dem du mitspielen möchtest.");
      return;
    }
    router.push(`/quiz/room?code=${clean}&name=${encodeURIComponent(name.trim())}`);
  }

  if (missingRoom && linkedCode) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          backHref="/"
          backLabel="Zur Startseite"
          eyebrow="Ungültiger Link"
          title="Dieser Quizraum existiert nicht mehr"
          description={`Der Link verweist auf den Raum ${linkedCode}, aber dieses Quiz wurde gelöscht oder ist nicht mehr verfügbar.`}
          icon={<AlertTriangle className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="space-y-4 text-sm text-gray-500">
            <p>
              Bitte deine Lehrkraft um einen neuen Link oder Raumcode oder gib auf der Beitrittsseite
              einen anderen Code ein.
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
                Anderen Code eingeben
              </Button>
              <Button variant="secondary" onClick={() => setIgnoreMissing(true)}>
                Raum trotzdem öffnen
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
        eyebrow="Zeitgesteuerte Wettbewerbe"
        title="Quiz beitreten"
        description="Gib den Raumcode deiner Lehrkraft und deinen Namen ein – dann antworte auf deinem eigenen Gerät, während die Klasse spielt."
        icon={<Trophy className="h-6 w-6" />}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Quiz beitreten"
            subtitle="Nutze den Raumcode auf dem Bildschirm deiner Lehrkraft."
            icon={<KeyRound className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <Field label="Quiz-Code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="z. B. 12355"
                className="font-mono tracking-[0.3em]"
                maxLength={12}
                autoFocus
              />
            </Field>
            <Field label="Dein Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
                placeholder="z. B. Sam"
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-sm text-brand-700">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />} onClick={handleJoin}>
              Quiz beitreten
            </Button>
            <p className="text-xs text-gray-400">
              Alle treten mit demselben Code von ihrem eigenen Gerät bei. Die richtigen Antworten
              bleiben verborgen, bis alle fertig sind (oder deine Lehrkraft sie freigibt).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="So funktioniert es"
            subtitle="Vom Beitritt bis zum Ergebnis."
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>1. Deine Lehrkraft erstellt das Quiz und öffnet den Raum im Dashboard.</p>
            <p>2. Gib den Raumcode und deinen Namen ein, um von deinem Gerät beizutreten.</p>
            <p>3. Beantworte die Fragen in deinem Tempo – schnellere Antworten bringen Bonuspunkte.</p>
            <p>4. Wenn alle fertig sind, erscheinen Rangliste und Lösungen auf allen Bildschirmen.</p>
          </CardBody>
        </Card>
      </div>

      {linkedCode && ready ? (
        <p className="mt-6 text-center text-xs text-gray-400">
          Der Link hat den Raumcode{" "}
          <span className="font-mono font-bold tracking-[0.2em] text-gold-600">{linkedCode}</span> eingetragen – füge
          nur noch deinen Namen hinzu.{" "}
          <Link href="/quiz" className="font-medium text-gold-600 hover:text-gold-700">
            Nicht dein Raum?
          </Link>
        </p>
      ) : null}
    </div>
  );
}
