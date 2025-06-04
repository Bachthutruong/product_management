"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getDeletedOrders } from '@/app/(app)/orders/actions';
import type { Order, OrderStatus } from '@/models/Order';
import { AllOrderStatusOptions } from '@/models/Order';

import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, ShieldAlert, ShoppingCart, PackageSearch, Filter, X, CalendarIcon, ArrowLeft, ArrowRight, Eye, Package, Trash2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format, isValid } from 'date-fns';
import { formatToYYYYMMDDWithTime, formatToYYYYMMDD, formatForCalendarDisplay } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1]; // Default to 10

interface OrderFilters {
  searchTerm: string;
  status: OrderStatus | 'all';
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

function OrderDetailsDialog({ order }: { order: Order }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <Eye className="mr-1 h-3 w-3" />
          查看詳細資料
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details - {order.orderNumber}</DialogTitle>
          <DialogDescription>
            已刪除訂單資訊
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">訂單資訊</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">訂單號碼:</span>
                  <span className="font-medium">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">客戶:</span>
                  <span className="font-medium">{order.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">狀態:</span>
                  <Badge variant="outline">{order.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">訂單日期:</span>
                  <span>{formatToYYYYMMDDWithTime(order.orderDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">已刪除日期:</span>
                  <span className="text-red-600">{order.deletedAt ? formatToYYYYMMDDWithTime(order.deletedAt) : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">已刪除者:</span>
                  <span className="text-red-600">{order.deletedByName || 'N/A'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">訂單摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">小計:</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discountAmount && order.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>折扣:</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                )}
                {order.shippingFee && order.shippingFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">運費:</span>
                    <span>{formatCurrency(order.shippingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>總金額:</span>
                  <span>{formatCurrency(order.totalAmount)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">訂單項目</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>產品</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">數量</TableHead>
                      <TableHead className="text-right">單價</TableHead>
                      <TableHead className="text-right">總金額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{item.productSku || 'N/A'}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice * item.quantity)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader className="pb-3">
                  <CardTitle className="text-sm">備註</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DeletedOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [filters, setFilters] = useState<OrderFilters>({
    searchTerm: '',
    status: 'all',
    dateFrom: undefined,
    dateTo: undefined,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  const fetchOrders = useCallback(async () => {
    if (!user || user.role !== 'admin') return;

    setIsLoadingOrders(true);
    try {
      const result = await getDeletedOrders({
        searchTerm: filters.searchTerm || undefined,
        status: filters.status,
        dateFrom: filters.dateFrom ? formatToYYYYMMDD(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? formatToYYYYMMDD(filters.dateTo) : undefined,
        page: currentPage,
        limit: itemsPerPage,
        userRole: user.role,
      });
      setOrders(result.orders);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("Failed to fetch deleted orders:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入已刪除訂單。請稍後再試。",
      });
    } finally {
      setIsLoadingOrders(false);
    }
  }, [user, filters, currentPage, itemsPerPage, toast]);

  useEffect(() => {
    if (!authLoading && user && user.role === 'admin') {
      fetchOrders();
    }
  }, [user, authLoading, fetchOrders]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      // 目前，非管理員將看到訪問拒絕消息
    }
  }, [user, authLoading, router]);

  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setCurrentPage(1); // Reset to first page
    // fetchOrders will be called due to useEffect dependency on filters and currentPage
  };

  const handleClearFilters = () => {
    setFilters({
      searchTerm: '',
      status: 'all',
      dateFrom: undefined,
      dateTo: undefined,
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleItemsPerPageChange = (newSize: string) => {
    setItemsPerPage(parseInt(newSize));
    setCurrentPage(1); // Reset to first page when changing page size
  };

  if (authLoading || (isLoadingOrders && user?.role === 'admin')) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive">訪問被拒絕</h1>
        <p className="text-muted-foreground">您沒有權限查看已刪除訂單。</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-6">前往儀表板</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <Trash2 className="mr-3 h-8 w-8 text-destructive" /> 已刪除訂單
        </h1>
        <Button onClick={() => router.push('/orders')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回訂單
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="mr-2 h-5 w-5" />
            過濾器
          </CardTitle>
          <CardDescription>
            搜尋和過濾已刪除訂單。總已刪除訂單數量: {totalCount}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜尋訂單..."
                className="pl-8"
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              />
            </div>

            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as OrderStatus | 'all' }))}>
              <SelectTrigger>
                <SelectValue placeholder="所有狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有狀態</SelectItem>
                {AllOrderStatusOptions.map(status => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !filters.dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateFrom ? formatForCalendarDisplay(filters.dateFrom) : "從日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DatePickerCalendar
                  selected={filters.dateFrom}
                  onSelect={(date) => setFilters(prev => ({ ...prev, dateFrom: date }))}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !filters.dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateTo ? formatForCalendarDisplay(filters.dateTo) : "至日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DatePickerCalendar
                  selected={filters.dateTo}
                  onSelect={(date) => setFilters(prev => ({ ...prev, dateTo: date }))}
                />
              </PopoverContent>
            </Popover>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">套用</Button>
              <Button type="button" variant="outline" onClick={handleClearFilters}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <PackageSearch className="mr-2 h-5 w-5" />
              已刪除訂單
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">顯示:</span>
              <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEMS_PER_PAGE_OPTIONS.map(size => (
                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
          <CardDescription>
            顯示 {orders.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} 至 {Math.min(currentPage * itemsPerPage, totalCount)} 的已刪除訂單，總已刪除訂單數量: {totalCount}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOrders ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">找不到已刪除訂單</p>
              <p className="text-sm">嘗試調整您的搜尋過濾器</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單號碼</TableHead>
                      <TableHead>客戶</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>訂單日期</TableHead>
                      <TableHead>已刪除日期</TableHead>
                      <TableHead>已刪除者</TableHead>
                      <TableHead className="text-right">總金額</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order._id}>
                        <TableCell className="font-medium text-primary">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatToYYYYMMDDWithTime(order.orderDate)}
                        </TableCell>
                        <TableCell className="text-red-600 text-sm">
                          {order.deletedAt ? formatToYYYYMMDDWithTime(order.deletedAt) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-red-600 text-sm">
                          {order.deletedByName || 'N/A'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(order.totalAmount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <OrderDetailsDialog order={order} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    第 {currentPage} 頁，共 {totalPages} 頁
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      上一頁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      下一頁
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 