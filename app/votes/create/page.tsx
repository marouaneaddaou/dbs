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
      title="Admin login"
      description="Enter the admin password to create or edit voting rooms."
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
          backLabel="Back to dashboard"
          eyebrow="Not found"
          title="That voting room doesn't exist"
          description="The room you tried to edit isn't saved in this browser."
          icon={<Vote className="h-6 w-6" />}
        />
        <Card>
          <CardBody className="text-sm text-gray-500">
            It may have been deleted, or it lives on another device.{" "}
            <Link href="/votes/create" className="font-medium text-gold-600 hover:text-gold-700">
              Create a new room
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
        eyebrow={editing ? "Edit poll" : "New poll"}
        title={editing ? "Edit voting room" : "Create a voting room"}
        description={
          editing
            ? `Update the room and save. Its code (${initialRecord?.room.code}) and votes are kept.`
            : "Define your questions and options, choose the rules, then pick the room code to share with participants."
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
