"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Database,
  Download,
  FileJson,
  HardDrive,
  Info,
  Trophy,
  Upload,
  Vote,
} from "lucide-react";
import type { BoxConfig, BoxGame } from "@/types/boxes";
import type { VotingRoomRecord } from "@/types/voting";
import type { QuizHistoryMap, QuizRoom, QuizSessionRecord } from "@/types/quiz";
import {
  STORAGE_KEYS,
  STORAGE_VERSION,
  clearAllAppData,
  exportBackup,
  getMeta,
  importBackup,
  readJSON,
} from "@/lib/storage";
import { useHydrated } from "@/lib/hooks";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { downloadJSON, readJSONFile } from "@/lib/io";

interface Counts {
  boxConfigs: number;
  boxGames: number;
  votingRooms: number;
  quizRooms: number;
  quizSessions: number;
  quizResults: number;
  updatedAt: number;
}

export default function SettingsPage() {
  return (
    <AdminGate
      title="Admin login"
      description="Enter the admin password to access backup, restore and storage settings."
    >
      <SettingsPageContent />
    </AdminGate>
  );
}

function SettingsPageContent() {
  const hydrated = useHydrated();
  const toast = useToast();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function refresh() {
    const meta = getMeta();
    const historyMap = readJSON<QuizHistoryMap>(STORAGE_KEYS.quizHistory, {});
    setCounts({
      boxConfigs: readJSON<BoxConfig[]>(STORAGE_KEYS.boxConfigs, []).length,
      boxGames: Object.keys(readJSON<Record<string, BoxGame>>(STORAGE_KEYS.boxGames, {})).length,
      votingRooms: readJSON<VotingRoomRecord[]>(STORAGE_KEYS.votingRooms, []).length,
      quizRooms: readJSON<QuizRoom[]>(STORAGE_KEYS.quizRooms, []).length,
      quizSessions: Object.keys(readJSON<Record<string, QuizSessionRecord>>(STORAGE_KEYS.quizSessions, {})).length,
      quizResults: Object.values(historyMap).reduce((sum, runs) => sum + (Array.isArray(runs) ? runs.length : 0), 0),
      updatedAt: meta.updatedAt,
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Your data"
        title="Settings & Backup"
        description="Everything is stored in this browser's localStorage. Export a JSON backup to move your work to another device manually."
        icon={<Database className="h-6 w-6" />}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Storage overview"
            subtitle={`Schema version ${STORAGE_VERSION}`}
            icon={<HardDrive className="h-5 w-5" />}
          />
          <CardBody>
            {!hydrated || !counts ? (
              <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat icon={<Boxes className="h-4 w-4" />} label="Box games" value={counts.boxConfigs} />
                <Stat icon={<Boxes className="h-4 w-4" />} label="Game states" value={counts.boxGames} />
                <Stat icon={<Vote className="h-4 w-4" />} label="Voting rooms" value={counts.votingRooms} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Quizzes" value={counts.quizRooms} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Quiz sessions" value={counts.quizSessions} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Saved quiz results" value={counts.quizResults} />
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs text-gray-500">Last saved</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">
                    {counts.updatedAt ? new Date(counts.updatedAt).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Backup & restore" icon={<FileJson className="h-5 w-5" />} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  const backup = exportBackup();
                  const total = Object.values(backup.data).length;
                  if (total === 0) {
                    toast.toast("There is nothing to export yet.", "info");
                    return;
                  }
                  downloadJSON(`dbs-zentrum-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
                  toast.success("Backup exported.");
                }}
              >
                Export all data
              </Button>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
                <Upload className="h-4 w-4" />
                Import backup
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const parsed = await readJSONFile(file);
                      const result = importBackup(parsed);
                      if (!result.ok) {
                        toast.error(result.error ?? "Import failed.");
                        return;
                      }
                      refresh();
                      toast.success(`Imported ${result.imported} dataset(s). Existing data was merged.`);
                    } catch {
                      toast.error("That file is not valid JSON.");
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Import merges datasets by replacing whole keys. Keep a backup before importing if you want to preserve
              current data.
            </p>
          </CardBody>
        </Card>

        <Card className="border-brand-200">
          <CardHeader
            title="Danger zone"
            subtitle="Delete everything this app has stored in this browser."
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <CardBody>
            <Button variant="danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setConfirmClear(true)}>
              Clear all app data
            </Button>
            <p className="mt-3 text-xs text-gray-400">
              This removes box games, voting rooms, quizzes and saved quiz results from this browser only. It cannot be undone.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="About local storage" icon={<Info className="h-5 w-5" />} />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>
              Data is saved under versioned keys (for example{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_random_boxes_configs_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_voting_rooms_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_quiz_rooms_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_quiz_history_v1</code>).
            </p>
            <p>
              localStorage is per-browser and per-device. It does <strong className="text-ink-900">not</strong> sync
              between devices, browsers, or even profiles. Use export/import to transfer rooms.
            </p>
            <p className="flex items-center gap-2">
              <Badge tone="info">Offline-ready</Badge>
              <Badge tone="neutral">No server</Badge>
              <Badge tone="gold">Private</Badge>
            </p>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all app data?"
        description="All box games, voting rooms and quizzes stored in this browser will be permanently deleted. Export a backup first if unsure."
        confirmLabel="Delete everything"
        onConfirm={() => {
          clearAllAppData();
          setConfirmClear(false);
          refresh();
          toast.success("All app data cleared.");
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}
