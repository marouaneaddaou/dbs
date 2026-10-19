import { Suspense } from "react";
import { VotingRoomClient } from "@/components/voting/VotingRoomClient";

export default function VotingRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
        </div>
      }
    >
      <VotingRoomClient />
    </Suspense>
  );
}
