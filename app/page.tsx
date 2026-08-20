"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { useAuth, translateFirebaseError } from "@/lib/auth-context";

function InputField({
  icon: Icon,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  icon: LucideIcon;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="flex w-full items-center gap-3 rounded-xl bg-pink-300 px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-purple-900" />
      <input
        type={isPassword && show ? "text" : type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm font-medium text-purple-900 outline-none placeholder:text-purple-900/60"
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-purple-900/70 transition-colors hover:text-purple-900"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1a11 11 0 0 0-9.82 6.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

export default function Home() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const { login, loginGoogle, register, user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setAuthLoading(true);
    try {
      if (isSignUp) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      router.push("/chat");
    } catch (err) {
      setError(translateFirebaseError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setAuthLoading(true);
    try {
      await loginGoogle();
      router.push("/chat");
    } catch (err) {
      setError(translateFirebaseError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 p-4">
      <div className="relative h-[640px] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="absolute left-6 top-6 z-20">
          <Image
            src="/logo_dark.png"
            alt="Legal Verse logo"
            width={120}
            height={80}
            className="h-12 w-auto"
            style={{ width: "auto", height: "3rem" }}
            priority
          />
        </div>

        <div
          className={`absolute inset-y-0 left-0 flex w-1/2 flex-col items-center justify-center gap-5 px-12 transition-transform duration-500 ease-in-out ${
            isSignUp ? "translate-x-[-100%]" : "translate-x-0"
          }`}
        >
          <h1 className="text-4xl font-bold text-zinc-900">Welcome back</h1>
          <p className="text-sm text-zinc-500">
            Enter your details to sign in to your account
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4"
          >
            {error && !isSignUp && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-zinc-700">
                Email Address
              </label>
              <InputField
                icon={Mail}
                placeholder="Enter your email"
                type="email"
                value={email}
                onChange={setEmail}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-zinc-700">
                Password
              </label>
              <InputField
                icon={Lock}
                placeholder="Enter your password"
                type="password"
                value={password}
                onChange={setPassword}
              />
            </div>

            <a
              href="#"
              className="self-end text-xs font-semibold text-purple-700 hover:underline"
            >
              Forgot password?
            </a>

            <button
              type="submit"
              disabled={authLoading}
              className="mt-2 rounded-xl bg-purple-700 py-3 font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading && !isSignUp ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-2 flex w-full max-w-sm flex-col items-center gap-4">
            <div className="flex w-full items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200" />
              or sign in with
              <span className="h-px flex-1 bg-zinc-200" />
            </div>
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogle}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              {authLoading ? "Signing in..." : "Sign in with Google"}
            </button>
          </div>
        </div>

        <div
          className={`absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center gap-5 px-12 transition-transform duration-500 ease-in-out ${
            isSignUp ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <h1 className="text-4xl font-bold text-zinc-900">
            Create your account
          </h1>
          <p className="text-sm text-zinc-500">
            Fill in the details below to get started
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4"
          >
            {error && isSignUp && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-zinc-700">
                Full Name
              </label>
              <InputField
                icon={User}
                placeholder="Enter your full name"
                value={name}
                onChange={setName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-zinc-700">
                Email Address
              </label>
              <InputField
                icon={Mail}
                placeholder="Enter your email"
                type="email"
                value={email}
                onChange={setEmail}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-zinc-700">
                Password
              </label>
              <InputField
                icon={Lock}
                placeholder="Enter your password"
                type="password"
                value={password}
                onChange={setPassword}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="mt-2 rounded-xl bg-purple-700 py-3 font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading && isSignUp ? "Creating..." : "Create account"}
            </button>
          </form>
        </div>

        <div
          className={`absolute inset-y-0 left-0 z-10 flex w-1/2 flex-col items-center justify-center gap-6 bg-[#2A0A38] px-12 text-center text-white transition-transform duration-500 ease-in-out ${
            isSignUp ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {isSignUp ? (
            <>
              <h2 className="text-3xl font-bold">Already have account?</h2>
              <p className="text-sm text-white/70">
                Masuk untuk mengakses fitur analisis putusan pengadilan
              </p>
              <button
                onClick={() => setIsSignUp(false)}
                disabled={authLoading}
                className="mt-2 rounded-xl bg-purple-700 px-8 py-3 font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold">New here?</h2>
              <p className="text-sm text-white/70">
                Buat akun sekarang dan temukan insight hukum lebih cepat dengan
                bantuan AI
              </p>
              <button
                onClick={() => setIsSignUp(true)}
                disabled={authLoading}
                className="mt-2 rounded-xl bg-purple-700 px-8 py-3 font-bold text-white transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}