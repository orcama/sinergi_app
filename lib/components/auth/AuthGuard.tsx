"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const {
    user,
    loading,
    verified,
    verificationLoaded,
    logout,
    refreshVerificationStatus,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || !user || !verificationLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F5F7]">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 animate-bounce rounded-full bg-pink-400 [animation-delay:0ms]" />
          <span className="h-3 w-3 animate-bounce rounded-full bg-pink-400 [animation-delay:150ms]" />
          <span className="h-3 w-3 animate-bounce rounded-full bg-pink-400 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (verified !== true) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F5F7] px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
            <ShieldCheck className="h-7 w-7 text-purple-600" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Akun Menunggu Verifikasi</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Admin belum menyetujui akun Anda. Silakan hubungi admin untuk
            persetujuan, lalu muat ulang status di bawah ini.
          </p>
          <button
            type="button"
            onClick={() => void refreshVerificationStatus()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6B2BD6]"
          >
            <RefreshCw className="h-4 w-4" />
            Muat Ulang Status
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}