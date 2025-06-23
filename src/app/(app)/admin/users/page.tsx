
"use client"; 

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getUsers, deleteUser } from "@/app/(app)/admin/users/actions";
import type { AuthUser } from "@/models/User"; // Changed from User to AuthUser

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger, // Added AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { AddUserDialog } from "@/components/admin/AddUserDialog";
import { Loader2, Search, ShieldAlert, Trash2, UserX, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

function DeleteUserButton({ userId, userName, onUserDeleted }: { userId: string, userName: string, onUserDeleted: () => void }) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);


  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteUser(userId);
    if (result.success) {
      toast({
        title: "用戶已刪除",
        description: `${userName} 已成功刪除。`,
      });
      onUserDeleted();
    } else {
      toast({
        variant: "destructive",
        title: "刪除用戶錯誤",
        description: result.error || "發生意外錯誤。",
      });
    }
    setIsDeleting(false);
    setIsAlertOpen(false); // Close dialog after action
  };

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting}>
          {isDeleting && isAlertOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">刪除 {userName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>您確定要刪除 "{userName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            此操作無法撤銷。此操作將永久刪除用戶帳戶。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsAlertOpen(false)} disabled={isDeleting}>取消</AlertDialogCancel>
          <Button onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            刪除用戶
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function UserManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<AuthUser[]>([]); // Changed from User to AuthUser
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入用戶數據。請稍後再試。",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && user && user.role === 'admin') {
      fetchUsers();
    }
  }, [user, authLoading, fetchUsers]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
       // router.replace('/dashboard'); // Redirect non-admins to dashboard
       // For now, non-admins will see an access denied message instead of immediate redirect from this page
    }
  }, [user, authLoading, router]);

  // Remove the blocking full-page loader

  if (!user || user.role !== 'admin') { // Ensure user object exists before checking role
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive">訪問被拒絕</h1>
        <p className="text-muted-foreground">您沒有權限查看此頁面。</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-6">前往儀表板</Button>
      </div>
    );
  }
  
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <Users className="mr-3 h-8 w-8 text-primary" /> 用戶管理
        </h1>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="搜尋用戶..." 
              className="pl-8 w-full" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <AddUserDialog onUserAdded={fetchUsers} />
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>員工帳戶</CardTitle>
          <CardDescription>管理員工登錄帳戶。編輯功能將很快添加。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingUsers && users.length === 0 ? (
            <div className="space-y-3">
              {/* Skeleton table */}
              <div className="animate-pulse">
                <div className="grid grid-cols-5 gap-4 py-2 border-b">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="grid grid-cols-5 gap-4 py-3">
                    {[1, 2, 3, 4, 5].map(j => (
                      <div key={j} className="h-4 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <UserX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">找不到用戶</h3>
              <p className="text-muted-foreground">
                {searchTerm ? "找不到符合您搜尋的用戶。" : "目前沒有任何用戶。添加一個以開始。"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>電子郵件</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>加入</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((usr) => (
                    <TableRow key={usr._id}>
                      <TableCell className="font-medium">{usr.name}</TableCell>
                      <TableCell>{usr.email}</TableCell>
                      <TableCell>
                        <Badge variant={usr.role === 'admin' ? 'destructive' : 'secondary'}>
                            {usr.role.charAt(0).toUpperCase() + usr.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{usr.createdAt ? new Date(usr.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {/* 防止管理員通過此UI刪除自己的帳戶以確保安全 */}
                        {user._id !== usr._id && ( // Check if user object is not null before accessing _id
                           <DeleteUserButton userId={usr._id} userName={usr.name} onUserDeleted={fetchUsers} />
                        )}
                         {/* 編輯按鈕可以稍後添加 */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
