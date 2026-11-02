"use client";

import { useState } from "react";
import { AlertCircle, Pencil, Plus, RefreshCw, Save, Trash2, UserPlus, Users, X } from "lucide-react";
import type { BoxGroupRecord } from "@/types/participants";
import { useGroups } from "@/lib/use-groups";
import { normalizeNames, parseNameList } from "@/lib/randomization";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface GroupFormState {
  id: string;
  name: string;
  time: string;
  names: string[];
}

export function GroupManager() {
  const toast = useToast();
  const {
    groups,
    loading,
    saving,
    error,
    refresh,
    updateGroup,
    deleteGroup,
  } = useGroups();
  const [form, setForm] = useState<GroupFormState | null>(null);
  const [newName, setNewName] = useState("");
  const [pasteNames, setPasteNames] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BoxGroupRecord | null>(null);

  function startEdit(record: BoxGroupRecord) {
    setForm({
      id: record.id,
      name: record.name,
      time: record.time,
      names: [...record.participants],
    });
    setNewName("");
    setPasteNames("");
  }

  function addSingleName() {
    const name = newName.trim();
    if (!name) return;
    setForm((prev) =>
      prev ? { ...prev, names: normalizeNames([...prev.names, name]) } : prev,
    );
    setNewName("");
  }

  function addPastedNames() {
    const parsed = parseNameList(pasteNames);
    if (parsed.length === 0) {
      toast.error("Gib mindestens einen Namen ein oder füge ihn ein.");
      return;
    }
    setForm((prev) =>
      prev ? { ...prev, names: normalizeNames([...prev.names, ...parsed]) } : prev,
    );
    setPasteNames("");
  }

  function renameParticipant(index: number, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const names = prev.names.slice();
      names[index] = value;
      return { ...prev, names };
    });
  }

  function removeParticipant(index: number) {
    setForm((prev) =>
      prev ? { ...prev, names: prev.names.filter((_, i) => i !== index) } : prev,
    );
  }

  async function saveGroup() {
    if (!form || saving) return;
    const name = form.name.trim();
    const time = form.time.trim();
    const names = normalizeNames(form.names);

    if (!name) {
      toast.error("Gib einen Gruppennamen ein.");
      return;
    }
    if (!time) {
      toast.error("Gib eine Uhrzeit ein.");
      return;
    }
    if (names.length === 0) {
      toast.error("Füge mindestens eine teilnehmende Person hinzu.");
      return;
    }

    try {
      const input = { name, time, participants: names };
      await updateGroup(form.id, input);
      setForm(null);
      toast.success("Gruppe aktualisiert.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Die Gruppe konnte nicht gespeichert werden.",
      );
    }
  }

  async function removeGroup() {
    if (!pendingDelete || saving) return;
    try {
      await deleteGroup(pendingDelete.id);
      setPendingDelete(null);
      toast.success("Gruppe entfernt.");
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error ? deleteError.message : "Die Gruppe konnte nicht entfernt werden.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Gruppen"
        subtitle={loading ? "Gruppen werden geladen …" : `${groups.length} Gruppen`}
        icon={<Users className="h-5 w-5" />}
      />
      <CardBody className="p-0">
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-5 py-3 text-sm text-brand-700">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void refresh()}
              disabled={loading}
            >
              Erneut laden
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3 font-medium">Gruppe</th>
                <th className="px-5 py-3 font-medium">Zeit</th>
                <th className="px-5 py-3 font-medium">Teilnehmende</th>
                <th className="px-5 py-3 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading && groups.length === 0 ? (
                Array.from({ length: 4 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-gray-100 last:border-0">
                    <td className="px-5 py-4">
                      <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="ml-auto h-8 w-20 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                    Noch keine Gruppen vorhanden.
                  </td>
                </tr>
              ) : (
                groups.map((group) => (
                  <tr
                    key={group.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-5 py-4 align-middle">
                      <p className="font-medium text-ink-900">{group.name}</p>
                    </td>
                    <td className="px-5 py-4 align-middle text-sm text-gray-600">
                      {group.time || "—"}
                    </td>
                    <td className="px-5 py-4 align-middle text-xs text-gray-500">
                      {group.participants.length} Namen
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <IconBtn
                          label="Gruppe bearbeiten"
                          icon={<Pencil className="h-4 w-4" />}
                          onClick={() => startEdit(group)}
                        />
                        <IconBtn
                          label="Gruppe löschen"
                          tone="danger"
                          icon={<Trash2 className="h-4 w-4" />}
                          onClick={() => setPendingDelete(group)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardBody>

      <Modal
        open={!!form}
        onClose={() => (saving ? undefined : setForm(null))}
        title="Gruppe bearbeiten"
        description="Name, Uhrzeit und Teilnehmende werden dauerhaft in der Datenbank gespeichert und synchronisiert."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              Abbrechen
            </Button>
            <Button
              icon={<Save className="h-4 w-4" />}
              onClick={() => void saveGroup()}
              loading={saving}
            >
              Speichern
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gruppenname">
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                  }
                  placeholder="z. B. Gruppe F"
                  maxLength={120}
                />
              </Field>
              <Field label="Uhrzeit">
                <Input
                  value={form.time}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, time: event.target.value } : prev))
                  }
                  placeholder="z. B. 19:00 Uhr"
                  maxLength={80}
                />
              </Field>
            </div>

            <div className="space-y-3">
              <Field
                label="Teilnehmende"
                hint={`${form.names.length} Name(n) in dieser Gruppe.`}
              >
                <Textarea
                  value={pasteNames}
                  onChange={(event) => setPasteNames(event.target.value)}
                  placeholder="Namen durch Zeilen oder Kommas getrennt einfügen"
                  className="min-h-[88px]"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={addPastedNames}
                >
                  Eingefügte Namen hinzufügen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPasteNames("")}
                  disabled={!pasteNames}
                >
                  Leeren
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSingleName();
                  }
                }}
                placeholder="Einen Namen hinzufügen"
              />
              <Button
                variant="secondary"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={addSingleName}
              >
                Hinzufügen
              </Button>
            </div>

            {form.names.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                Noch keine Teilnehmenden. Füge mindestens einen Namen hinzu.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {form.names.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(event) => renameParticipant(index, event.target.value)}
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
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Diese Gruppe löschen?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" und ihre Zuordnung werden dauerhaft entfernt. Die Teilnehmenden selbst bleiben erhalten.`
            : undefined
        }
        confirmLabel="Löschen"
        onConfirm={() => void removeGroup()}
        onCancel={() => (saving ? undefined : setPendingDelete(null))}
      />
    </Card>
  );
}

function IconBtn({
  label,
  icon,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors " +
        (tone === "danger"
          ? "hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
          : "hover:border-gold-300 hover:text-gold-600")
      }
    >
      {icon}
    </button>
  );
}
