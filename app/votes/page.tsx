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
      setError("Bitte gib den erhaltenen Raumcode ein.");
      return;
    }
    if (!name.trim()) {
      setError("Bitte gib einen Namen ein, mit dem du abstimmen möchtest.");
      return;
    }
    router.push(`/votes/room?code=${clean}&name=${encodeURIComponent(name.trim())}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Umfragen & Entscheidungen"
        title="Abstimmung beitreten"
        description="Gib den Raumcode deines Hosts und deinen Namen ein – dann gib deine Stimme ab."
        icon={<Vote className="h-6 w-6" />}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Raum beitreten"
            subtitle="Nutze den Code, den dein Host geteilt hat."
            icon={<KeyRound className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <Field label="Raumcode">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="z. B. K7QM2P"
                className="font-mono tracking-[0.3em]"
                maxLength={12}
                autoFocus
              />
            </Field>
            <Field label="Dein Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoin();
                }}
                placeholder="z. B. Alex"
              />
            </Field>
            {error ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-sm text-brand-700">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />} onClick={handleJoin}>
              Beitreten & abstimmen
            </Button>
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <Vote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Öffne den Raumlink deines Hosts, falls du einen hast – oder gib den Code genau wie geteilt ein.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="So funktioniert es"
            subtitle="Vom Beitritt bis zum Ergebnis."
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>1. Dein Host öffnet den Abstimmungsraum und teilt Code oder Link.</p>
            <p>2. Gib den Code und deinen Namen ein, um beizutreten.</p>
            <p>3. Wähle deine Option(en) und sende ab – die Einstellungen des Hosts bestimmen, ob du einmal abstimmen oder deine Stimme ändern kannst.</p>
            <p>4. Live-Ergebnisse mit Rangfolge und Gleichstand erscheinen, sobald der Host sie freigibt.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
