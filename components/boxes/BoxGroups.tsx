"use client";

import { ArrowRight, Clock, Users } from "lucide-react";
import type { BoxGroup } from "@/lib/box-groups";
import { Badge } from "@/components/ui/Badge";

export function BoxGroups({
  groups,
  onOpen,
}: {
  groups: readonly BoxGroup[];
  onOpen: (group: BoxGroup) => void;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Groups</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Choose a group to load its participants. The boxes stay free for your questions.
          </p>
        </div>
        <Badge tone="gold" icon={<Users className="h-3.5 w-3.5" />}>
          {groups.length} groups
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onOpen(group)}
            aria-label={`Open ${group.label} with ${group.names.length} names`}
            className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-1 hover:border-gold-300 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
                <Users className="h-5 w-5" />
              </span>
              <Badge tone="neutral">Gruppe {group.letter}</Badge>
            </div>

            <h3 className="mt-4 text-lg font-semibold text-ink-900">{group.label}</h3>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500">
              <Clock className="h-3.5 w-3.5" />
              {group.names.length} names ready
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <span className="text-gray-500">Participants only</span>
              <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                Open
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
