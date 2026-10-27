"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, MessageCircle, Plus, Save, UserPlus, Users, Wand2, X } from "lucide-react";
import type { BoxConfig, BoxContent, BoxContentType } from "@/types/boxes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { GiftBox } from "@/components/GiftBox";
import { useToast } from "@/components/ui/Toast";
import { emptyBoxNumbers } from "@/lib/boxes";
import { normalizeNames, parseBoxList, parseNameList } from "@/lib/randomization";
import { uid } from "@/lib/storage";

const SPRECHEN_VOCABULARY = [
  "Der Vorname",
  "Der Nachname",
  "Das Alter",
  "Der Wohnort",
  "Die Herkunft",
  "Der Beruf",
  "Das Studium",
  "Die Sprachen",
  "Die Hobbys",
  "Die Ausstellung",
  "Deutschland",
  "Das Lieblingsessen",
  "Die Freizeit",
  "Das Geburtsdatum",
  "Der Deutschkurs",
  "Das Sprachniveau",
  "Die Telefonnummer",
  "Das Lieblingsgetränk",
  "Die Geschwister",
  "Das Museum",
  "Die Kinder",
  "Die Adresse",
  "Das Frühstück",
  "Das Mittagessen",
  "Der Geburtsort",
  "Die Mannschaft",
  "Das Wetter",
  "Das Restaurant",
  "Die Lebensmittel",
  "Die Sprechstunde",
];

const CONTENT_TYPES: { value: BoxContentType; label: string }[] = [
  { value: "gift", label: "Geschenk" },
  { value: "question", label: "Frage" },
  { value: "challenge", label: "Herausforderung" },
  { value: "task", label: "Aufgabe" },
  { value: "text", label: "Text / Notiz" },
];

const SAMPLE_CONTENTS = [
  "Erzähl uns deine lustigste Geschichte 😄",
  "Mach jetzt 10 Liegestütze!",
  "Du gewinnst einen kleinen Preis 🎁",
  "Sing den Refrain deines Lieblingslieds",
  "Mach der Person links von dir ein Kompliment",
  "Tausche den Platz mit jemandem",
];

const SAMPLE_TYPES: BoxContentType[] = ["question", "challenge", "gift", "task", "text", "challenge"];

