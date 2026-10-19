import Link from "next/link";
import { KeyRound, LogIn, Trophy, Vote } from "lucide-react";
import { DbsLogo } from "@/components/layout/DbsLogo";
import { Button } from "@/components/ui/Button";

/**
 * Public landing page — participants only.
 *
 * No admin navigation here: anyone can join a quiz or a vote with a code,
 * while creating and managing content lives behind the admin area.
 */
const cards = [
  {
    href: "/quiz",
    icon: Trophy,
    iconClass: "bg-gold-50 text-gold-600 ring-gold-200",
    title: "Join a Quiz",
    description: "Enter the quiz code from your host and play with your username.",
    action: "Join Quiz",
  },
  {
    href: "/votes",
    icon: Vote,
    iconClass: "bg-brand-50 text-brand-600 ring-brand-100",
    title: "Join a Vote",
    description: "Open the vote room link or enter a room code to cast your vote.",
    action: "Join Vote",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <DbsLogo size="lg" align="center" />
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Welcome to DBS
        </h1>
        <p className="mt-2 max-w-xl text-sm text-gray-500 sm:text-base">
          Play quizzes and vote in live rooms with just a code — no account needed.
        </p>
      </div>

      <section className="mt-12 grid gap-6 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.href}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${card.iconClass}`}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="mt-5 text-xl font-bold text-ink-900">{card.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">{card.description}</p>
              <Link href={card.href} className="mt-6">
                <Button className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />}>
                  {card.action}
                </Button>
              </Link>
            </div>
          );
        })}
      </section>

      <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-gray-400">
        <KeyRound className="h-4 w-4" />
        Got a code from your teacher or host? Open the matching page above and enter it.
      </p>
    </div>
  );
}
