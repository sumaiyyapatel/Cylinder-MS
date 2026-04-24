import { useState } from "react";
import { AlertCircle, ArrowRight, Lock, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const trustPoints = [
  "Fast bill and ECR entry for floor operators",
  "Live cylinder movement and overdue visibility",
  "Accounting and reports in one controlled workflow",
];

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[linear-gradient(135deg,#14263f_0%,#1e3a5f_45%,#0f172a_100%)] px-4 py-6 sm:px-6"
      data-testid="login-page"
    >
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/10 shadow-2xl backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.28),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.08),transparent_60%)]" />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-sm font-bold text-slate-950">
                  GC
                </div>
                <div>
                  <div className="title-font text-lg font-semibold">Patel & Company</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Cylinder Management System</div>
                </div>
              </div>
              <div className="mt-14 max-w-xl">
                <div className="page-eyebrow">Industrial operations</div>
                <h1 className="page-title text-white">Clear movement. Fast billing. Strong operator confidence.</h1>
                <p className="page-subtitle text-slate-200">
                  Built for gas distribution teams that need quick data entry, visible status, and zero ambiguity across billing, returns, and collections.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {trustPoints.map((point) => (
                <div key={point} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="text-sm leading-6 text-slate-200">{point}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white/92 px-5 py-8 backdrop-blur sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-sm font-bold text-slate-950">
                  GC
                </div>
                <div>
                  <div className="title-font text-base font-semibold text-slate-900">Patel & Company</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Cylinder Control</div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="page-eyebrow text-amber-700">Secure access</div>
              <h2 className="title-font mt-2 text-3xl font-bold text-slate-900">Sign in to continue</h2>
              <p className="mt-2 text-sm text-slate-500">
                Use your assigned operator credentials. The system locks accounts after repeated failed attempts.
              </p>
            </div>

            {error ? (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="login-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold text-slate-700">Username</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    name="username"
                    data-testid="login-username-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="pl-10"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    data-testid="login-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                data-testid="login-submit-button"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              Keep credentials private. This application controls issue, return, and payment records used for daily operations.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
