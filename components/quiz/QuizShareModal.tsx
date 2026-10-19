"use client";

import { Copy, Link2, MessageCircle, Share2 } from "lucide-react";
import type { QuizRoom } from "@/types/quiz";
import { buildQuizShareUrl, buildWhatsAppShareUrl } from "@/lib/quiz";
import { copyToClipboard } from "@/lib/io";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/**
 * "Teilen / Share Room" popup for one quiz room.
 *
 * Shows the room's code with a copy button, the direct join link (built from
 * the current website URL so it works on any deployment) with a copy button,
 * and a WhatsApp button that opens the app's share picker with the link
 * pre-filled. Participants opening the link land on /quiz with the code
 * filled in — they still pick a username themselves.
 */
export function QuizShareModal({
  open,
  onClose,
  room,
}: {
  open: boolean;
  onClose: () => void;
  room: QuizRoom | null;
}) {
  const toast = useToast();

  if (!room) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = buildQuizShareUrl(room.code, origin);
  const title = room.title || "Untitled quiz";
  const whatsappMessage = `Join the quiz "${title}" — open ${shareUrl} (room code: ${room.code})`;

  async function copyCode() {
    const ok = await copyToClipboard(room!.code);
    if (ok) toast.success(`Copied code ${room!.code}.`);
    else toast.error("Could not copy to clipboard.");
  }

  async function copyLink() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) toast.success("Share link copied.");
    else toast.error("Could not copy to clipboard.");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Teilen / Share Room"
      description={`Invite participants to “${title}” — the link opens the join page with this room's code already filled in.`}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Room code + copy */}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">Room code</p>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-200 bg-gold-50/60 p-4">
            <span className="grow text-center font-mono text-3xl font-extrabold tracking-[0.3em] text-ink-900">
              {room.code}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy className="h-4 w-4" />}
              onClick={copyCode}
              aria-label={`Copy code ${room.code}`}
            >
              Copy Code
            </Button>
          </div>
        </div>

        {/* Share link + copy */}
        <Field
          label={
            <span className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Share link
            </span>
          }
          hint="Works on any device — participants just add their username."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={shareUrl}
              aria-label="Share link"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              className="shrink-0"
              icon={<Copy className="h-4 w-4" />}
              onClick={copyLink}
              aria-label="Copy share link"
            >
              Copy Link
            </Button>
          </div>
        </Field>

        {/* WhatsApp */}
        <a
          href={buildWhatsAppShareUrl(whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share via WhatsApp"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>

        <p className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
          <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />
          Every room keeps its own code and link — sharing one room never points participants at a different
          quiz. No account needed: players just enter a username.
        </p>
      </div>
    </Modal>
  );
}
