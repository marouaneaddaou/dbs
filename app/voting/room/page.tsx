import { ClientRedirect } from "@/components/ClientRedirect";

/** Legacy URL — the voting room now lives under /votes. */
export default function VotingRoomRedirectPage() {
  return <ClientRedirect to="/votes/room" />;
}
