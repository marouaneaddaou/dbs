"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Gift,
  ListChecks,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import type { CorrectVisibility, QuizAnswer, QuizQuestion, QuizRoom } from "@/types/quiz";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { uid } from "@/lib/storage";
import { SPEED_BONUS_RATE, validateRoom } from "@/lib/quiz";
import { normalizeCode } from "@/lib/voting";
import { cn } from "@/lib/cn";

interface DraftQuestion {
  id: string;
  text: string;
  answers: QuizAnswer[];
  points: number;
  timerEnabled: boolean;
  timeLimitSec: number;
  speedBonus: boolean;
}

function newQuestion(): DraftQuestion {
  const answers: QuizAnswer[] = Array.from({ length: 4 }, (_, i) => ({
    id: uid("ans"),
    text: "",
    correct: i === 0,
  }));
  return {
    id: uid("q"),
    text: "",
    answers,
    points: 100,
    timerEnabled: true,
    timeLimitSec: 20,
    speedBonus: true,
  };
}

function toRoomQuestion(q: DraftQuestion): QuizQuestion {
  return {
    id: q.id,
    text: q.text.trim(),
    points: Math.max(1, Math.floor(q.points) || 1),
    timeLimitSec: q.timerEnabled ? Math.max(5, Math.floor(q.timeLimitSec) || 5) : null,
    speedBonus: q.speedBonus,
    answers: q.answers
      .map((a) => ({ ...a, text: a.text.trim() }))
      .filter((a) => a.text.length > 0),
  };
}

