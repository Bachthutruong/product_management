"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link"; 
import { useRouter } from "next/navigation"; 
import { useAuth } from "@/hooks/useAuth";
import { getCustomers, deleteCustomer } from "@/app/(app)/customers/actions";
import { getCustomerCategories } from "@/app/(app)/customer-categories/actions";
import type { Customer } from "@/models/Customer";
import type { CustomerCategory } from "@/models/CustomerCategory";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { ImportCustomersDialog } from "@/components/customers/ImportCustomersDialog";
import { Loader2, Search, Trash2, UserPlus, UserX, Edit3, ListOrdered, Filter, FolderTree, ArrowLeft, ArrowRight, X } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { formatToYYYYMMDD } from '@/lib/date-utils';
import { Label } from "@/components/ui/label";

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[0]; // Default to 10

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
        <Button variant="ghost" size="icon" className="text-destructive hover:text-white hover:bg-[#c3223d]" disabled={isDeleting}>
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
  const [customerCategories, setCustomerCategories] = useState<CustomerCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);
  
  // Filter Inputs
  const [searchTermInput, setSearchTermInput] = useState('');
  const [categoryIdInput, setCategoryIdInput] = useState<string>('all');

  // Applied Filters for API call
  const [appliedFilters, setAppliedFilters] = useState({
    searchTerm: '',
    categoryId: 'all',
  });

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditDialogVisible, setIsEditDialogVisible] = useState(false);


  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getCustomers({
        page: currentPage,
        limit: itemsPerPage,
        searchTerm: appliedFilters.searchTerm,
        categoryId: appliedFilters.categoryId,
      });
      setCustomers(result.customers);
      setTotalCustomers(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入客戶資料。請稍後再試。",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, currentPage, itemsPerPage, appliedFilters]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    async function fetchCustomerCategories() {
      setIsLoadingCategories(true);
      try {
        const categories = await getCustomerCategories();
        setCustomerCategories(categories.filter(cat => cat.isActive));
      } catch (error) {
        console.error("Failed to fetch customer categories:", error);
        toast({
          variant: "destructive",
          title: "載入錯誤",
          description: "無法載入客戶分類。請稍後再試。",
        });
      } finally {
        setIsLoadingCategories(false);
      }
    }
    fetchCustomerCategories();
  }, [toast]);
  
  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      searchTerm: searchTermInput,
      categoryId: categoryIdInput,
    });
    setCurrentPage(1);
  };
  
  const handleClearFilters = () => {
    setSearchTermInput('');
    setCategoryIdInput('all');
    setAppliedFilters({
      searchTerm: '',
      categoryId: 'all',
    });
    setCurrentPage(1);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditDialogVisible(true);
  };

  const handleCustomerUpdated = () => {
    fetchCustomers(); 
    setIsEditDialogVisible(false);
    setEditingCustomer(null);
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
    }
  };

  const handleItemsPerPageChange = (newSize: string) => {
    setItemsPerPage(parseInt(newSize, 10));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <UserPlus className="mr-3 h-8 w-8 text-primary" /> 客戶管理
        </h1>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {user?.role === 'admin' && <ImportCustomersDialog onCustomersImported={() => fetchCustomers()} />}
          <AddCustomerDialog onCustomerAdded={() => fetchCustomers()} />
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>客戶目錄</CardTitle>
          <CardDescription>
            查看和管理您的客戶資訊。
            {isLoading && totalCustomers === 0 ? " 載入中..." : ` 共找到 ${totalCustomers} 位客戶。`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters Form */}
          <form onSubmit={handleApplyFilters} className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div>
                  <Label htmlFor="searchTerm" className="block text-sm font-medium text-muted-foreground mb-1">搜尋</Label>
                  <Input 
                    id="searchTerm"
                    type="search" 
                    placeholder="姓名、電子郵件、電話..." 
                    value={searchTermInput}
                    onChange={(e) => setSearchTermInput(e.target.value)}
                  />
              </div>
              <div className="min-w-[200px]">
                  <Label htmlFor="categoryFilter" className="block text-sm font-medium text-muted-foreground mb-1">分類</Label>
                  <Select
                    value={categoryIdInput}
                    onValueChange={setCategoryIdInput}
                    disabled={isLoadingCategories}
                  >
                    <SelectTrigger id="categoryFilter">
                      <SelectValue placeholder={isLoadingCategories ? "載入中..." : "選擇分類"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有分類</SelectItem>
                      {customerCategories
                        .filter(category => category._id && category._id.trim() !== '') 
                        .map((category) => (
                        <SelectItem key={category._id} value={category._id!}>
                          {category.name} ({category.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                  <Search className="mr-2 h-4 w-4" /> 應用搜尋 & 過濾
                </Button>
                <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
                  <X className="mr-2 h-4 w-4" /> 清除所有
                </Button>
              </div>
            </div>
          </form>
          
          {isLoading && customers.length === 0 ? (
            <div className="space-y-3">
              {/* Skeleton table */}
              <div className="animate-pulse">
                <div className="grid grid-cols-8 gap-4 py-2 border-b">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-4 bg-gray-200 rounded"></div>)}
                </div>
                {[...Array(itemsPerPage)].map((_, i) => (
                  <div key={i} className="grid grid-cols-8 gap-4 py-3">
                    {Array.from({ length: 8 }).map((_, j) => <div key={j} className="h-4 bg-gray-200 rounded"></div>)}
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <UserX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">沒有找到客戶</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || (appliedFilters.categoryId !== 'all') 
                  ? "沒有客戶符合您的搜尋或篩選條件。" 
                  : "目前沒有客戶。添加一個開始。"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>客戶編號</TableHead>
                      <TableHead>分類</TableHead>
                      <TableHead>電子郵件</TableHead>
                      <TableHead>電話</TableHead>
                      <TableHead>地址</TableHead>
                      <TableHead>備註</TableHead>
                      <TableHead>加入日期</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((cust) => (
                      <TableRow key={cust._id}>
                        <TableCell 
                          className="font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors" 
                          onClick={() => router.push(`/customers/${cust._id}/orders`)}
                          title={`查看 ${cust.name} 的訂單`}
                        >
                          {cust.name}
                        </TableCell>
                        <TableCell>{(cust as any).customerCode || 'N/A'}</TableCell>
                        <TableCell>
                          {cust.categoryName ? (
                            <Badge variant="outline" className="text-xs">
                              {cust.categoryName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">未分類</span>
                          )}
                        </TableCell>
                        <TableCell>{cust.email || 'N/A'}</TableCell>
                        <TableCell>{cust.phone || 'N/A'}</TableCell>
                        <TableCell className="max-w-xs truncate">{cust.address || 'N/A'}</TableCell>
                        <TableCell className="max-w-xs truncate">{(cust as any).notes || 'N/A'}</TableCell>
                        <TableCell>{cust.createdAt ? formatToYYYYMMDD(cust.createdAt) : 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center space-x-1">
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-muted-foreground hover:text-white hover:bg-[#c3223d]" 
                                  onClick={() => handleEditCustomer(cust)}
                                  title={`編輯 ${cust.name}`}
                                  >
                                  <Edit3 className="h-4 w-4" />
                                  <span className="sr-only">編輯 ${cust.name}</span>
                              </Button>
                              {user?.role === 'admin' && (
                                  <DeleteCustomerButton customerId={cust._id} customerName={cust.name} onCustomerDeleted={() => fetchCustomers()} />
                              )}
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-muted-foreground hover:text-white hover:bg-[#c3223d]" 
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">每頁顯示:</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={handleItemsPerPageChange}
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue placeholder={itemsPerPage} />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEMS_PER_PAGE_OPTIONS.map(size => (
                          <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    第 {currentPage} 頁，共 {totalPages} 頁
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> 上一頁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      下一頁 <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
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
