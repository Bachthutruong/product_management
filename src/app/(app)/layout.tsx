"use client";

import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarNavigation } from '@/components/layout/SidebarNavigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <SidebarNavigation />
        <main className="flex-1 flex flex-col bg-background w-full">
          {/* Placeholder for a potential top header bar */}
          {/* <header className="h-16 border-b flex items-center px-6 sticky top-0 bg-background/95 backdrop-blur z-10">
            Page Title or User Menu
          </header> */}
          <div className="flex-1 p-4 overflow-auto w-full max-w-none">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
