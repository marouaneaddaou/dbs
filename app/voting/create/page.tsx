import { ClientRedirect } from "@/components/ClientRedirect";

/** Legacy URL — the voting create page now lives under /votes. */
export default function VotingCreatePage() {
  return <ClientRedirect to="/votes/create" />;
}
