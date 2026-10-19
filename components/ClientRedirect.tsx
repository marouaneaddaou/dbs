"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side redirect used for legacy URLs.
 * (The app is a static export, so server-side redirects are unavailable.)
 * Keeps the query string, so old `?code=` links still work.
 */
export function ClientRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`${to}${window.location.search}`);
  }, [router, to]);

  return null;
}
