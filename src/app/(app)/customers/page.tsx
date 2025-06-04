"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link"; 
import { useRouter } from "next/navigation"; 
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, deleteCustomer } from "@/app/(app)/customers/actions";
import type { Customer } from "@/models/Customer";

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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { EditCustomerDialog } from "@/components/customers/EditCustomerDialog";
import { Loader2, Search, Trash2, UserPlus, UserX, Edit3, ListOrdered } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { formatToYYYYMMDD } from '@/lib/date-utils';

function DeleteCustomerButton({ customerId, customerName, onCustomerDeleted }: { customerId: string, customerName: string, onCustomerDeleted: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const handleDelete = async () => {
    if (user?.role !== 'admin') {
        toast({ variant: "destructive", title: "權限不足", description: "只有管理員可以刪除客戶。" });
        setIsAlertOpen(false);
        return;
    }
    setIsDeleting(true);
    const result = await deleteCustomer(customerId, user.role);
    if (result.success) {
      toast({
        title: "客戶已刪除",
        description: `${customerName} 已成功刪除。`,
      });
      onCustomerDeleted();
    } else {
      toast({
        variant: "destructive",
        title: "刪除客戶錯誤",
        description: result.error || "發生意外錯誤。",
      });
    }
    setIsDeleting(false);
    setIsAlertOpen(false);
  };
  
  if (user?.role !== 'admin') return null;

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">刪除 {customerName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確定要刪除 "{customerName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            此操作無法撤銷。這將永久刪除客戶。考慮他們是否有過去的訂單。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsAlertOpen(false)} disabled={isDeleting}>取消</AlertDialogCancel>
          <Button onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            刪除客戶
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


export default function CustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter(); 

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditDialogVisible, setIsEditDialogVisible] = useState(false);


  const fetchCustomers = useCallback(async (term?: string) => {
    setIsLoadingCustomers(true);
    try {
      const fetchedCustomers = await getCustomers(term);
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入客戶資料。請稍後再試。",
      });
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading) { 
      fetchCustomers(searchTerm);
    }
  }, [user, authLoading, fetchCustomers, searchTerm]);

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditDialogVisible(true);
  };

  const handleCustomerUpdated = () => {
    fetchCustomers(searchTerm); 
    setIsEditDialogVisible(false);
    setEditingCustomer(null);
  };


  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  const filteredCustomers = customers; 

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <UserPlus className="mr-3 h-8 w-8 text-primary" /> 客戶管理
        </h1>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <form onSubmit={(e) => { e.preventDefault(); fetchCustomers(searchTerm); }} className="relative flex-grow md:flex-grow-0 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="搜尋姓名、電子郵件、電話..." 
              className="pl-8 w-full" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </form>
          {/* Add Customer button is available to all logged-in users */}
          <AddCustomerDialog onCustomerAdded={() => fetchCustomers(searchTerm)} />
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>客戶目錄</CardTitle>
          <CardDescription>查看和管理您的客戶資訊。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingCustomers && customers.length === 0 ? (
             <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <UserX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">沒有找到客戶</h3>
              <p className="text-muted-foreground">
                {searchTerm ? "沒有客戶符合您的搜尋。" : "目前沒有客戶。添加一個開始。"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>電子郵件</TableHead>
                    <TableHead>電話</TableHead>
                    <TableHead>地址</TableHead>
                    <TableHead>加入日期</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((cust) => (
                    <TableRow key={cust._id}>
                      <TableCell className="font-medium">{cust.name}</TableCell>
                      <TableCell>{cust.email || 'N/A'}</TableCell>
                      <TableCell>{cust.phone || 'N/A'}</TableCell>
                      <TableCell className="max-w-xs truncate">{cust.address || 'N/A'}</TableCell>
                      <TableCell>{cust.createdAt ? formatToYYYYMMDD(cust.createdAt) : 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center space-x-1">
                            {/* Edit button is now available to all logged-in users */}
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-muted-foreground hover:text-primary" 
                                onClick={() => handleEditCustomer(cust)}
                                title={`編輯 ${cust.name}`}
                                >
                                <Edit3 className="h-4 w-4" />
                                <span className="sr-only">編輯 ${cust.name}</span>
                            </Button>
                            {/* Delete button remains admin-only */}
                            {user?.role === 'admin' && (
                                <DeleteCustomerButton customerId={cust._id} customerName={cust.name} onCustomerDeleted={() => fetchCustomers(searchTerm)} />
                            )}
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-muted-foreground hover:text-primary" 
                                onClick={() => router.push(`/customers/${cust._id}/orders`)} 
                                title={`查看 ${cust.name} 的訂單`}
                                >
                                <ListOrdered className="h-4 w-4" />
                                <span className="sr-only">查看 ${cust.name} 的訂單</span>
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {editingCustomer && isEditDialogVisible && (
        <EditCustomerDialog
          customer={editingCustomer}
          isOpen={isEditDialogVisible}
          onOpenChange={setIsEditDialogVisible}
          onCustomerUpdated={handleCustomerUpdated}
        />
      )}
    </div>
  );
}
