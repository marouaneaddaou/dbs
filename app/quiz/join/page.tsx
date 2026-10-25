"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { normalizeCode } from "@/lib/quiz";

/**
 * `/quiz/join?room=CODE` — the link produced by the admin "Share Room"
 * button. It just forwards to the existing `/quiz` join page with the code
 * filled in (`/quiz/?code=CODE`), so there is a single join form and the
 * room code is always prefilled automatically.
 *
 * Reads `window.location.search` in an effect (instead of `useSearchParams`)
 * to stay compatible with the static export / no-Suspense setup used
 * elsewhere in this app.
 */
export default function QuizJoinPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = normalizeCode(params.get("room") ?? params.get("code") ?? "");
    router.replace(room ? `/quiz/?code=${room}` : "/quiz/");
  }, [router]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-gray-500">Beitrittsseite für das Quiz wird geöffnet…</p>
    </div>
  );
}
