'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import AppSidebar from '@/components/AppSidebar';
import { Loader2 } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isAuthPage = pathname.startsWith('/auth');

  useEffect(() => {
    if (!isSupabaseConfigured || loading) return;

    if (!user && !isAuthPage) {
      router.replace('/auth/login');
    }
    if (user && isAuthPage) {
      router.replace('/');
    }
  }, [user, loading, isAuthPage, router]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (isSupabaseConfigured && (loading || !user)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-gray-900 text-white rounded-xl flex items-center justify-center font-bold text-2xl">
            P
          </div>
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#FAFAFA]">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
