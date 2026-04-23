'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Library, Wand2, Sparkles, Settings, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/', icon: Library, label: 'Prompt 仓库' },
  { href: '/insight', icon: Sparkles, label: 'Insight 规律' },
  { href: '/composer', icon: Wand2, label: 'Prompt 合成器' },
  { href: '/settings', icon: Settings, label: '设置' },
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'ME';
  const initials = displayName.slice(0, 2).toUpperCase();
  const email = user?.email ?? '';

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowResetConfirm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/auth/login');
  }, [signOut, router]);

  const handleResetPassword = useCallback(async () => {
    if (!isSupabaseConfigured || !email) return;
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setResetSent(true);
    setTimeout(() => {
      setResetSent(false);
      setShowResetConfirm(false);
    }, 3000);
  }, [email]);

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 shrink-0 z-30">
      <Link
        href="/"
        className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center font-bold text-xl mb-8 shadow-sm hover:bg-gray-800 transition-colors"
      >
        P
      </Link>

      <nav className="flex flex-col gap-2 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative group flex justify-center"
            >
              <div
                className={`p-3 rounded-xl transition-colors ${
                  active
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                <Icon size={22} strokeWidth={2} />
              </div>
              <div className="absolute left-full ml-3 px-2.5 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap pointer-events-none z-50 shadow-lg">
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Avatar + Profile Menu */}
      <div className="mt-auto mb-4 relative" ref={menuRef}>
        <button
          onClick={() => { setShowMenu((v) => !v); setShowResetConfirm(false); }}
          className="w-9 h-9 bg-gradient-to-tr from-blue-100 to-indigo-100 rounded-full border-2 border-white shadow-sm cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all flex items-center justify-center text-blue-700 font-semibold text-sm"
        >
          {initials}
        </button>

        {showMenu && (
          <div className="absolute bottom-0 left-full ml-3 w-56 bg-white border border-gray-200 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.1)] py-1 z-50 modal-enter">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              {email && <p className="text-xs text-gray-400 truncate mt-0.5">{email}</p>}
            </div>

            {/* Menu Items */}
            <div className="py-1">
              {isSupabaseConfigured && email && (
                <>
                  {showResetConfirm ? (
                    <div className="px-4 py-2.5">
                      {resetSent ? (
                        <p className="text-xs text-green-600 font-medium">重置邮件已发送，请查收邮箱</p>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-2">将向 {email} 发送密码重置邮件</p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleResetPassword}
                              className="flex-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                            >
                              确认发送
                            </button>
                            <button
                              onClick={() => setShowResetConfirm(false)}
                              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-2.5"
                    >
                      <KeyRound size={15} className="text-gray-400" /> 重置密码
                    </button>
                  )}
                </>
              )}
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2.5"
              >
                <LogOut size={15} /> 退出登录
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
