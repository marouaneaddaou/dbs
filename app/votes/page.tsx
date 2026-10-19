"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, Users, Vote } from "lucide-react";
import { normalizeCode } from "@/lib/voting";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";

/**
 * Public voting page — participants only.
 * Creating and managing vote rooms lives behind the admin area (/admin).
 */
export default function VotesPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    const clean = normalizeCode(code);
    if (!clean) {
      setError("Enter the room code you received.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a username to vote with.");
      return;
    }
    router.push(`/votes/room?code=${clean}&name=${encodeURIComponent(name.trim())}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Polls & decisions"
        title="Join a Vote"
        description="Enter the room code from your host and a username — then cast your ballot."
        icon={<Vote className="h-6 w-6" />}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Join a room"
            subtitle="Use the code shared by your host."
            icon={<KeyRound className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <Field label="Room code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7QM2P"
                className="font-mono tracking-[0.3em]"
                maxLength={12}
                autoFocus
              />
            </Field>
            <Field label="Your username">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
                placeholder="e.g. Alex"
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-sm text-brand-700">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />} onClick={handleJoin}>
              Join & vote
            </Button>
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <Vote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Open a room link from your host if you have one — or enter the code exactly as shared.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How it works"
            subtitle="From joining to results."
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>1. Your host opens the voting room and shares its code or link.</p>
            <p>2. Enter the code with your username to join.</p>
            <p>3. Pick your option(s) and submit — the host’s settings decide if you can vote once or change your vote.</p>
            <p>4. Live results with rankings and tie handling appear when the host allows it.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
