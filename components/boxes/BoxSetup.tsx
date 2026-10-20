"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, Plus, Save, UserPlus, Users, Wand2, X } from "lucide-react";
import type { BoxConfig, BoxContent, BoxContentType } from "@/types/boxes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { GiftBox } from "@/components/GiftBox";
import { useToast } from "@/components/ui/Toast";
import { emptyBoxNumbers } from "@/lib/boxes";
import { normalizeNames, parseBoxList, parseNameList } from "@/lib/randomization";
import { uid } from "@/lib/storage";

const CONTENT_TYPES: { value: BoxContentType; label: string }[] = [
  { value: "gift", label: "Gift" },
  { value: "question", label: "Question" },
  { value: "challenge", label: "Challenge" },
  { value: "task", label: "Task" },
  { value: "text", label: "Text / Note" },
];

const SAMPLE_CONTENTS = [
  "Tell us your funniest story 😄",
  "Do 10 push-ups right now!",
  "You win a small prize 🎁",
  "Sing the chorus of your favourite song",
  "Compliment the person on your left",
  "Swap seats with someone",
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
    onChange({ ...config, ...partial, updatedAt: Date.now() });
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
      toast.error("Paste at least one line — one box per line.");
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
        ? `Filled all ${count} boxes from the list.`
        : `Filled ${filled} of ${count} boxes from the list — the rest are still empty.`,
    );
  }

  function addNames() {
    const parsed = parseNameList(pasteText);
    if (parsed.length === 0) {
      toast.error("Type or paste at least one name.");
      return;
    }
    const merged = normalizeNames([...config.participants, ...parsed]);
    patch({ participants: merged });
    setPasteText("");
    toast.success(`Added ${merged.length - config.participants.length} participant(s).`);
  }

  function addSingleName() {
    const name = newName.trim();
    if (!name) return;
    if (config.participants.some((p) => p.toLowerCase() === name.toLowerCase())) {
      toast.error("That name is already in the list.");
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
    toast.success(`Filled ${count} example box${count === 1 ? "" : "es"}.`);
  }

  const emptyBoxes = emptyBoxNumbers(config);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Game setup"
            subtitle="Name the game and choose how many boxes to hide."
            icon={<Gift className="h-5 w-5" />}
          />
          <CardBody className="space-y-5">
            <Field label="Game name">
              <Input
                value={config.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Birthday prizes"
              />
            </Field>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                Number of boxes
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setBoxCount(config.boxCount - 1)}
                  aria-label="Decrease boxes"
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
                  aria-label="Increase boxes"
                >
                  +
                </Button>
                <span className="text-sm text-gray-400">
                  {emptyBoxes.length > 0
                    ? `${emptyBoxes.length} box(es) still empty below.`
                    : "every box has content"}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Participants */}
        <Card>
          <CardHeader
            title="Participants"
            subtitle={`${config.participants.length} name(s) in the draw.`}
            icon={<Users className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <div>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste names separated by new lines or commas&#10;Alice&#10;Bob&#10;Charlie"
                className="min-h-[88px]"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addNames}>
                  Add pasted names
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPasteText("")} disabled={!pasteText}>
                  Clear
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
                placeholder="Add one name"
              />
              <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={addSingleName}>
                Add
              </Button>
            </div>

            {config.participants.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                No participants yet. Add at least one name to start drawing.
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
                      aria-label={`Remove ${name}`}
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
            title="Box contents"
            subtitle={`${config.boxCount} box${config.boxCount === 1 ? "" : "es"} — one input field per box.`}
            icon={<Wand2 className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <Field
              label="Paste a list — one box per line"
              hint={'Optional "Box N:" prefixes are stripped. Lines fill Box 1, Box 2, … in order.'}
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
                Fill boxes from list
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasteBoxes("")} disabled={!pasteBoxes}>
                Clear
              </Button>
              {emptyBoxes.length === config.boxCount ? (
                <Button size="sm" variant="ghost" onClick={addSampleContents}>
                  Use examples
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
                    aria-label={`Box ${i + 1} type`}
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
                    placeholder={`Content for box ${i + 1}`}
                    aria-label={`Box ${i + 1} content`}
                    className="flex-1"
                  />
                </li>
              ))}
            </ul>

            {emptyBoxes.length > 0 ? (
              <p className="text-xs text-amber-600">
                {emptyBoxes.length} of {config.boxCount} box{config.boxCount === 1 ? "" : "es"} still empty — every
                box needs content before starting.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* Preview + actions */}
      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader title="Preview" subtitle="How the grid will look." icon={<Gift className="h-5 w-5" />} />
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
                Showing first 20 of {config.boxCount} boxes.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Button
          className="w-full"
          size="lg"
          icon={<Save className="h-5 w-5" />}
          onClick={() => {
            if (emptyBoxes.length > 0) {
              const labels = emptyBoxes.map((n) => `Box ${n}`).join(", ");
              toast.error(
                `${labels} ${emptyBoxes.length === 1 ? "is" : "are"} still empty — every box needs content before starting.`,
              );
              return;
            }
            if (config.participants.length === 0) {
              toast.error("Add at least one participant before playing.");
              return;
            }
            onPlay();
          }}
        >
          Start Game
        </Button>
        <p className="text-center text-xs text-gray-400">
          Your setup is saved automatically to this browser as you type.
        </p>
      </div>
    </div>
  );
}