export function BoxSetup({
  config,
  onChange,
  onPlay,
}: {
  config: BoxConfig;
  onChange: (next: BoxConfig) => void;
  onPlay: () => void;
}) {
  const toast = useToast();
  const [pasteText, setPasteText] = useState("");
  const [pasteBoxes, setPasteBoxes] = useState("");
  const [newName, setNewName] = useState("");
  /** Entries trimmed by a box-count decrease, so changing the count back restores them. */
  const spareSlots = useRef<Record<number, BoxContent>>({});

  // Keep the stored contents in 1:1 sync with the box count (also fixes
  // older configs whose content pool had a different size).
  useEffect(() => {
    if (config.contents.length !== config.boxCount) {
      patch({ contents: syncContents(config.contents, config.boxCount) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(partial: Partial<BoxConfig>) {
    const now = Date.now();
    const next = { ...config, ...partial, updatedAt: now };
    if (next.saveState === "draft") next.draftUpdatedAt = now;
    onChange(next);
  }

  function saveGame() {
    const now = Date.now();
    onChange({ ...config, saveState: "saved", savedAt: now, updatedAt: now });
    toast.success("Spiel gespeichert. Es bleibt dauerhaft erhalten.");
  }

  /** Exactly `count` entries: trim extras (stashed for undo) and pad missing boxes with empty ones. */
  function syncContents(list: BoxContent[], count: number): BoxContent[] {
    const next = list.slice(0, count);
    for (let i = list.length - 1; i >= count; i -= 1) {
      spareSlots.current[i] = list[i];
    }
    while (next.length < count) {
      const i = next.length;
      const spare = spareSlots.current[i];
      if (spare) {
        next.push(spare);
        delete spareSlots.current[i];
      } else {
        next.push({ id: uid("content"), type: "text", text: "" });
      }
    }
    return next;
  }

  function setBoxCount(value: number) {
    const clamped = Math.max(1, Math.min(200, Math.floor(value) || 1));
    patch({ boxCount: clamped, contents: syncContents(config.contents, clamped) });
  }

  function updateBox(index: number, partial: Partial<BoxContent>) {
    const next = syncContents(config.contents, config.boxCount);
    next[index] = { ...next[index], ...partial };
    patch({ contents: next });
  }

  function fillFromPaste() {
    const values = parseBoxList(pasteBoxes);
    if (values.length === 0) {
      toast.error("Füge mindestens eine Zeile ein – eine Box pro Zeile.");
      return;
    }
    const count = Math.max(config.boxCount, values.length);
    const next = syncContents(config.contents, count);
    values.forEach((text, i) => {
      next[i] = { ...next[i], text };
    });
    patch({ boxCount: count, contents: next });
    setPasteBoxes("");
    const filled = next.filter((c) => c.text.trim()).length;
    toast.success(
      filled === count
        ? `Alle ${count} Boxen wurden aus der Liste gefüllt.`
        : `${filled} von ${count} Boxen wurden aus der Liste gefüllt – die übrigen sind noch leer.`,
    );
  }

  function addNames() {
    const parsed = parseNameList(pasteText);
    if (parsed.length === 0) {
      toast.error("Gib mindestens einen Namen ein oder füge ihn ein.");
      return;
    }
    const merged = normalizeNames([...config.participants, ...parsed]);
    patch({ participants: merged });
    setPasteText("");
    toast.success(`${merged.length - config.participants.length} Teilnehmende hinzugefügt.`);
  }

  function addSingleName() {
    const name = newName.trim();
    if (!name) return;
    if (config.participants.some((p) => p.toLowerCase() === name.toLowerCase())) {
      toast.error("Dieser Name steht bereits auf der Liste.");
      return;
    }
    patch({ participants: [...config.participants, name] });
    setNewName("");
  }

  function renameParticipant(index: number, value: string) {
    const next = config.participants.slice();
    next[index] = value;
    patch({ participants: next });
  }

  function removeParticipant(index: number) {
    patch({ participants: config.participants.filter((_, i) => i !== index) });
  }

  function addSampleContents() {
    const next = syncContents(config.contents, config.boxCount);
    const count = Math.min(SAMPLE_CONTENTS.length, config.boxCount);
    for (let i = 0; i < count; i += 1) {
      next[i] = { ...next[i], type: SAMPLE_TYPES[i] ?? "text", text: SAMPLE_CONTENTS[i] };
    }
    patch({ contents: next });
    toast.success(`${count} Beispielboxen wurden gefüllt.`);
  }

  function applySprechenTemplate() {
    const count = SPRECHEN_VOCABULARY.length;
    const next = syncContents(config.contents, count);
    SPRECHEN_VOCABULARY.forEach((text, i) => {
      next[i] = { ...next[i], type: "text", text };
    });
    patch({ boxCount: count, contents: next });
    toast.success(`Vorlage "Boxes für Sprechen" angewendet. ${count} Boxen wurden gefüllt.`);
  }

  const emptyBoxes = emptyBoxNumbers(config);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Spieleinrichtung"
            subtitle="Benenne das Spiel und lege fest, wie viele Boxen versteckt werden."
            icon={<Gift className="h-5 w-5" />}
          />
          <CardBody className="space-y-5">
            <Field label="Spielname">
              <Input
                value={config.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="z. B. Geburtstagsgewinne"
              />
            </Field>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                Anzahl der Boxen
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setBoxCount(config.boxCount - 1)}
                  aria-label="Boxen verringern"
                >
                  −
                </Button>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={config.boxCount}
                  onChange={(e) => setBoxCount(Number(e.target.value))}
                  className="h-10 w-24 rounded-xl border border-gray-300 bg-white text-center text-lg font-bold text-ink-900 focus:border-brand-500 focus:outline-none"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setBoxCount(config.boxCount + 1)}
                  aria-label="Boxen erhöhen"
                >
                  +
                </Button>
                <span className="text-sm text-gray-400">
                  {emptyBoxes.length > 0
                    ? `Noch ${emptyBoxes.length} leere Box(en) unten.`
                    : "Jede Box hat Inhalt"}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Participants */}
        <Card>
          <CardHeader
            title="Teilnehmende"
            subtitle={`${config.participants.length} Name(n) in der Ziehung.`}
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <div>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Namen durch Zeilen oder Kommas getrennt einfügen&#10;Anna&#10;Ben&#10;Clara"
                className="min-h-[88px]"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addNames}>
                   Eingefügte Namen hinzufügen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPasteText("")} disabled={!pasteText}>
                  Leeren
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSingleName();
                  }
                }}
                placeholder="Einen Namen hinzufügen"
              />
              <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={addSingleName}>
                Hinzufügen
              </Button>
            </div>

            {config.participants.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                Noch keine Teilnehmenden. Füge mindestens einen Namen hinzu, um zu ziehen.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {config.participants.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => renameParticipant(index, e.target.value)}
                      className="h-9"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeParticipant(index)}
                      aria-label={`${name} entfernen`}
                      className="text-gray-400 hover:text-brand-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Contents — one input field per box */}
        <Card>
          <CardHeader
            title="Boxinhalte"
            subtitle={`${config.boxCount} Box(en) – ein Eingabefeld pro Box.`}
            icon={<Wand2 className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Vorlagen</p>
              <button
                type="button"
                onClick={applySprechenTemplate}
                className="group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Boxes für Sprechen</p>
                    <p className="text-xs text-gray-500">30 Boxen mit deutschem Vokabular für Sprechübungen</p>
                  </div>
                </div>
                <Plus className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <Field
              label="Liste einfügen – eine Box pro Zeile"
              hint={'Optionale Präfixe wie "Box 1:" werden entfernt. Die Zeilen füllen Box 1, Box 2, … der Reihe nach.'}
            >
              <Textarea
                value={pasteBoxes}
                onChange={(e) => setPasteBoxes(e.target.value)}
                placeholder={
                  "Box 1: Der Vorname\nBox 2: Die Gitarre\nBox 3: Das Buch\nBox 4: Die Schule\nBox 5: Der Lehrer\nBox 6: Die Tasche"
                }
                className="min-h-[150px]"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={fillFromPaste}>
                Boxen aus Liste füllen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasteBoxes("")} disabled={!pasteBoxes}>
                Leeren
              </Button>
              {emptyBoxes.length === config.boxCount ? (
                <Button size="sm" variant="ghost" onClick={addSampleContents}>
                  Beispiele verwenden
                </Button>
              ) : null}
            </div>

            <ul className="space-y-2">
              {Array.from({ length: config.boxCount }, (_, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 sm:flex-row sm:items-center"
                >
                  <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Box {i + 1}
                  </span>
                  <Select
                    value={config.contents[i]?.type ?? "text"}
                    onChange={(e) => updateBox(i, { type: e.target.value as BoxContentType })}
                    className="sm:w-36"
                    aria-label={`Typ von Box ${i + 1}`}
                  >
                    {CONTENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={config.contents[i]?.text ?? ""}
                    onChange={(e) => updateBox(i, { text: e.target.value })}
                    placeholder={`Inhalt für Box ${i + 1}`}
                    aria-label={`Inhalt von Box ${i + 1}`}
                    className="flex-1"
                  />
                </li>
              ))}
            </ul>

            {emptyBoxes.length > 0 ? (
              <p className="text-xs text-amber-600">
                {emptyBoxes.length} von {config.boxCount} Boxen sind noch leer – jede Box braucht vor dem
                Start einen Inhalt.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* Preview + actions */}
      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader title="Vorschau" subtitle="So sieht das Raster aus." icon={<Gift className="h-5 w-5" />} />
          <CardBody>
            {config.boxCount === 0 ? null : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {Array.from({ length: Math.min(config.boxCount, 20) }).map((_, i) => (
                  <GiftBox key={i} index={i} state="available" disabled />
                ))}
              </div>
            )}
            {config.boxCount > 20 ? (
              <p className="mt-3 text-center text-xs text-gray-400">
                Die ersten 20 von {config.boxCount} Boxen werden angezeigt.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Button
          className="w-full"
          size="lg"
          variant="secondary"
          icon={<Save className="h-5 w-5" />}
          onClick={saveGame}
        >
          Spiel speichern
        </Button>
        <Button
          className="w-full"
          size="lg"
          icon={<Save className="h-5 w-5" />}
          onClick={() => {
            if (emptyBoxes.length > 0) {
              const labels = emptyBoxes.map((n) => `Box ${n}`).join(", ");
              toast.error(
                `${labels} ${emptyBoxes.length === 1 ? "ist" : "sind"} noch leer – jede Box braucht vor dem Start einen Inhalt.`,
              );
              return;
            }
            if (config.participants.length === 0) {
              toast.error("Füge vor dem Spielen mindestens eine teilnehmende Person hinzu.");
              return;
            }
            onPlay();
          }}
        >
          Spiel starten
        </Button>
        <p className="text-center text-xs text-gray-400">
          {config.saveState === "saved"
            ? "Dieses Spiel ist dauerhaft gespeichert."
            : "Dieses Spiel ist ein Entwurf und läuft nach 24 Stunden ohne Änderungen ab. Nutze „Spiel speichern“, um es dauerhaft zu behalten."}
        </p>
      </div>
    </div>
  );
}
