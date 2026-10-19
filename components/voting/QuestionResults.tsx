"use client";

import { BarChart3, Crown } from "lucide-react";
import type { QuestionResult } from "@/types/voting";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

function rankTone(rank: number): string {
  if (rank === 1) return "bg-gold-500";
  if (rank === 2) return "bg-gray-400";
  if (rank === 3) return "bg-orange-300";
  return "bg-gray-200";
}

export function QuestionResults({
  results,
  showRanks = true,
}: {
  results: QuestionResult[];
  showRanks?: boolean;
}) {
  return (
    <div className="space-y-5">
      {results.map((question, index) => {
        const maxVotes = Math.max(1, ...question.options.map((o) => o.votes));
        return (
          <Card key={question.questionId}>
            <CardHeader
              title={question.text}
              subtitle={`Question ${index + 1} · ${question.totalVotes} vote(s)`}
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <CardBody className="space-y-3">
              {question.options.map((option) => {
                const width = (option.votes / maxVotes) * 100;
                const isWinner = option.rank === 1 && option.votes > 0;
                return (
                  <div key={option.optionId}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-gray-700">
                        {isWinner ? <Crown className="h-4 w-4 text-gold-500" /> : null}
                        <span className={cn(isWinner && "font-semibold text-ink-900")}>{option.text}</span>
                        {showRanks ? <Badge tone="neutral">#{option.rank}</Badge> : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-500">
                        {option.votes} · {option.percentage}%
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", rankTone(option.rank))}
                        style={{ width: `${Math.max(option.votes > 0 ? 4 : 0, width)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {question.totalVotes === 0 ? (
                <p className="text-center text-xs text-gray-400">No votes yet.</p>
              ) : null}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
