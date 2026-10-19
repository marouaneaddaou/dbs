import { ClientRedirect } from "@/components/ClientRedirect";

/** Legacy URL — the voting pages now live under /votes. */
export default function VotingPage() {
  return <ClientRedirect to="/votes" />;
}
