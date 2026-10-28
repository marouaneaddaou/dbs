"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import type { QuizRoom } from "@/types/quiz";
import { STORAGE_KEYS } from "@/lib/storage";
import { useHydrated, useLocalStorage } from "@/lib/hooks";
import { isSharedRoomMissing, normalizeCode } from "@/lib/quiz";
import { useAdminAuth } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { QuizHostView } from "@/components/quiz/QuizHostView";
import { QuizStudentView } from "@/components/quiz/QuizStudentView";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * `/quiz/room` dispatcher.
 *
 * - `?host=1` â†’ the host screen for admins (this device has a session);
 *   everyone else opening the shared link — students on their own devices —
 *   gets the room's normal join screen (username form) so they can enter
 *   their name and join. Teachers can still sign in from that screen.
 * - otherwise â†’ student join screen (username + room code, own device)
 *
 * On browsers that store quiz rooms (the admin's), a student link whose room
 * was deleted shows a clear error instead of an endless connecting screen.
 * Participant devices never have that key, so their flow is unchanged.
 */
export function QuizRoomEntry() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const { authed, hydrated: authHydrated } = useAdminAuth();
  const [teacherLogin, setTeacherLogin] = useState(false);
  const { value: rooms, hydrated: roomsHydrated } = useLocalStorage<QuizRoom[]>(
    STORAGE_KEYS.quizRooms,
    [],
  );
  const rawCode = params.get("code") ?? "";
  const code = normalizeCode(rawCode);
  const name = (params.get("name") ?? "").trim().slice(0, 40);
  const host = params.get("host") === "1";
  // Host controls are only for a signed-in admin. Any other visitor of a
  // shared ?host=1 link (a student) gets the student join screen instead of
  // a password prompt — that is the point of the shareable room link.
  const asHost = host && authHydrated && authed;

  const roomsKeyPresent =
    hydrated && window.localStorage.getItem(STORAGE_KEYS.quizRooms) !== null;
  const missingRoom =
    code &&
    !asHost &&
    roomsHydrated &&
    isSharedRoomMissing(code, roomsKeyPresent, rooms);

  if (!code) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title="Kein Raumcode"
          description="Gib auf der Beitrittsseite einen Raumcode ein, um einen Quizraum zu öffnen."
          action={
            <Link href="/quiz" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700">
              <ArrowLeft className="h-4 w-4" /> Zurück zur Beitrittsseite
            </Link>
          }
        />
      </div>
    );
  }

  // Avoid flashing the student view for a moment before the admin session
  // hydrates — host links settle on the host screen for admins.
  if (host && !authHydrated) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
      </div>
    );
  }

  if (missingRoom) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7 text-brand-500" />}
          title="Dieser Quizraum existiert nicht mehr"
          description={`Raum ${code} ist nicht mehr verfügbar – das Quiz wurde möglicherweise gelöscht. Bitte deine Lehrkraft um einen neuen Link oder Code.`}
          action={
            <Link href="/quiz" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700">
              <ArrowLeft className="h-4 w-4" /> Zurück zur Beitrittsseite
            </Link>
          }
        />
      </div>
    );
  }

  // A teacher opening the shared link on a device without an active session
  // can still sign in for the host controls (same flow as before).
  if (host && !authed && teacherLogin) {
    return (
      <AdminLogin
        title="Host-Anmeldung erforderlich"
        description="Melde dich mit dem Admin-Passwort an, um die Host-Steuerung für dieses Quiz zu öffnen."
      />
    );
  }

  if (asHost) return <QuizHostView code={code} />;

  return (
    <div>
      <QuizStudentView code={code} name={name} />
      {host && !authed ? (
        <p className="pb-10 text-center text-xs text-gray-400">
          Lehrkraft?{" "}
          <button
            type="button"
            onClick={() => setTeacherLogin(true)}
            className="font-medium text-gold-600 underline underline-offset-2 transition-colors hover:text-gold-700"
          >
            Zur Host-Steuerung anmelden
          </button>
        </p>
      ) : null}
    </div>
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
