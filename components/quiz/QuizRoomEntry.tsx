"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import type { QuizRoom } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useHydrated, useLocalStorage } from "@/lib/hooks";
import { isSharedRoomMissing, normalizeCode } from "@/lib/quiz";
import { QuizHostView } from "@/components/quiz/QuizHostView";
import { QuizStudentView } from "@/components/quiz/QuizStudentView";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * `/quiz/room` dispatcher.
 *
 * - `?host=1` → teacher's host screen (admin-gated inside QuizHostView)
 * - otherwise → student join screen (username + room code, own device)
 *
 * On browsers that store quiz rooms (the admin's), a student link whose room
 * was deleted shows a clear error instead of an endless connecting screen.
 * Participant devices never have that key, so their flow is unchanged.
 */
export function QuizRoomEntry() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const { value: rooms, hydrated: roomsHydrated } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );
  const rawCode = params.get("code") ?? "";
  const code = normalizeCode(rawCode);
  const name = (params.get("name") ?? "").trim().slice(0, 40);
  const host = params.get("host") === "1";

  const roomsKeyPresent =
    hydrated && window.localStorage.getItem(STORAGE_KEYS.quizRooms) !== null;
  const missingRoom =
    code &&
    !host &&
    roomsHydrated &&
    isSharedRoomMissing(code, roomsKeyPresent, rooms);

  if (!code) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title="No room code"
          description="Enter a room code on the join page to open a quiz room."
          action={
            <Link href="/quiz" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700">
              <ArrowLeft className="h-4 w-4" /> Back to join page
            </Link>
          }
        />
      </div>
    );
  }

  if (missingRoom) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7 text-brand-500" />}
          title="This quiz room no longer exists"
          description={`Room ${code} isn't saved in this browser anymore — the quiz may have been deleted. Ask your teacher for a new link or code.`}
          action={
            <Link href="/quiz" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700">
              <ArrowLeft className="h-4 w-4" /> Back to join page
            </Link>
          }
        />
      </div>
    );
  }

  return host ? (
    <QuizHostView code={code} />
  ) : (
    <QuizStudentView code={code} name={name} />
  );
}

export function QuizRoomSuspense() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
        </div>
      }
    >
      <QuizRoomEntry />
    </Suspense>
  );
}
