"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || !user) {
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

  return <>{children}</>;
}