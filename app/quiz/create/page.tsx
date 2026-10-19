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
      title="Admin login"
      description="Enter the admin password to create or edit quizzes."
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
          backLabel="Back to dashboard"
          eyebrow="Not found"
          title="That quiz doesn't exist"
          description="The quiz you tried to edit isn't saved in this browser."
          icon={<Trophy className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="text-sm text-gray-500">
            It may have been deleted, or it lives on another device.{" "}
            <Link href="/quiz/create" className="font-medium text-gold-600 hover:text-gold-700">
              Create a new quiz
            </Link>{" "}
            instead.
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        backHref="/admin"
        backLabel="Back to dashboard"
        eyebrow={editing ? "Edit quiz" : "New quiz"}
        title={editing ? "Edit quiz" : "Create a quiz"}
        description={
          editing
            ? `Update the quiz and save. Its code (${initialRoom?.code}) is kept.`
            : "Add questions, mark the correct answers, set points and timers, then choose the room code participants will use to join."
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
