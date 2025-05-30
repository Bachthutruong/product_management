
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getOrders, deleteOrder, updateOrderStatus } from '@/app/(app)/orders/actions'; 
import type { Order, OrderStatus } from '@/models/Order';
import { OrderStatusSchema } from '@/models/Order'; // Import for status options
import { CreateOrderForm } from '@/components/orders/CreateOrderForm';

import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogNativeHeader, 
  DialogTitle as DialogNativeTitle, 
  DialogDescription as DialogNativeDescription, 
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, PlusCircle, ShoppingCart, PackageSearch, Edit3, Trash2, Printer, CheckCircle, Truck, ThumbsUp, Filter, X, CalendarIcon, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

interface OrderStatusActionButtonProps {
  order: Order;
  onStatusUpdated: () => void;
}

function OrderStatusActionButton({ order, onStatusUpdated }: OrderStatusActionButtonProps) {
  const { toast } = useToast();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<OrderStatus | null>(null);

  const openConfirmationDialog = (newStatus: OrderStatus) => {
    setTargetStatus(newStatus);
    setIsAlertOpen(true);
  };

  const handleConfirmUpdateStatus = async () => {
    if (!targetStatus) return;
    setIsUpdatingStatus(true);
    const result = await updateOrderStatus(order._id, targetStatus);
    if (result.success) {
      toast({
        title: "Order Status Updated",
        description: `Order ${order.orderNumber} status changed to ${targetStatus}.`,
      });
      onStatusUpdated();
    } else {
      toast({
        variant: "destructive",
        title: "Error Updating Status",
        description: result.error || "An unexpected error occurred.",
      });
    }
    setIsUpdatingStatus(false);
    setIsAlertOpen(false);
    setTargetStatus(null);
  };

  let actionButton = null;
  let dialogTitle = "";
  let dialogDescription = "";

  if (order.status === 'pending' || order.status === 'processing') {
    actionButton = (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => openConfirmationDialog('shipped')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-blue-500 hover:bg-blue-600 text-white"
      >
        {isUpdatingStatus && targetStatus === 'shipped' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Truck className="mr-1 h-3 w-3" />}
        Mark as Shipped
      </Button>
    );
    dialogTitle = `Mark Order ${order.orderNumber} as Shipped?`;
    dialogDescription = "This will change the order status to 'Shipped'. Are you sure?";
  } else if (order.status === 'shipped') {
    actionButton = (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => openConfirmationDialog('delivered')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-green-500 hover:bg-green-600 text-white"
      >
        {isUpdatingStatus && targetStatus === 'delivered' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
        Mark as Delivered
      </Button>
    );
    dialogTitle = `Mark Order ${order.orderNumber} as Delivered?`;
    dialogDescription = "This will change the order status to 'Delivered'. Are you sure?";
  } else if (order.status === 'delivered') {
    actionButton = (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => openConfirmationDialog('completed')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-teal-500 hover:bg-teal-600 text-white"
      >
        {isUpdatingStatus && targetStatus === 'completed' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ThumbsUp className="mr-1 h-3 w-3" />}
        Mark as Completed
      </Button>
    );
    dialogTitle = `Mark Order ${order.orderNumber} as Completed?`;
    dialogDescription = "This will finalize the order status to 'Completed'. Are you sure?";
  }

  if (!actionButton) return null;

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        {actionButton}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setIsAlertOpen(false); setTargetStatus(null); }} disabled={isUpdatingStatus}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirmUpdateStatus} 
            disabled={isUpdatingStatus}
            className={
                targetStatus === 'shipped' ? 'bg-blue-500 hover:bg-blue-600' :
                targetStatus === 'delivered' ? 'bg-green-500 hover:bg-green-600' :
                targetStatus === 'completed' ? 'bg-teal-500 hover:bg-teal-600' : ''
            }
          >
            {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 
             (targetStatus === 'shipped' ? <Truck className="mr-2 h-4 w-4" /> :
              targetStatus === 'delivered' ? <CheckCircle className="mr-2 h-4 w-4" /> :
              targetStatus === 'completed' ? <ThumbsUp className="mr-2 h-4 w-4" /> : null
             )
            }
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


