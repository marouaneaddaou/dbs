"use client";

import { useState } from "react";
import {
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  ListChecks,
  MinusCircle,
  Plus,
  Save,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import type { VoteMode, VotingQuestion, VotingRoom, ResultsVisibility } from "@/types/voting";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { uid } from "@/lib/storage";
import { normalizeCode } from "@/lib/voting";
import { cn } from "@/lib/cn";

interface DraftOption {
  id: string;
  text: string;
}
interface DraftQuestion {
  id: string;
  text: string;
  options: DraftOption[];
}

function newQuestion(): DraftQuestion {
  return {
    id: uid("q"),
    text: "",
    options: [
      { id: uid("opt"), text: "" },
      { id: uid("opt"), text: "" },
    ],
  };
}

export function VotingRoomForm({
  initialRoom,
  reservedCodes = [],
  onSaved,
}: {
  initialRoom?: VotingRoom;
  reservedCodes?: string[];
  onSaved: (room: VotingRoom) => void;
}) {
  const toast = useToast();
  const editing = Boolean(initialRoom);
  const [codeInput, setCodeInput] = useState("");
  const [title, setTitle] = useState(initialRoom?.title ?? "");
  const [description, setDescription] = useState(initialRoom?.description ?? "");
  const [mode, setMode] = useState<VoteMode>(initialRoom?.mode ?? "single");
  const [allowChange, setAllowChange] = useState(initialRoom?.allowChange ?? true);
  const [resultsVisibility, setResultsVisibility] = useState<ResultsVisibility>(
    initialRoom?.resultsVisibility ?? "after",
  );
  const [unlimited, setUnlimited] = useState(initialRoom ? initialRoom.durationMinutes === null : true);
  const [durationMinutes, setDurationMinutes] = useState(initialRoom?.durationMinutes ?? 30);
  const [publishNow, setPublishNow] = useState(initialRoom ? initialRoom.status === "open" : true);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initialRoom && initialRoom.questions.length > 0
      ? initialRoom.questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
        }))
      : [newQuestion()],
  );
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, newQuestion()]);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function addOption(questionId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId && q.options.length < 10
          ? { ...q, options: [...q.options, { id: uid("opt"), text: "" }] }
          : q,
      ),
    );
  }

  function updateOption(questionId: string, optionId: string, text: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)) }
          : q,
      ),
    );
  }

  function removeOption(questionId: string, optionId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId && q.options.length > 2
          ? { ...q, options: q.options.filter((o) => o.id !== optionId) }
          : q,
      ),
    );
  }

  function handleSubmit() {
    setError(null);
    if (!title.trim()) {
      setError("Bitte gib einen Titel für den Raum ein.");
      return;
    }
    if (questions.length === 0) {
      setError("Füge mindestens eine Frage hinzu.");
      return;
    }
    const cleaned: VotingQuestion[] = [];
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.text.trim()) {
        setError(`Frage ${i + 1}: Bitte gib den Fragetext ein.`);
        return;
      }
      const options = q.options
        .map((o) => ({ id: o.id, text: o.text.trim() }))
        .filter((o) => o.text.length > 0);
      if (options.length < 2) {
        setError(`Frage ${i + 1}: Gib mindestens zwei Optionen an.`);
        return;
      }
      cleaned.push({ id: q.id, text: q.text.trim(), options });
    }
    if (!unlimited && (!durationMinutes || durationMinutes <= 0)) {
      setError("Gib eine gültige Dauer in Minuten ein oder wähle unbegrenzt.");
      return;
    }

    const now = Date.now();
    const taken = new Set(reservedCodes.map((c) => normalizeCode(c)));
    if (initialRoom) taken.delete(normalizeCode(initialRoom.code));

    // The admin chooses the room code manually — it is never generated.
    let code: string;
    if (initialRoom) {
      code = initialRoom.code;
    } else {
      const chosen = normalizeCode(codeInput);
      if (!chosen) {
        setError("Wähle einen Raumcode, bevor du den Raum erstellst.");
        return;
      }
      if (taken.has(chosen)) {
        setError(`Der Code ${chosen} wird bereits von einem anderen Abstimmungsraum verwendet. Wähle einen anderen Code.`);
        return;
      }
      code = chosen;
    }

    const openedAt = initialRoom?.openedAt ?? now;
    const room: VotingRoom = {
      code,
      title: title.trim(),
      description: description.trim(),
      questions: cleaned,
      mode,
      allowChange,
      resultsVisibility,
      durationMinutes: unlimited ? null : Math.floor(durationMinutes),
      openedAt,
      closesAt: unlimited ? null : openedAt + Math.floor(durationMinutes) * 60_000,
      status: publishNow ? "open" : "draft",
      createdAt: initialRoom?.createdAt ?? now,
      saveState: "saved",
      savedAt: now,
    };
    onSaved(room);
    toast.success(
      editing ? `Raum ${room.code} wurde aktualisiert.` : `Raum ${room.code} wurde erstellt und dauerhaft gespeichert.`,
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Raumdetails" icon={<HelpCircle className="h-5 w-5" />} />
          <CardBody className="space-y-5">
            <Field
              label="Raumcode wählen"
              hint={
                editing
                  ? "Der Raumcode bleibt unverändert, bis der Raum geschlossen oder gelöscht wird."
                  : "Teilnehmende treten mit genau diesem Code und ihrem Namen bei."
              }
            >
              <Input
                value={editing ? initialRoom?.code ?? "" : codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                disabled={editing}
                placeholder={editing ? "" : "z. B. 12355"}
                className="font-mono tracking-[0.3em] disabled:opacity-60"
                maxLength={12}
              />
            </Field>
            <Field label="Titel">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Umfrage zum Teamessen" />
            </Field>
            <Field label="Beschreibung" hint="Optionaler Kontext für die Teilnehmenden.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Erkläre kurz, worüber abgestimmt wird."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Abstimmungsmodus">
                <Select value={mode} onChange={(e) => setMode(e.target.value as VoteMode)}>
                  <option value="single">Einzelwahl (eine Option pro Frage)</option>
                  <option value="multiple">Mehrfachwahl (mehrere Optionen)</option>
                </Select>
              </Field>
              <Field label="Sichtbarkeit der Ergebnisse">
                <Select
                  value={resultsVisibility}
                  onChange={(e) => setResultsVisibility(e.target.value as ResultsVisibility)}
                >
                  <option value="during">Ergebnisse während der Abstimmung zeigen</option>
                  <option value="after">Erst nach dem Schließen zeigen</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Switch
                checked={allowChange}
                onChange={setAllowChange}
                label="Stimmenänderung erlauben"
                description="Teilnehmende können erneut abstimmen und ihre Stimme ersetzen."
              />
              <Switch
                checked={unlimited}
                onChange={setUnlimited}
                label="Unbegrenzte Dauer"
                description="Deaktiviere dies, um einen Countdown festzulegen."
              />
            </div>

            <Switch
              checked={publishNow}
              onChange={setPublishNow}
              label="Für Abstimmung öffnen"
              description={
                publishNow
                  ? "Der Raum ist live und nimmt sofort Stimmen an."
                  : "Wird als Entwurf gespeichert – Stimmen sind erst nach dem Öffnen möglich."
              }
            />

            {!unlimited ? (
              <Field label="Dauer (Minuten)" hint="Die Frist wird anhand der App-Uhrzeit geprüft.">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <Input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-sm text-gray-400">Minuten</span>
                </div>
              </Field>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Fragen & Optionen"
            subtitle={`${questions.length} Frage(n)`}
            icon={<ListChecks className="h-5 w-5" />}
            action={
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addQuestion}>
                Frage hinzufügen
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {questions.map((question, qIndex) => (
              <div key={question.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-50 text-xs font-bold text-gold-600 ring-1 ring-gold-200">
                    {qIndex + 1}
                  </span>
                  <Input
                    value={question.text}
                    onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
                    placeholder="Was möchtest du fragen?"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQuestion(question.id)}
                    disabled={questions.length === 1}
                    aria-label="Frage entfernen"
                    className="text-gray-400 hover:text-brand-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 pl-9">
                  {question.options.map((option, oIndex) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center border border-gray-300",
                          mode === "single" ? "rounded-full" : "rounded",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full bg-gray-300" />
                      </span>
                      <Input
                        value={option.text}
                        onChange={(e) => updateOption(question.id, option.id, e.target.value)}
                        placeholder={`Option ${oIndex + 1}`}
                        className="h-9"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(question.id, option.id)}
                        disabled={question.options.length <= 2}
                        aria-label="Option entfernen"
                        className="text-gray-400 hover:text-brand-600"
                      >
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => addOption(question.id)}
                    disabled={question.options.length >= 10}
                  >
                    Option hinzufügen
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader title="Zusammenfassung" icon={<ToggleLeft className="h-5 w-5" />} />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <SummaryRow label="Raumcode" value={editing ? initialRoom?.code ?? "" : codeInput || "—"} />
            <SummaryRow label="Modus" value={mode === "single" ? "Einzelwahl" : "Mehrfachwahl"} />
            <SummaryRow label="Fragen" value={String(questions.length)} />
            <SummaryRow label="Stimmenänderung" value={allowChange ? "Erlaubt" : "Gesperrt"} />
            <SummaryRow
              label="Ergebnisse"
              value={resultsVisibility === "during" ? "Während der Abstimmung" : "Nach dem Schließen"}
            />
            <SummaryRow label="Frist" value={unlimited ? "Unbegrenzt" : `${durationMinutes} Min.`} />
            <SummaryRow label="Status" value={publishNow ? "Offen" : "Entwurf"} />
            <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
              {resultsVisibility === "during" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {editing ? `Code ${initialRoom?.code} bleibt erhalten.` : "Codes werden nie automatisch erzeugt – der Raum entsteht nur mit deinem gewählten Code."}
            </div>
          </CardBody>
        </Card>

        {error ? (
          <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
            {error}
          </p>
        ) : null}

        <Button className="w-full" size="lg" icon={<Save className="h-5 w-5" />} onClick={handleSubmit}>
          {editing ? "Änderungen speichern" : "Raum erstellen"}
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-ink-900">{value}</span>
    </div>
  );
}
