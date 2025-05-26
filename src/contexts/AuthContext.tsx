
"use client";

import type { ReactNode } from 'react';
import { createContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { AuthUser } from '@/models/User'; // Updated to use AuthUser

interface AuthContextType {
  user: AuthUser | null;
  login: (userData: AuthUser) => void; // Now takes AuthUser object
  logout: () => void;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('stockpilot-user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('stockpilot-user');
    }
    setLoading(false);
  }, []);

  // This login function is now just for setting the client-side context
  // after successful authentication via server action.
  const login = useCallback((userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem('stockpilot-user', JSON.stringify(userData));
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('stockpilot-user');
    router.push('/login'); // Path will resolve to (auth)/login
  }, [router]);

  useEffect(() => {
    // Check if current path is part of the auth group or general app
    const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/register'); // Add other auth paths if needed

    if (!loading && !user && !isAuthPath) {
      router.push('/login'); // Path will resolve to (auth)/login
    }
    if (!loading && user && isAuthPath) {
      router.push('/dashboard');
    }
  }, [user, loading, pathname, router]);


  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