function DeleteOrderButton({ orderId, orderNumber, onOrderDeleted }: { orderId: string, orderNumber: string, onOrderDeleted: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth(); 
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const handleDelete = async () => {
    if (!user || user.role !== 'admin') {
      toast({ variant: "destructive", title: "Permission Denied", description: "Only admins can delete orders." });
      setIsAlertOpen(false);
      return;
    }
    setIsDeleting(true);
    const result = await deleteOrder(orderId, user.role);
    if (result.success) {
      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been successfully deleted. Stock levels NOT automatically restocked.`,
      });
      onOrderDeleted();
    } else {
      toast({
        variant: "destructive",
        title: "Error Deleting Order",
        description: result.error || "An unexpected error occurred.",
      });
    }
    setIsDeleting(false);
    setIsAlertOpen(false);
  };

  if (!user || user.role !== 'admin') {
    return null; 
  }

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">Delete order {orderNumber}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete order "{orderNumber}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the order.
            Stock levels for items in this order will NOT be automatically restocked by this action.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsAlertOpen(false)} disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete Order
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isCreateOrderDialogOpen, setIsCreateOrderDialogOpen] = useState(false);

  // Filters and Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [appliedStatus, setAppliedStatus] = useState<OrderStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [appliedDateFrom, setAppliedDateFrom] = useState<Date | undefined>(undefined);
  const [appliedDateTo, setAppliedDateTo] = useState<Date | undefined>(undefined);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const fetchOrders = useCallback(async (page = 1) => {
    setIsLoadingOrders(true);
    try {
      const result = await getOrders({ 
        searchTerm: appliedSearchTerm,
        status: appliedStatus === 'all' ? undefined : appliedStatus,
        dateFrom: appliedDateFrom ? appliedDateFrom.toISOString() : null,
        dateTo: appliedDateTo ? appliedDateTo.toISOString() : null,
        page,
        limit: ITEMS_PER_PAGE,
      });
      setOrders(result.orders);
      setTotalPages(result.totalPages);
      setCurrentPage(result.currentPage);
      setTotalOrders(result.totalCount);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      toast({
        variant: "destructive",
        title: "Loading Error",
        description: "Could not load order data. Please try again later.",
      });
    } finally {
      setIsLoadingOrders(false);
    }
  }, [toast, appliedSearchTerm, appliedStatus, appliedDateFrom, appliedDateTo]);

  useEffect(() => {
    if (!authLoading) {
      fetchOrders(1); // Initial fetch for page 1
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, appliedSearchTerm, appliedStatus, appliedDateFrom, appliedDateTo]); // fetchOrders is memoized

  const handleOrderCreatedOrUpdated = () => {
    fetchOrders(currentPage); 
    setIsCreateOrderDialogOpen(false); 
  };

  const handleSearchAndFilterSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedSearchTerm(searchTerm);
    setAppliedStatus(selectedStatus);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setCurrentPage(1); // Reset to first page on new search/filter
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setAppliedSearchTerm('');
    setSelectedStatus('all');
    setAppliedStatus('all');
    setDateFrom(undefined);
    setAppliedDateFrom(undefined);
    setDateTo(undefined);
    setAppliedDateTo(undefined);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchOrders(newPage);
    }
  };

  if (authLoading || (isLoadingOrders && orders.length === 0 && currentPage === 1)) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <ShoppingCart className="mr-3 h-8 w-8 text-primary" /> Order Management
        </h1>
           <Dialog open={isCreateOrderDialogOpen} onOpenChange={setIsCreateOrderDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
                <PlusCircle className="mr-2 h-5 w-5" /> Create Order
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogNativeHeader>
                <DialogNativeTitle className="flex items-center text-2xl"> 
                  <ShoppingCart className="mr-3 h-7 w-7 text-primary" />
                  Create New Order
                </DialogNativeTitle>
                <DialogNativeDescription>
                  Select customer, add products, and specify discounts or shipping.
                </DialogNativeDescription>
              </DialogNativeHeader>
              <CreateOrderForm onOrderCreated={handleOrderCreatedOrUpdated} closeDialog={() => setIsCreateOrderDialogOpen(false)} />
            </DialogContent>
          </Dialog>
      </div>

      {/* Filter and Search Section */}
      <Card className="shadow-md">
        <CardHeader>
           <CardTitle className="flex items-center text-xl">
            <Filter className="mr-2 h-5 w-5 text-primary" />
            Filter & Search Orders
          </CardTitle>
           <CardDescription>
            Refine your order view. {totalOrders} orders found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearchAndFilterSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTermOrders" className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
                <Input 
                  id="searchTermOrders"
                  placeholder="Order #, Customer Name..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="statusFilterOrders" className="block text-sm font-medium text-muted-foreground mb-1">Status</label>
                <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as OrderStatus | 'all')}>
                  <SelectTrigger id="statusFilterOrders">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {OrderStatusSchema.options.map(statusValue => (
                      <SelectItem key={statusValue} value={statusValue}>
                        {statusValue.charAt(0).toUpperCase() + statusValue.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                  <label htmlFor="dateFromOrders" className="block text-sm font-medium text-muted-foreground mb-1">Date From</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateFromOrders"
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                    </PopoverContent>
                  </Popover>
              </div>
              <div>
                <label htmlFor="dateToOrders" className="block text-sm font-medium text-muted-foreground mb-1">Date To</label>
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateToOrders"
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus disabled={(date) => dateFrom ? date < dateFrom : false}/>
                    </PopoverContent>
                  </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Search className="mr-2 h-4 w-4" /> Apply
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>Manage and track all customer orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOrders && orders.length === 0 && currentPage === 1 ? (
             <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Orders Found</h3>
              <p className="text-muted-foreground">
                {appliedSearchTerm || appliedStatus !== 'all' || appliedDateFrom || appliedDateTo 
                  ? "No orders match your current filters." 
                  : "There are no orders yet. Create one to get started."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      {user?.role === 'admin' && <TableHead className="text-right">Profit</TableHead>}
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const isEmployee = user?.role === 'employee';
                      const canEmployeeEdit = isEmployee && (order.status === 'pending' || order.status === 'processing');
                      const isEditDisabledForEmployee = isEmployee && !canEmployeeEdit;

                      return (
                      <TableRow key={order._id}>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{isValid(new Date(order.orderDate)) ? format(new Date(order.orderDate), 'dd/MM/yyyy HH:mm') : 'Invalid Date'}</TableCell>
                        <TableCell className="text-right">${order.totalAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              order.status === 'completed' ? 'default' : 
                              order.status === 'delivered' ? 'default' :
                              order.status === 'shipped' ? 'default' :
                              order.status === 'cancelled' ? 'destructive' : 
                              'secondary'
                            }
                            className={
                              order.status === 'completed' ? 'bg-green-600 text-white border-green-700' :
                              order.status === 'delivered' ? 'bg-emerald-500 text-white border-emerald-600' :
                              order.status === 'pending' ? 'bg-yellow-400 text-yellow-900 border-yellow-500' :
                              order.status === 'processing' ? 'bg-blue-400 text-blue-900 border-blue-500' :
                              order.status === 'shipped' ? 'bg-purple-500 text-white border-purple-600' : 
                              order.status === 'cancelled' ? 'bg-red-500 text-white border-red-600' : ''
                            }
                          >
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                        </TableCell>
                         {user?.role === 'admin' && (
                          <TableCell className="text-right">
                            {order.profit !== undefined && order.profit !== null ? `$${order.profit.toFixed(2)}` : 'N/A'}
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <div className="flex flex-col sm:flex-row justify-center items-center space-y-1 sm:space-y-0 sm:space-x-1">
                              <OrderStatusActionButton order={order} onStatusUpdated={handleOrderCreatedOrUpdated} />
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-muted-foreground hover:text-primary" 
                                  onClick={() => alert(`Edit order: ${order.orderNumber} - Edit order functionality is complex (involving stock reconciliation, COGS recalculation, etc.) and will be implemented in a future update.`)}
                                  disabled={isEditDisabledForEmployee}
                                  title={isEditDisabledForEmployee ? `Cannot edit order in '${order.status}' status` : `Edit order ${order.orderNumber}`}
                                  >
                                  <Edit3 className="h-4 w-4" />
                                  <span className="sr-only">Edit order {order.orderNumber}</span>
                              </Button>
                              {user?.role === 'admin' && (
                                  <DeleteOrderButton orderId={order._id} orderNumber={order.orderNumber} onOrderDeleted={handleOrderCreatedOrUpdated} />
                              )}
                               <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-muted-foreground hover:text-primary" 
                                  onClick={() => alert(`Print order: ${order.orderNumber} - Print functionality (e.g., print-friendly view or PDF) will be implemented later.`)}
                                  title={`Print order ${order.orderNumber}`}
                                  >
                                  <Printer className="h-4 w-4" />
                                  <span className="sr-only">Print order ${order.orderNumber}</span>
                              </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage - 1)} 
                    disabled={currentPage === 1 || isLoadingOrders}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage + 1)} 
                    disabled={currentPage === totalPages || isLoadingOrders}
                  >
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

