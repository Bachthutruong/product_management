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
          View Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details - {order.orderNumber}</DialogTitle>
          <DialogDescription>
            Deleted Order Information
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-medium">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{order.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline">{order.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Date:</span>
                  <span>{formatToYYYYMMDDWithTime(order.orderDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deleted Date:</span>
                  <span className="text-red-600">{order.deletedAt ? formatToYYYYMMDDWithTime(order.deletedAt) : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deleted By:</span>
                  <span className="text-red-600">{order.deletedByName || 'N/A'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discountAmount && order.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                )}
                {order.shippingFee && order.shippingFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping:</span>
                    <span>{formatCurrency(order.shippingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(order.totalAmount)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
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
                <CardTitle className="text-sm">Notes</CardTitle>
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
        title: "Loading Error",
        description: "Could not load deleted orders. Please try again later.",
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
      // For now, non-admins will see an access denied message
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
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view deleted orders.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-6">Go to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <Trash2 className="mr-3 h-8 w-8 text-destructive" /> Deleted Orders
        </h1>
        <Button onClick={() => router.push('/orders')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="mr-2 h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Search and filter deleted orders. Total deleted orders: {totalCount}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search orders..."
                className="pl-8"
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              />
            </div>

            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as OrderStatus | 'all' }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
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
                  {filters.dateFrom ? formatForCalendarDisplay(filters.dateFrom) : "From Date"}
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
                  {filters.dateTo ? formatForCalendarDisplay(filters.dateTo) : "To Date"}
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
              <Button type="submit" className="flex-1">Apply</Button>
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
              Deleted Orders
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
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
            Showing {orders.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} deleted orders
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
              <p className="text-lg">No deleted orders found</p>
              <p className="text-sm">Try adjusting your search filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Deleted Date</TableHead>
                      <TableHead>Deleted By</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
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
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
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