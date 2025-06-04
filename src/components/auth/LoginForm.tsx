"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginUserInputSchema, type LoginUserInput } from '@/models/User';
import { useAuth } from '@/hooks/useAuth';
import { loginUser } from '@/app/(auth)/login/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PackageSearch, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { login: setAuthContextUser } = useAuth(); // Renamed to avoid confusion with loginUser action

  const form = useForm<LoginUserInput>({
    resolver: zodResolver(LoginUserInputSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginUserInput) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const result = await loginUser(data);
      if (result.success && result.user) {
        setAuthContextUser(result.user); // Update AuthContext with user from backend
        // Router will handle redirect via AuthContext effect
      } else {
        setFormError(result.error || 'An unknown error occurred.');
        if (result.errors) {
           result.errors.forEach((err) => {
            form.setError(err.path[0] as keyof LoginUserInput, { message: err.message });
          });
        }
      }
    } catch (error) {
      setFormError('Failed to connect to the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="items-center text-center">
        <div className="mb-4 flex items-center justify-center">
            <PackageSearch className="h-12 w-12 text-primary" />
        </div>
        <CardTitle className="text-3xl font-bold">StockPilot</CardTitle>
        <CardDescription>登入以管理您的庫存</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>登入失敗</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>電子郵件</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      {...field}
                      className="focus:ring-accent"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密碼</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...field}
                        className="focus:ring-accent"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                      disabled={isLoading}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Role select is removed as role is determined by backend */}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "登入"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
