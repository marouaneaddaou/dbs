import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  backHref,
  backLabel,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel ?? "Zurück"}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          {icon ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
              {icon}
            </span>
          ) : null}
          <div>
            {eyebrow ? (
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
            {description ? <p className="mt-1.5 max-w-2xl text-sm text-gray-500">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
