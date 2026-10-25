"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import type { QuizRoom } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useLocalStorage } from "@/lib/hooks";
import { normalizeCode } from "@/lib/voting";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { QuizRoomForm } from "@/components/quiz/QuizRoomForm";

export default function CreateQuizPage() {
  return (
    <AdminGate
      title="Admin-Anmeldung"
      description="Gib das Admin-Passwort ein, um Quizze zu erstellen oder zu bearbeiten."
    >
      <CreateQuizPageContent />
    </AdminGate>
  );
}

function CreateQuizPageContent() {
  const router = useRouter();
  const { value: rooms, setValue: setRooms, hydrated } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );
  const [editCode, setEditCode] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditCode(params.get("edit"));
    setReady(true);
  }, []);

  const initialRoom = editCode
    ? rooms.find((r) => normalizeCode(r.code) === normalizeCode(editCode))
    : undefined;
  const editing = Boolean(editCode);

  if (!hydrated || !ready) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
      </div>
    );
  }

  if (editing && !initialRoom) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          backHref="/admin"
          backLabel="Zurück zum Dashboard"
          eyebrow="Nicht gefunden"
          title="Dieses Quiz existiert nicht"
          description="Das Quiz, das du bearbeiten wolltest, wurde nicht gefunden."
          icon={<Trophy className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="text-sm text-gray-500">
            Vielleicht wurde es gelöscht.{" "}
            <Link href="/quiz/create" className="font-medium text-gold-600 hover:text-gold-700">
              Erstelle stattdessen ein neues Quiz
            </Link>
            .
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref="/admin"
        backLabel="Zurück zum Dashboard"
        eyebrow={editing ? "Quiz bearbeiten" : "Neues Quiz"}
        title={editing ? "Quiz bearbeiten" : "Quiz erstellen"}
        description={
          editing
            ? `Aktualisiere das Quiz und speichere es. Der Code (${initialRoom?.code}) bleibt erhalten.`
            : "Füge Fragen hinzu, markiere die richtigen Antworten, lege Punkte und Zeitlimits fest und wähle den Raumcode für die Teilnehmenden."
        }
        icon={<Trophy className="h-6 w-6" />}
      />
      <QuizRoomForm
        initialRoom={initialRoom}
        reservedCodes={rooms.map((r) => r.code)}
        onSaved={(room) => {
          setRooms((prev) => {
            const index = prev.findIndex((r) => normalizeCode(r.code) === normalizeCode(room.code));
            if (index >= 0) {
              const next = prev.slice();
              next[index] = room;
              return next;
            }
            return [room, ...prev];
          });
          router.push(`/quiz/room?code=${room.code}&host=1`);
        }}
      />
    </div>
  );
}
