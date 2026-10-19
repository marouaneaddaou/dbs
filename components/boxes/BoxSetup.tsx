"use client";

import { useState } from "react";
import { Gift, Plus, Save, Trash2, UserPlus, Users, Wand2, X } from "lucide-react";
import type { BoxConfig, BoxContent, BoxContentType } from "@/types/boxes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { GiftBox } from "@/components/GiftBox";
import { useToast } from "@/components/ui/Toast";
import { normalizeNames, parseNameList } from "@/lib/randomization";
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
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newContentType, setNewContentType] = useState<BoxContentType>("gift");

  function patch(partial: Partial<BoxConfig>) {
    onChange({ ...config, ...partial, updatedAt: Date.now() });
  }

  function setBoxCount(value: number) {
    const clamped = Math.max(1, Math.min(200, Math.floor(value) || 1));
    patch({ boxCount: clamped });
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

  function addContent() {
    const text = newContent.trim();
    if (!text) {
      toast.error("Enter some content for the box.");
      return;
    }
    const content: BoxContent = { id: uid("content"), type: newContentType, text };
    patch({ contents: [...config.contents, content] });
    setNewContent("");
  }

  function addSampleContents() {
    const next = SAMPLE_CONTENTS.map((text, i) => ({
      id: uid("content"),
      type: (["question", "challenge", "gift", "task", "text", "challenge"] as BoxContentType[])[i] ?? "text",
      text,
    }));
    patch({ contents: [...config.contents, ...next] });
    toast.success("Added 6 example contents.");
  }

  function updateContent(id: string, partial: Partial<BoxContent>) {
    patch({ contents: config.contents.map((c) => (c.id === id ? { ...c, ...partial } : c)) });
  }

  function removeContent(id: string) {
    patch({ contents: config.contents.filter((c) => c.id !== id) });
  }

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
                  {config.boxCount > config.contents.length && config.contents.length > 0
                    ? "Contents will cycle to fill all boxes."
                    : "any positive number"}
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

        {/* Contents */}
        <Card>
          <CardHeader
            title="Box contents"
            subtitle={`${config.contents.length} content item(s). Repeated to fill every box.`}
            icon={<Wand2 className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={newContentType}
                onChange={(e) => setNewContentType(e.target.value as BoxContentType)}
                className="sm:w-40"
              >
                {CONTENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <Input
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addContent();
                  }
                }}
                placeholder="Write a question, challenge, task or gift..."
                className="flex-1"
              />
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addContent}>
                Add
              </Button>
            </div>

            {config.contents.length === 0 ? (
              <EmptyState
                icon={<Wand2 className="h-6 w-6" />}
                title="No box contents yet"
                description="Add questions, challenges, tasks, gifts or plain text. Empty boxes will simply be revealed as empty."
                action={
                  <Button variant="outline" size="sm" onClick={addSampleContents}>
                    Add 6 examples
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {config.contents.map((content) => (
                  <li key={content.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 sm:flex-row sm:items-center">
                    <Select
                      value={content.type}
                      onChange={(e) => updateContent(content.id, { type: e.target.value as BoxContentType })}
                      className="sm:w-36"
                    >
                      {CONTENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={content.text}
                      onChange={(e) => updateContent(content.id, { text: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeContent(content.id)}
                      aria-label="Remove content"
                      className="text-gray-400 hover:text-brand-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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
