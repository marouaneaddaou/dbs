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
    if (copied) toast.success("Lien copié.");
    else toast.error("Impossible de copier le lien.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier"
      description="Open the existing Admin panel on your phone."
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <Field
          label="Editing link"
          hint="The link opens the real Admin panel and still requires the existing admin password. No password or storage credential is included in the URL."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={link}
              aria-label="Editing link"
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
              Copier le lien
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
          Open the editing interface
        </a>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <Smartphone className="h-4 w-4" />
            Cross-device sync ready (server-backed)
          </p>
          <p className="mt-2">
            Data can sync via shared storage when logged in as admin on both devices. Changes
            push automatically and poll for updates. Use Settings &rarr; Shared storage for
            manual push/pull/conflict handling.
          </p>
          <p className="mt-2">
            Back up first via{" "}
            <Link href="/settings/" className="font-semibold underline">
              Settings &rarr; backup / restore
            </Link>{" "}
            before first sync.
          </p>
        </div>
      </div>
    </Modal>
  );
}
