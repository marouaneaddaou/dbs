"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Smartphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { copyToClipboard } from "@/lib/io";

export function ModifierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!open) return;
    setLink(`${window.location.origin}/admin/`);
  }, [open]);

  async function copyLink() {
    if (!link) return;
    const copied = await copyToClipboard(link);
    if (copied) toast.success("Link kopiert.");
    else toast.error("Der Link konnte nicht kopiert werden.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auf dem Smartphone bearbeiten"
      description="Öffne das bestehende Admin-Panel auf deinem Smartphone."
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      }
    >
      <div className="space-y-5">
        <Field
          label="Bearbeitungslink"
          hint="Der Link öffnet das echte Admin-Panel und verlangt weiterhin das Admin-Passwort. Es werden weder Passwort noch Speicher-Zugangsdaten in der URL übertragen."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={link}
              aria-label="Bearbeitungslink"
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="gold"
              icon={<Copy className="h-4 w-4" />}
              onClick={copyLink}
              disabled={!link}
              className="shrink-0"
            >
              Link kopieren
            </Button>
          </div>
        </Field>

        <a
          href={link || "/admin/"}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Bearbeitungsoberfläche öffnen
        </a>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <Smartphone className="h-4 w-4" />
            Geräteübergreifende Synchronisierung bereit
          </p>
          <p className="mt-2">
            Wenn du auf beiden Geräten als Admin angemeldet bist, werden die Daten über den
            gemeinsamen Speicher synchronisiert. Änderungen werden automatisch übertragen und
            regelmäßig abgerufen. Unter Einstellungen &rarr; Gemeinsamer Speicher kannst du
            manuell laden, hochladen und Konflikte behandeln.
          </p>
          <p className="mt-2">
            Erstelle vor der ersten Synchronisierung ein{" "}
            <Link href="/settings/" className="font-semibold underline">
              Backup unter Einstellungen &rarr; Backups
            </Link>
            .
          </p>
        </div>
      </div>
    </Modal>
  );
}
