"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, LogIn } from "lucide-react";
import { loginAdmin } from "@/lib/admin-auth";
import { DbsLogo } from "@/components/layout/DbsLogo";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/**
 * Password-only admin login. No email or username — just the password.
 * On success the session is stored in sessionStorage and the caller re-renders.
 */
export function AdminLogin({
  title = "Admin login",
  description = "Enter the admin password to manage games, quizzes and votes.",
}: {
  title?: string;
  description?: string;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      setError("Enter the admin password.");
      return;
    }
    if (loginAdmin(password)) {
      setPassword("");
      setError(null);
      return;
    }
    setPassword("");
    setError("Incorrect password. Please try again.");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 sm:px-6">
      <DbsLogo size="md" align="center" />

      <form
        onSubmit={handleSubmit}
        className="mt-10 w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-card"
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Lock className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Admin password">
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                autoFocus
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {error ? (
            <p className="rounded-lg border border-brand-200 bg-brand-50 p-2.5 text-sm text-brand-700" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" size="lg" icon={<LogIn className="h-4 w-4" />}>
            Login
          </Button>
        </div>
      </form>

      <p className="mt-6 max-w-sm text-center text-xs text-gray-400">
        This is a local demo password gate stored only in this tab’s session. It is not production-grade security.
      </p>
    </div>
  );
}
