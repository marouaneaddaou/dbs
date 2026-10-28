"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Cloud,
  Database,
  Download,
  FileJson,
  HardDrive,
  Info,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
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
import { useSharedSync } from "@/lib/shared/use-shared-sync";
import {
  backupDownloadUrl,
  createManualBackup,
  fetchBackups,
  formatBytes,
  restoreBackup,
  runMaintenance,
  type BackupEntry,
} from "@/lib/shared/backups";

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
      title="Admin-Anmeldung"
      description="Gib das Admin-Passwort ein, um Backups, Wiederherstellung und Speichereinstellungen zu öffnen."
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
  const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupStorage, setBackupStorage] = useState<"blob" | "local" | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const sync = useSharedSync();

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

  async function loadBackups(showErrors = true) {
    setBackupsLoading(true);
    try {
      const result = await fetchBackups();
      setBackups(result.backups);
      setBackupStorage(result.storage);
      if (result.created) {
        toast.success("Das automatische Tagesbackup wurde erstellt.");
      }
    } catch {
      if (showErrors) toast.error("Backups konnten nicht geladen werden.");
    } finally {
      setBackupsLoading(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    refresh();
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  async function backupNow() {
    setBusy("backup");
    try {
      await createManualBackup();
      await loadBackups(false);
      toast.success("Backup erstellt.");
    } catch {
      toast.error("Backup konnte nicht erstellt werden.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreNow() {
    if (!confirmRestore) return;
    setBusy("restore");
    try {
      await restoreBackup(confirmRestore.pathname);
      await sync.pull();
      refresh();
      await loadBackups(false);
      setConfirmRestore(null);
      toast.success("Backup wiederhergestellt. Der vorherige Stand wurde zusätzlich gesichert.");
    } catch {
      toast.error("Backup konnte nicht wiederhergestellt werden.");
    } finally {
      setBusy(null);
    }
  }

  async function cleanupNow() {
    setBusy("cleanup");
    try {
      const result = await runMaintenance();
      const removed =
        result.removed.boxConfigs +
        result.removed.votingRooms +
        result.removed.quizRooms +
        result.removed.boxGames +
        result.removed.quizSessions;
      await sync.pull();
      refresh();
      await loadBackups(false);
      toast.success(
        removed > 0
          ? `${removed} abgelaufene Entwürfe und zugehörige Daten wurden entfernt.`
          : "Keine abgelaufenen Entwürfe gefunden.",
      );
    } catch {
      toast.error("Die Bereinigung konnte nicht ausgeführt werden.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Deine Daten"
        title="Einstellungen & Backups"
        description="Gespeicherte Inhalte bleiben dauerhaft erhalten. Entwürfe ohne ausdrückliche Speicherung laufen nach 24 Stunden ab. Backups werden automatisch täglich erstellt."
        icon={<Database className="h-6 w-6" />}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Gemeinsamer Speicher (geräteübergreifend)"
            subtitle={sync.enabled ? "Über den Server synchronisiert" : "Nicht verbunden"}
            icon={<Cloud className="h-5 w-5" />}
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sync.enabled ? (sync.conflict ? "info" : "success") : "neutral"}>
                {sync.enabled ? (sync.conflict ? "Konflikt" : "Verbunden") : "Offline / nicht angemeldet"}
              </Badge>
              {sync.revision > 0 ? <Badge tone="neutral">Revision {sync.revision}</Badge> : null}
              {sync.lastSyncedAt ? (
                <Badge tone="neutral">Letzte Synchronisierung {new Date(sync.lastSyncedAt).toLocaleTimeString("de-DE")}</Badge>
              ) : null}
            </div>
            {sync.error ? <p className="text-sm text-brand-600">{sync.error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw className={`h-4 w-4 ${sync.syncing ? "animate-spin" : ""}`} />}
                disabled={!sync.enabled || sync.syncing}
                onClick={() => sync.pull()}
              >
                Vom Server laden
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Upload className="h-4 w-4" />}
                disabled={!sync.enabled || sync.syncing}
                onClick={() => sync.forcePush()}
              >
                Lokale Daten hochladen
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  window.open("/api/shared/backup", "_blank");
                }}
              >
                Aktuellen Serverstand herunterladen
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Admin-Anmeldung erforderlich. Vor dem Hochladen oder Wiederherstellen wird empfohlen, ein Backup zu erstellen.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Automatische Backups (alle 24 Stunden)"
            subtitle={
              backupStorage === "blob"
                ? "Speicherung in Vercel Blob"
                : backupStorage === "local"
                  ? "Lokaler Entwicklungsspeicher – auf Vercel nicht dauerhaft"
                  : "Speicherort wird geladen"
            }
            icon={<Archive className="h-5 w-5" />}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Save className="h-4 w-4" />}
                  disabled={busy !== null}
                  onClick={backupNow}
                >
                  Jetzt sichern
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RotateCcw className="h-4 w-4" />}
                  disabled={busy !== null}
                  onClick={cleanupNow}
                >
                  Entwürfe bereinigen
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Täglich wird automatisch ein Backup erstellt. Vor jeder Wiederherstellung wird der aktuelle Stand
                zusätzlich gesichert. Gespeicherte Spiele, Umfragen, Quizze und Ergebnisse werden nie automatisch gelöscht.
              </p>
            </div>

            {backupsLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ) : backups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
                Noch keine Backups vorhanden. Erstelle mit „Jetzt sichern“ das erste Backup.
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {backups.map((backup) => (
                  <li
                    key={backup.pathname}
                    className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {new Date(backup.createdAt).toLocaleString("de-DE")}
                      </p>
                      <p className="truncate font-mono text-xs text-gray-400">{backup.pathname}</p>
                      <p className="text-xs text-gray-500">{formatBytes(backup.size)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Download className="h-4 w-4" />}
                        onClick={() => window.open(backupDownloadUrl(backup.pathname), "_blank")}
                      >
                        Herunterladen
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<RotateCcw className="h-4 w-4" />}
                        disabled={busy !== null}
                        onClick={() => setConfirmRestore(backup)}
                      >
                        Wiederherstellen
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Speicherübersicht"
            subtitle={`Schema-Version ${STORAGE_VERSION}`}
            icon={<HardDrive className="h-5 w-5" />}
          />
          <CardBody>
            {!hydrated || !counts ? (
              <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat icon={<Boxes className="h-4 w-4" />} label="Boxspiele" value={counts.boxConfigs} />
                <Stat icon={<Boxes className="h-4 w-4" />} label="Spielstände" value={counts.boxGames} />
                <Stat icon={<Vote className="h-4 w-4" />} label="Umfragen" value={counts.votingRooms} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Quizze" value={counts.quizRooms} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Quiz-Sitzungen" value={counts.quizSessions} />
                <Stat icon={<Trophy className="h-4 w-4" />} label="Gespeicherte Ergebnisse" value={counts.quizResults} />
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs text-gray-500">Zuletzt gespeichert</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">
                    {counts.updatedAt ? new Date(counts.updatedAt).toLocaleString("de-DE") : "–"}
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Datei-Backup & Wiederherstellung" icon={<FileJson className="h-5 w-5" />} />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  const backup = exportBackup();
                  const total = Object.values(backup.data).length;
                  if (total === 0) {
                    toast.toast("Es gibt noch keine Daten zum Exportieren.", "info");
                    return;
                  }
                  downloadJSON(`dbs-zentrum-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
                  toast.success("Datei-Backup exportiert.");
                }}
              >
                Lokale Daten exportieren
              </Button>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-600">
                <Upload className="h-4 w-4" />
                Datei-Backup importieren
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
                        toast.error(result.error ?? "Import fehlgeschlagen.");
                        return;
                      }
                      refresh();
                      toast.success(`${result.imported} Datensatzgruppen importiert. Vorhandene Daten wurden ersetzt.`);
                    } catch {
                      toast.error("Die Datei ist kein gültiges JSON.");
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Der Import ersetzt die lokalen Datensatzgruppen und wird bei aktiver Verbindung automatisch mit dem Server
              synchronisiert. Erstelle vorher ein Backup, wenn du den aktuellen Stand behalten möchtest.
            </p>
          </CardBody>
        </Card>

        <Card className="border-brand-200">
          <CardHeader
            title="Gefahrenbereich"
            subtitle="Lokale Kopie in diesem Browser löschen."
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <CardBody>
            <Button variant="danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setConfirmClear(true)}>
              Lokale App-Daten löschen
            </Button>
            <p className="mt-3 text-xs text-gray-400">
              Entfernt die lokal in diesem Browser gespeicherte Kopie von Boxspielen, Umfragen, Quizzen und
              Ergebnissen. Serverdaten und tägliche Backups bleiben erhalten. Das kann nicht rückgängig gemacht werden.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Über den Speicher" icon={<Info className="h-5 w-5" />} />
          <CardBody className="space-y-3 text-sm text-gray-500">
            <p>
              Daten werden unter versionierten Schlüsseln gespeichert (zum Beispiel{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_random_boxes_configs_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_voting_rooms_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_quiz_rooms_v1</code>,{" "}
              <code className="rounded bg-gray-100 px-1 text-ink-800">dbs_quiz_history_v1</code>).
            </p>
            <p>
              Ausdrücklich gespeicherte Inhalte bleiben unbegrenzt erhalten. Entwürfe, die 24 Stunden lang nicht
              gespeichert wurden, werden automatisch entfernt. Der Server-Speicher und die täglichen Backups benötigen
              eine konfigurierte Vercel-Blob-Umgebung.
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Gespeichert = dauerhaft</Badge>
              <Badge tone="warning">Entwurf = 24 Stunden</Badge>
              <Badge tone="gold">Tägliche Backups</Badge>
            </p>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Lokale App-Daten löschen?"
        description="Die lokal in diesem Browser gespeicherte Kopie von Boxspielen, Umfragen, Quizzen und Ergebnissen wird dauerhaft gelöscht. Serverdaten und tägliche Backups bleiben erhalten. Exportiere vorher ein Backup, wenn du unsicher bist."
        confirmLabel="Lokale Daten löschen"
        onConfirm={() => {
          clearAllAppData();
          setConfirmClear(false);
          refresh();
          toast.success("Die lokale Kopie wurde gelöscht. Serverdaten bleiben erhalten.");
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={!!confirmRestore}
        title="Backup wiederherstellen?"
        description={
          confirmRestore
            ? `Der Stand vom ${new Date(confirmRestore.createdAt).toLocaleString("de-DE")} ersetzt die aktuellen Serverdaten. Der aktuelle Stand wird vorher automatisch gesichert.`
            : undefined
        }
        confirmLabel="Wiederherstellen"
        onConfirm={restoreNow}
        onCancel={() => setConfirmRestore(null)}
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
