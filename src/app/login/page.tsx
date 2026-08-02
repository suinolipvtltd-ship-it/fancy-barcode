"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Mode = "signIn" | "signUp" | "forgotPassword";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const resetState = () => {
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signUp") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for a confirmation link.");
      } else if (mode === "forgotPassword") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (error) throw error;
        setMessage("Check your email for a password reset link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
  };

  const title =
    mode === "signUp"
      ? "Create Account"
      : mode === "forgotPassword"
        ? "Reset Password"
        : "Sign In";

  const buttonLabel = loading
    ? "Please wait…"
    : mode === "signUp"
      ? "Sign Up"
      : mode === "forgotPassword"
        ? "Send Reset Link"
        : "Sign In";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-bold text-gray-900">
          {title}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {mode !== "forgotPassword" && (
            <div>
              <label htmlFor="password" className="block text-sm text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-4 space-y-2 text-center text-sm text-gray-500">
          {/* Forgot password link — only in sign-in mode */}
          {mode === "signIn" && (
            <p>
              <button
                type="button"
                onClick={() => switchTo("forgotPassword")}
                className="text-blue-600 hover:underline"
              >
                Forgot password?
              </button>
            </p>
          )}

          {/* Back to sign in — in forgot-password and sign-up modes */}
          {mode !== "signIn" && (
            <p>
              <button
                type="button"
                onClick={() => switchTo("signIn")}
                className="text-blue-600 hover:underline"
              >
                Back to Sign In
              </button>
            </p>
          )}

          {/* Sign up / sign in toggle */}
          {mode !== "forgotPassword" && (
            <p>
              {mode === "signIn"
                ? "Don't have an account?"
                : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => switchTo(mode === "signIn" ? "signUp" : "signIn")}
                className="text-blue-600 hover:underline"
              >
                {mode === "signIn" ? "Sign Up" : "Sign In"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