export function QuizRoomForm({
  initialRoom,
  reservedCodes = [],
  onSaved,
}: {
  initialRoom?: QuizRoom;
  reservedCodes?: string[];
  onSaved: (room: QuizRoom) => void;
}) {
  const toast = useToast();
  const editing = Boolean(initialRoom);
  const [codeInput, setCodeInput] = useState("");
  const [title, setTitle] = useState(initialRoom?.title ?? "");
  const [description, setDescription] = useState(initialRoom?.description ?? "");
  const [correctVisibility, setCorrectVisibility] = useState<CorrectVisibility>(
    initialRoom?.correctVisibility ?? "afterEach",
  );
  const [publishNow, setPublishNow] = useState(initialRoom ? initialRoom.status !== "draft" : true);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initialRoom && initialRoom.questions.length > 0
      ? initialRoom.questions.map((q) => ({
          id: q.id,
          text: q.text,
          answers: q.answers.map((a) => ({ ...a })),
          points: q.points,
          timerEnabled: q.timeLimitSec !== null,
          timeLimitSec: q.timeLimitSec ?? 20,
          speedBonus: q.speedBonus,
        }))
      : [newQuestion()],
  );
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function move(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setCorrect(questionId: string, answerId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, answers: q.answers.map((a) => ({ ...a, correct: a.id === answerId })) }
          : q,
      ),
    );
  }

  function updateAnswer(questionId: string, answerId: string, text: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, answers: q.answers.map((a) => (a.id === answerId ? { ...a, text } : a)) }
          : q,
      ),
    );
  }

  function addAnswer(questionId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId && q.answers.length < 8
          ? { ...q, answers: [...q.answers, { id: uid("ans"), text: "", correct: false }] }
          : q,
      ),
    );
  }

  function removeAnswer(questionId: string, answerId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId || q.answers.length <= 2) return q;
        const removedWasCorrect = q.answers.find((a) => a.id === answerId)?.correct;
        const remaining = q.answers.filter((a) => a.id !== answerId);
        if (removedWasCorrect && remaining.length > 0) remaining[0].correct = true;
        return { ...q, answers: remaining };
      }),
    );
  }

  function handleSubmit() {
    setError(null);
    const taken = new Set(reservedCodes.map((c) => normalizeCode(c)));
    if (initialRoom) taken.delete(normalizeCode(initialRoom.code));

    // The admin chooses the room code manually — it is never generated.
    let code: string;
    if (initialRoom) {
      code = initialRoom.code;
    } else {
      const chosen = normalizeCode(codeInput);
      if (!chosen) {
        setError("Choose your room code before creating the quiz.");
        return;
      }
      if (taken.has(chosen)) {
        setError(`The code ${chosen} is already used by another quiz. Choose a different code.`);
        return;
      }
      code = chosen;
    }

    const room: QuizRoom = {
      code,
      title: title.trim(),
      description: description.trim(),
      questions: questions.map(toRoomQuestion),
      correctVisibility,
      status: publishNow ? "published" : "draft",
      createdAt: initialRoom?.createdAt ?? Date.now(),
    };
    const check = validateRoom(room);
    if (!check.ok) {
      setError(check.error ?? "Please review your quiz.");
      return;
    }
    onSaved(room);
    toast.success(
      editing ? `Quiz ${room.code} updated.` : `Quiz ${room.code} created and saved locally.`,
    );
  }

  // Base points for every correct answer plus the speed bonus (only reachable
  // while the question's timer is running).
  const maxTotalPoints = questions.reduce((sum, q) => {
    const bonus = q.timerEnabled && q.timeLimitSec > 0 ? Math.round(q.points * SPEED_BONUS_RATE) : 0;
    return sum + Math.max(0, q.points) + bonus;
  }, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Quiz details" icon={<Trophy className="h-5 w-5" />} />
          <CardBody className="space-y-5">
            <Field
              label="Choose Your Room Code"
              hint={
                editing
                  ? "The room code stays unchanged until the room is closed or deleted."
                  : "Participants join by entering this exact code with their username."
              }
            >
              <Input
                value={editing ? initialRoom?.code ?? "" : codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                disabled={editing}
                placeholder={editing ? "" : "e.g. 12355"}
                className="font-mono tracking-[0.3em] disabled:opacity-60"
                maxLength={12}
              />
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday trivia night" />
            </Field>
            <Field label="Description" hint="Optional intro shown before the quiz starts.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description for players."
              />
            </Field>
            <Field
              label="When to reveal correct answers"
              hint="Classroom sessions always reveal at the end — the answer key stays hidden from students until everyone finishes."
            >
              <Select
                value={correctVisibility}
                onChange={(e) => setCorrectVisibility(e.target.value as CorrectVisibility)}
              >
                <option value="afterEach">After each question</option>
                <option value="atEnd">Only at the very end</option>
              </Select>
            </Field>
            <Switch
              checked={publishNow}
              onChange={setPublishNow}
              label="Publish quiz"
              description={
                publishNow
                  ? "The quiz is ready to play with its local code."
                  : "Saved as a draft — players can't start it until you publish."
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Questions"
            subtitle={`${questions.length} question(s) · up to ${maxTotalPoints.toLocaleString("en-US")} points total`}
            icon={<ListChecks className="h-5 w-5" />}
            action={
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setQuestions((p) => [...p, newQuestion()])}>
                Add question
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
                    onChange={(e) => update(question.id, { text: e.target.value })}
                    placeholder="Question text"
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={() => move(qIndex, -1)} disabled={qIndex === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(qIndex, 1)} disabled={qIndex === questions.length - 1} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuestions((p) => p.filter((q) => q.id !== question.id))}
                    disabled={questions.length === 1}
                    aria-label="Remove question"
                    className="text-gray-400 hover:text-brand-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 pl-9">
                  {question.answers.map((answer, aIndex) => (
                    <div key={answer.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCorrect(question.id, answer.id)}
                        aria-label={`Mark option ${aIndex + 1} correct`}
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                          answer.correct
                            ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                            : "border-gray-300 text-transparent hover:border-gray-400",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <Input
                        value={answer.text}
                        onChange={(e) => updateAnswer(question.id, answer.id, e.target.value)}
                        placeholder={`Answer ${aIndex + 1}${answer.correct ? " (correct)" : ""}`}
                        className="h-9"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAnswer(question.id, answer.id)}
                        disabled={question.answers.length <= 2}
                        aria-label="Remove answer"
                        className="text-gray-400 hover:text-brand-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => addAnswer(question.id)} disabled={question.answers.length >= 8}>
                    Add answer
                  </Button>

                  <div className="grid gap-3 pt-2 sm:grid-cols-3">
                    <Field label="Timer (seconds)">
                      <Input
                        type="number"
                        min={5}
                        value={question.timeLimitSec}
                        disabled={!question.timerEnabled}
                        onChange={(e) => update(question.id, { timeLimitSec: Number(e.target.value) })}
                        className="h-9 disabled:opacity-40"
                      />
                    </Field>
                    <div className="flex items-end sm:col-span-2">
                      <Switch
                        checked={question.timerEnabled}
                        onChange={(v) => update(question.id, { timerEnabled: v })}
                        label="Timer on"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Speed bonus: a correct answer keeps its full {question.points} points and earns up to{" "}
                    {Math.round(question.points * SPEED_BONUS_RATE)} more — the less time used, the higher the
                    bonus. Wrong answers and unanswered questions score 0.
                  </p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader title="Summary" icon={<Sparkles className="h-5 w-5" />} />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <SummaryRow label="Room code" value={editing ? initialRoom?.code ?? "" : codeInput || "—"} />
            <SummaryRow label="Questions" value={String(questions.length)} />
            <SummaryRow
              label="Points per question"
              value={`Base + up to ${Math.round((questions[0]?.points ?? 100) * SPEED_BONUS_RATE)} speed bonus`}
            />
            <SummaryRow label="Max points" value={maxTotalPoints.toLocaleString("en-US")} />
            <SummaryRow
              label="Answers revealed"
              value={correctVisibility === "afterEach" ? "After each question" : "At the end"}
            />
            <SummaryRow
              label="Timers"
              value={String(questions.filter((q) => q.timerEnabled).length)}
            />
            <SummaryRow label="Status" value={publishNow ? "Published" : "Draft"} />
            <p className="flex items-center gap-2 pt-1 text-xs text-gray-400">
              <Gift className="h-3.5 w-3.5" />
              {editing ? `Keeping code ${initialRoom?.code}.` : "Codes are never auto-generated — the room is created only with the code you chose."}
            </p>
          </CardBody>
        </Card>
        {error ? (
          <p className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">{error}</p>
        ) : null}
        <Button className="w-full" size="lg" icon={<Save className="h-5 w-5" />} onClick={handleSubmit}>
          {editing ? "Save changes" : "Create quiz"}
        </Button>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-gray-400">
          <Clock className="h-3.5 w-3.5" /> Timers and deadlines are enforced in this browser.
        </p>
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
