import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  Utensils,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { errorMessage } from "../lib/api";
import { useUiStore } from "../stores/uiStore";

export function LoginPage() {
  const restaurantName = useUiStore((state) => state.restaurantName);
  const login = useAuthStore((state) => state.login);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = `${restaurantName} · Restaurant operations`;
  }, [restaurantName]);
  if (user) return <Navigate to="/overview" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(
        (location.state as { from?: string } | null)?.from ?? "/overview",
        { replace: true },
      );
    } catch (e) {
      setError(
        errorMessage(
          e,
          "We could not sign you in. Check your email and password.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#2e4235] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14">
        <div className="absolute -right-28 top-10 h-[460px] w-[460px] rounded-full border border-white/10" />
        <div className="absolute -right-12 top-26 h-[360px] w-[360px] rounded-full border border-white/10" />
        <div className="absolute -bottom-48 -left-28 h-[500px] w-[500px] rounded-full bg-[#405b45]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-citrus text-olive">
            <Utensils size={20} />
          </span>
          <div>
            <p className="font-display text-sm font-extrabold tracking-tight">
              Table & Thyme
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.16em] text-white/50">
              Restaurant operations
            </p>
          </div>
        </div>
        <div className="relative z-10 max-w-lg pb-10">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-citrus">
            <Leaf size={19} />
          </div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[.2em] text-citrus">
            A better shift starts here
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-[-.055em] xl:text-[62px]">
            Good food.
            <br />
            Great flow.
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/65">
            One calm place to keep the kitchen moving, the tables turning, and
            the whole team in sync.
          </p>
          <div className="mt-9 flex items-center gap-3">
            <div className="flex -space-x-2">
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#2e4235] bg-[#d8a47d] text-[9px] font-bold text-white">
                AM
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#2e4235] bg-[#879b7e] text-[9px] font-bold text-white">
                JC
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#2e4235] bg-[#bf7e6b] text-[9px] font-bold text-white">
                TR
              </span>
            </div>
            <p className="text-xs text-white/60">
              Made for the people who make it happen.
            </p>
          </div>
        </div>
        <p className="relative z-10 text-[11px] text-white/35">
          © 2025 Table & Thyme · Built for hospitality
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-olive text-citrus">
              <Utensils size={18} />
            </span>
            <div>
              <p className="font-display text-sm font-extrabold">
                Table & Thyme
              </p>
              <p className="text-[10px] uppercase tracking-[.15em] text-muted">
                Restaurant operations
              </p>
            </div>
          </div>
          <div className="mb-8">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-olive">
              Welcome back
            </p>
            <h2 className="font-display text-[32px] font-bold tracking-[-.05em]">
              Let’s get to it.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Sign in to your restaurant workspace.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold">
                Work email
              </span>
              <span className="relative block">
                <Mail
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a0a69e]"
                />
                <input
                  className="focus-ring h-12 w-full rounded-xl border border-line bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-[#aeb2aa] focus:border-olive"
                  type="email"
                  autoComplete="email"
                  placeholder="you@restaurant.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold">Password</span>
              <span className="relative block">
                <LockKeyhole
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a0a69e]"
                />
                <input
                  className="focus-ring h-12 w-full rounded-xl border border-line bg-white pl-10 pr-12 text-sm outline-none transition placeholder:text-[#aeb2aa] focus:border-olive"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
              >
                {error}
              </div>
            )}
            <button
              disabled={loading}
              className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-olive px-5 text-sm font-bold text-white transition hover:bg-[#334438] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Signing you in…" : "Sign in"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-muted">
            Need access? Ask your restaurant administrator to set up your team
            account.
          </p>
          <div className="mt-12 flex items-center justify-center gap-2 text-[10px] font-medium text-[#a3a79e]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Secure
            team workspace <span className="mx-1">·</span> Made for service
          </div>
        </div>
      </section>
    </div>
  );
}
