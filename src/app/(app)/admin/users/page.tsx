
"use client"; // This page will likely have client-side interactions

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { PlusCircle, Search, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function UserManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'admin') {
      router.replace('/dashboard'); // Or an unauthorized page
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-6">Go to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">User Management</h1>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search users..." className="pl-8 w-full" />
          </div>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
            <PlusCircle className="mr-2 h-5 w-5" /> Add Employee
          </Button>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Employee Accounts</CardTitle>
          <CardDescription>Manage employee login accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Employee user table will be displayed here...</p>
          {/* Placeholder for user list/table */}
          <div className="mt-4 p-4 border rounded-md bg-muted/50">
            This is where employee data (Name, Email, Role, Status) will appear.
            <ul>
              <li>- Actions: Edit User, Delete User, Reset Password.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
