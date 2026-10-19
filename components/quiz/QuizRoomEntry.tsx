"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { normalizeCode } from "@/lib/voting";
import { QuizHostView } from "@/components/quiz/QuizHostView";
import { QuizStudentView } from "@/components/quiz/QuizStudentView";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * `/quiz/room` dispatcher.
 *
 * - `?host=1` → teacher's host screen (admin-gated inside QuizHostView)
 * - otherwise → student join screen (username + room code, own device)
 */
export function QuizRoomEntry() {
  const params = useSearchParams();
  const rawCode = params.get("code") ?? "";
  const code = normalizeCode(rawCode);
  const name = (params.get("name") ?? "").trim().slice(0, 40);
  const host = params.get("host") === "1";

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
