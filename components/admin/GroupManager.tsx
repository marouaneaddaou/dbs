"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, UserPlus, Users, X } from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import type { BoxGroupMemberships, BoxGroupRecord, BoxParticipant } from "@/types/participants";
import {
  BOX_GROUPS,
  boxGroupFromRecord,
  boxGroupLabel,
  sanitizeBoxGroupRecords,
  type BoxGroup,
} from "@/lib/box-groups";
import {
  membershipIdsForNames,
  membershipNamesForIds,
  registerParticipantNames,
} from "@/lib/participants";
import { normalizeNames, parseNameList } from "@/lib/randomization";
import { STORAGE_KEYS, uid } from "@/lib/storage";
import { useLocalStorage } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface GroupFormState {
  id: string | null;
  name: string;
  time: string;
  names: string[];
}

interface GroupRow {
  group: BoxGroup;
  record: BoxGroupRecord | null;
}

export function GroupManager() {
  const toast = useToast();
  const { value: storedGroups, setValue: setGroups } = useLocalStorage<BoxGroupRecord[]>(
    STORAGE_KEYS.boxGroups,
    [],
  );
  const { value: participants, setValue: setParticipants } = useLocalStorage<BoxParticipant[]>(
    STORAGE_KEYS.boxParticipants,
    [],
  );
  const { value: memberships, setValue: setMemberships } = useLocalStorage<BoxGroupMemberships>(
    STORAGE_KEYS.boxGroupMembers,
    {},
  );
  const { value: configs, setValue: setConfigs } = useLocalStorage<BoxConfig[]>(
    STORAGE_KEYS.boxConfigs,
    [],
  );
  const { value: games, setValue: setGames } = useLocalStorage<Record<string, BoxGame>>(
    STORAGE_KEYS.boxGames,
    {},
  );

  const groups = useMemo(() => sanitizeBoxGroupRecords(storedGroups), [storedGroups]);
  const [form, setForm] = useState<GroupFormState | null>(null);
  const [newName, setNewName] = useState("");
  const [pasteNames, setPasteNames] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BoxGroupRecord | null>(null);

  function namesFor(groupId: string, fallback: readonly string[]): string[] {
    const ids = memberships[groupId];
    if (ids) return membershipNamesForIds(participants, ids);
    const existing = configs.find((config) => config.id === groupId);
    return existing ? [...existing.participants] : [...fallback];
  }

  const rows = useMemo<GroupRow[]>(() => {
    return [
      ...BOX_GROUPS.map((group) => ({ group: { ...group, names: namesFor(group.id, group.names) }, record: null })),
      ...groups.map((record) => ({
        group: boxGroupFromRecord(record, namesFor(record.id, [])),
        record,
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, groups, memberships, participants]);

  function startCreate() {
    setForm({ id: null, name: "", time: "", names: [] });
    setNewName("");
    setPasteNames("");
  }

  function startEdit(record: BoxGroupRecord) {
    setForm({
      id: record.id,
      name: record.name,
      time: record.time,
      names: namesFor(record.id, []),
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

  function saveGroup() {
    if (!form) return;
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

    const now = Date.now();
    const existing = form.id ? groups.find((group) => group.id === form.id) : null;
    const id = existing?.id ?? uid("group");
    const record: BoxGroupRecord = {
      id,
      name,
      time,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const registry = registerParticipantNames(participants, names, now);
    const nextMemberships = {
      ...memberships,
      [id]: membershipIdsForNames(registry, names),
    };
    const label = boxGroupLabel(name, time);

    setGroups((prev) =>
      existing ? prev.map((group) => (group.id === id ? record : group)) : [...prev, record],
    );
    if (registry !== participants) setParticipants(registry);
    setMemberships(nextMemberships);
    setConfigs((prev) =>
      prev.map((config) =>
        config.id === id
          ? { ...config, name: label, participants: names, updatedAt: now }
          : config,
      ),
    );

    setForm(null);
    toast.success(existing ? "Gruppe aktualisiert." : "Gruppe erstellt.");
  }

  function deleteGroup(record: BoxGroupRecord) {
    setGroups((prev) => prev.filter((group) => group.id !== record.id));
    setMemberships((prev) => {
      const next = { ...prev };
      delete next[record.id];
      return next;
    });
    setConfigs((prev) => prev.filter((config) => config.id !== record.id));
    setGames((prev) => {
      if (!(record.id in prev)) return prev;
      const next = { ...prev };
      delete next[record.id];
      return next;
    });
    setPendingDelete(null);
    toast.success("Gruppe entfernt.");
  }

  return (
    <Card>
      <CardHeader
        title="Gruppen"
        subtitle={`${rows.length} Gruppen`}
        icon={<Users className="h-5 w-5" />}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            onClick={startCreate}
          >
            Gruppe erstellen
          </Button>
        }
      />
      <CardBody className="p-0">
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
              {rows.map(({ group, record }) => {
                const separator = group.label.indexOf(":");
                const rowName = record
                  ? record.name
                  : group.label.slice(0, separator >= 0 ? separator : undefined).trim();
                const rowTime = record
                  ? record.time
                  : separator >= 0
                    ? group.label.slice(separator + 1).trim()
                    : "";
                return (
                  <tr
                    key={group.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-5 py-4 align-middle">
                      <p className="font-medium text-ink-900">{rowName}</p>
                    </td>
                    <td className="px-5 py-4 align-middle text-sm text-gray-600">
                      {rowTime || "—"}
                    </td>
                    <td className="px-5 py-4 align-middle text-xs text-gray-500">
                      {group.names.length} Namen
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {record ? (
                          <>
                            <IconBtn
                              label="Gruppe bearbeiten"
                              icon={<Pencil className="h-4 w-4" />}
                              onClick={() => startEdit(record)}
                            />
                            <IconBtn
                              label="Gruppe löschen"
                              tone="danger"
                              icon={<Trash2 className="h-4 w-4" />}
                              onClick={() => setPendingDelete(record)}
                            />
                          </>
                        ) : (
                          <Badge tone="neutral">Vorlage</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Gruppe bearbeiten" : "Gruppe erstellen"}
        description="Name, Uhrzeit und Teilnehmende werden dauerhaft gespeichert und synchronisiert."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Abbrechen
            </Button>
            <Button icon={<Save className="h-4 w-4" />} onClick={saveGroup}>
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
                />
              </Field>
              <Field label="Uhrzeit">
                <Input
                  value={form.time}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, time: event.target.value } : prev))
                  }
                  placeholder="z. B. 07:00 Uhr"
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
        onConfirm={() => pendingDelete && deleteGroup(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
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
