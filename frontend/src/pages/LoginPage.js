import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Lock, User } from "lucide-react";

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
      const msg = err.response?.data?.error || "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white font-bold">
                GC
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>
                  Gas Cylinder Mgmt
                </h1>
                <p className="text-xs text-slate-500">Management System</p>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-heading)' }}>
              Sign in
            </h2>
            <p className="text-sm text-slate-500 mt-1">Enter your credentials to continue</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200" data-testid="login-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-sm font-medium text-slate-700">Username</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  id="username"
                  data-testid="login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-9 h-10"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  data-testid="login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-9 h-10"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              data-testid="login-submit-button"
              className="w-full h-10 bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 text-xs text-slate-400 text-center">
            Max 3 failed attempts will lock the account for 15 minutes.
          </div>
        </div>
      </div>

      {/* Right Panel - Image */}
      <div className="hidden lg:flex flex-1 bg-slate-900 items-center justify-center relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1705956561319-2882c83ef8bb?auto=format&fit=crop&w=1600&q=80"
          alt="Industrial facility"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="relative z-10 text-center px-12">
          <h2 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            Industrial Gas Distribution
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Complete cylinder tracking, billing, ECR management, and accounting in one unified system.
          </p>
        </div>
      </div>
    </div>
  );
}
