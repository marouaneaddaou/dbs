"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Vote } from "lucide-react";
import type { VotingRoomRecord } from "@/types/voting";
import { STORAGE_KEYS } from "@/lib/storage";
import { useLocalStorage } from "@/lib/hooks";
import { normalizeCode } from "@/lib/voting";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { VotingRoomForm } from "@/components/voting/VotingRoomForm";

export default function CreateVotingRoomPage() {
  return (
    <AdminGate
      title="Admin-Anmeldung"
      description="Gib das Admin-Passwort ein, um Abstimmungsräume zu erstellen oder zu bearbeiten."
    >
      <CreateVotingRoomPageContent />
    </AdminGate>
  );
}

function CreateVotingRoomPageContent() {
  const router = useRouter();
  const {
    value: records,
    setValue: setRecords,
    hydrated,
  } = useLocalStorage<VotingRoomRecord[]>(STORAGE_KEYS.votingRooms, []);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditCode(params.get("edit"));
    setReady(true);
  }, []);

  const initialRecord = editCode
    ? records.find((r) => normalizeCode(r.room.code) === normalizeCode(editCode))
    : undefined;
  const editing = Boolean(editCode);

  if (!hydrated || !ready) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
      </div>
    );
  }

  if (editing && !initialRecord) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          backHref="/admin"
          backLabel="Zurück zum Dashboard"
          eyebrow="Nicht gefunden"
          title="Dieser Abstimmungsraum existiert nicht"
          description="Der Raum, den du bearbeiten wolltest, wurde nicht gefunden."
          icon={<Vote className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="text-sm text-gray-500">
            Vielleicht wurde er gelöscht.{" "}
            <Link href="/votes/create" className="font-medium text-gold-600 hover:text-gold-700">
              Erstelle stattdessen einen neuen Raum
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
        eyebrow={editing ? "Umfrage bearbeiten" : "Neue Umfrage"}
        title={editing ? "Abstimmungsraum bearbeiten" : "Abstimmungsraum erstellen"}
        description={
          editing
            ? `Aktualisiere den Raum und speichere ihn. Der Code (${initialRecord?.room.code}) und die Stimmen bleiben erhalten.`
            : "Lege Fragen und Optionen fest, wähle die Regeln und bestimme den Raumcode, den du mit den Teilnehmenden teilst."
        }
        icon={<Vote className="h-6 w-6" />}
      />
      <VotingRoomForm
        initialRoom={initialRecord?.room}
        reservedCodes={records.map((r) => r.room.code)}
        onSaved={(room) => {
          setRecords((prev) => {
            const index = prev.findIndex(
              (r) => normalizeCode(r.room.code) === normalizeCode(room.code),
            );
            if (index >= 0) {
              const next = prev.slice();
              next[index] = { ...next[index], room };
              return next;
            }
            return [{ room, votes: [] }, ...prev];
          });
          router.push(`/votes/room?code=${room.code}&host=1`);
        }}
      />
    </div>
  );
}
