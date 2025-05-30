"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getOrders, deleteOrder, updateOrderStatus } from '@/app/(app)/orders/actions';
import type { Order, OrderStatus } from '@/models/Order';
import { OrderStatusSchema, AllOrderStatusOptions } from '@/models/Order';
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

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1]; // Default to 10

interface OrderFilters {
  searchTerm: string;
  status: OrderStatus | 'all';
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOrderDialogOpen, setIsCreateOrderDialogOpen] = useState(false);

  // Filter Inputs
  const [searchTermInput, setSearchTermInput] = useState('');
  const [statusInput, setStatusInput] = useState<OrderStatus | 'all'>('all');
  const [dateFromInput, setDateFromInput] = useState<Date | undefined>(undefined);
  const [dateToInput, setDateToInput] = useState<Date | undefined>(undefined);

  // Applied Filters for API call
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>({
    searchTerm: '',
    status: 'all',
    dateFrom: undefined,
    dateTo: undefined,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);

  const fetchOrders = useCallback(async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      const result = await getOrders({
        searchTerm: appliedFilters.searchTerm,
        status: appliedFilters.status === 'all' ? undefined : appliedFilters.status,
        dateFrom: appliedFilters.dateFrom ? appliedFilters.dateFrom.toISOString() : undefined,
        dateTo: appliedFilters.dateTo ? appliedFilters.dateTo.toISOString() : undefined,
        page: currentPage,
        limit: itemsPerPage,
      });
      setOrders(result.orders);
      setTotalPages(result.totalPages);
      // setCurrentPage(result.currentPage); // Backend might adjust page if out of bounds
      setTotalOrders(result.totalCount);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      toast({
        variant: "destructive",
        title: "Loading Error",
        description: "Could not load order data. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, authLoading, appliedFilters, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleOrderCreatedOrUpdated = () => {
    fetchOrders();
    setIsCreateOrderDialogOpen(false);
  };

  const handleOrderDeleted = () => {
    if (orders.length === 1 && currentPage > 1) {
      setCurrentPage(prev => prev - 1); // This will trigger fetchOrders via useEffect
    } else {
      fetchOrders();
    }
  }

  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      searchTerm: searchTermInput,
      status: statusInput,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTermInput('');
    setStatusInput('all');
    setDateFromInput(undefined);
    setDateToInput(undefined);
    setAppliedFilters({
      searchTerm: '',
      status: 'all',
      dateFrom: undefined,
      dateTo: undefined,
    });
    setCurrentPage(1);
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

  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open('', '_blank', 'height=700,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Order Invoice - ' + order.orderNumber + '</title>');
      printWindow.document.write(`
        <style>
          body { font-family: 'Arial', sans-serif; margin: 20px; color: #333; }
          .invoice-container { border: 1px solid #ddd; padding: 20px; max-width: 800px; margin: auto; background-color: #fff; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0 0 5px 0; color: #222; }
          .header p { margin: 2px 0; font-size: 0.9em; color: #555; }
          .company-details, .invoice-details, .customer-details { margin-bottom: 20px; }
          .company-details h2, .invoice-details h3, .customer-details h3 {
            margin-top: 0; margin-bottom: 8px; font-size: 1.2em; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #000;
          }
          .details-grid { display: grid; grid-template-columns: 120px 1fr; gap: 5px 10px; font-size: 0.95em;}
          .details-grid strong { font-weight: 600; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em; }
          .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .items-table th { background-color: #f9f9f9; font-weight: 600; }
          .items-table td.number-cell { text-align: right; }
          .totals { float: right; width: 40%; margin-top: 20px; font-size: 0.95em; }
          .totals table { width: 100%; }
          .totals td { padding: 5px 0; }
          .totals td:last-child { text-align: right; font-weight: bold; }
          .footer { text-align: center; margin-top: 40px; font-size: 0.8em; color: #777; padding-top: 10px; border-top: 1px solid #eee;}
          .print-button-container { text-align: center; margin-top: 20px; margin-bottom: 10px; }
          .print-button-container button {
            padding: 10px 20px; font-size: 1em; color: white; background-color: #007bff; border: none;
            border-radius: 5px; cursor: pointer; margin: 0 5px;
          }
          .print-button-container button:hover { background-color: #0056b3; }
          @media print {
            body { margin: 0; background-color: #fff; }
            .invoice-container { border: none; box-shadow: none; margin: 0; max-width: 100%; padding: 0; }
            .print-button-container { display: none; }
            .footer { margin-top: 20px; }
          }
        </style>
      `);
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div class="invoice-container">');

      // Header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h1>Your Company Name</h1>'); // Placeholder
      printWindow.document.write('<p>123 Main Street, Anytown, CA 90210</p>'); // Placeholder
      printWindow.document.write('<p>Phone: (123) 456-7890 | Email: contact@yourcompany.com</p>'); // Placeholder
      printWindow.document.write('</div>');

      // Company & Invoice Details
      printWindow.document.write('<div style="display: flex; justify-content: space-between; margin-bottom: 20px;">');
      printWindow.document.write('<div class="invoice-details" style="width: 48%;">');
      printWindow.document.write('<h3>Order Invoice</h3>');
      printWindow.document.write('<div class="details-grid">');
      printWindow.document.write('<strong>Order #:</strong><span>' + order.orderNumber + '</span>');
      printWindow.document.write('<strong>Order Date:</strong><span>' + (isValid(new Date(order.orderDate)) ? format(new Date(order.orderDate), 'PPP p') : 'Invalid Date') + '</span>');
      printWindow.document.write('<strong>Status:</strong><span>' + (order.status.charAt(0).toUpperCase() + order.status.slice(1)) + '</span>');
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');

      printWindow.document.write('<div class="customer-details" style="width: 48%;">');
      printWindow.document.write('<h3>Bill To</h3>');
      printWindow.document.write('<div class="details-grid">');
      printWindow.document.write('<strong>Name:</strong><span>' + order.customerName + '</span>');
      // @ts-expect-error customerEmail is not in Order model but might be added dynamically
      if (order.customerEmail) printWindow.document.write('<strong>Email:</strong><span>' + order.customerEmail + '</span>');
      // @ts-expect-error customerPhone is not in Order model but might be added dynamically
      if (order.customerPhone) printWindow.document.write('<strong>Phone:</strong><span>' + order.customerPhone + '</span>');
      // @ts-expect-error shippingAddress is not in Order model but might be added dynamically
      if (order.shippingAddress) {
        // @ts-expect-error shippingAddress is not in Order model but might be added dynamically
        const addr = order.shippingAddress;
        printWindow.document.write('<strong>Address:</strong><span>' +
          `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}` +
          '</span>');
      }
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');


      // Items Table
      printWindow.document.write('<table class="items-table">');
      printWindow.document.write('<thead><tr><th>#</th><th>Item</th><th>Quantity</th><th class="number-cell">Unit Price</th><th class="number-cell">Total</th></tr></thead>');
      printWindow.document.write('<tbody>');
      order.items.forEach((item, index) => {
        printWindow.document.write(
          '<tr>' +
          '<td>' + (index + 1) + '</td>' +
          '<td>' + item.productName + '</td>' +
          '<td class="number-cell">' + item.quantity + '</td>' +
          '<td class="number-cell">$' + item.unitPrice.toFixed(2) + '</td>' +
          '<td class="number-cell">$' + (item.quantity * item.unitPrice).toFixed(2) + '</td>' +
          '</tr>'
        );
      });
      printWindow.document.write('</tbody></table>');

      // Totals
      printWindow.document.write('<div class="totals"><table>');
      printWindow.document.write('<tr><td>Subtotal:</td><td>$' + order.subtotal.toFixed(2) + '</td></tr>');
      if (order.discountAmount && order.discountAmount > 0) {
        printWindow.document.write('<tr><td>Discount:</td><td>-$' + order.discountAmount.toFixed(2) + '</td></tr>');
      }
      if (order.shippingFee && order.shippingFee > 0) {
        printWindow.document.write('<tr><td>Shipping:</td><td>$' + order.shippingFee.toFixed(2) + '</td></tr>');
      }
      // Tax amount is not in the current Order schema, so it's removed for now.
      // if (order.taxAmount && order.taxAmount > 0) {
      //   printWindow.document.write('<tr><td>Tax:</td><td>$' + order.taxAmount.toFixed(2) + '</td></tr>');
      // }
      printWindow.document.write('<tr><td style="font-size: 1.1em;"><strong>Grand Total:</strong></td><td style="font-size: 1.1em;"><strong>$' + order.totalAmount.toFixed(2) + '</strong></td></tr>');
      printWindow.document.write('</table></div><div style="clear:both;"></div>');


      // Notes
      if (order.notes) {
        printWindow.document.write('<div class="notes-section" style="margin-top: 20px;">');
        printWindow.document.write('<h3>Notes</h3>');
        printWindow.document.write('<p style="font-size: 0.9em; white-space: pre-wrap;">' + order.notes + '</p>');
        printWindow.document.write('</div>');
      }

      // Footer
      printWindow.document.write('<div class="footer">Thank you for your business!</div>');

      printWindow.document.write('</div>'); // End invoice-container

      // Print Button
      printWindow.document.write(`
        <div class="print-button-container">
          <button onclick="window.print()">Print Invoice</button>
          <button onclick="window.close()">Close</button>
        </div>
      `);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus(); // Focus on the new window
    } else {
      toast({
        variant: "destructive",
        title: "Print Error",
        description: "Could not open print window. Please check your pop-up blocker settings.",
      });
    }
  };

  if (authLoading && isLoading && orders.length === 0) {
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

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Filter className="mr-2 h-5 w-5 text-primary" />
            Filter & Search Orders
          </CardTitle>
          <CardDescription>
            Refine your order view. {isLoading && totalOrders === 0 ? "Loading..." : `${totalOrders} orders found.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTermOrders" className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
                <Input
                  id="searchTermOrders"
                  placeholder="Order #, Customer Name..."
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="statusFilterOrders" className="block text-sm font-medium text-muted-foreground mb-1">Status</label>
                <Select value={statusInput} onValueChange={(value) => setStatusInput(value as OrderStatus | 'all')}>
                  <SelectTrigger id="statusFilterOrders">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {AllOrderStatusOptions.map(statusValue => (
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
                      className={cn("w-full justify-start text-left font-normal", !dateFromInput && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFromInput ? format(dateFromInput, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateFromInput} onSelect={setDateFromInput} initialFocus />
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
                      className={cn("w-full justify-start text-left font-normal", !dateToInput && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateToInput ? format(dateToInput, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateToInput} onSelect={setDateToInput} initialFocus disabled={(date) => dateFromInput ? date < dateFromInput : false} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" /> Apply
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
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
          {isLoading && orders.length === 0 && totalOrders === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !isLoading && orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Orders Found</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.status !== 'all' || appliedFilters.dateFrom || appliedFilters.dateTo
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
                                onClick={() => alert(`Edit order functionality is complex (involving stock reconciliation, COGS recalculation, etc.) and will be implemented in a future update.`)}
                                disabled={isEditDisabledForEmployee}
                                title={isEditDisabledForEmployee ? `Cannot edit order in '${order.status}' status` : `Edit order ${order.orderNumber}`}
                              >
                                <Edit3 className="h-4 w-4" />
                                <span className="sr-only">Edit order {order.orderNumber}</span>
                              </Button>
                              {user?.role === 'admin' && order._id && order.orderNumber && (
                                <DeleteOrderButton orderId={order._id} orderNumber={order.orderNumber} onOrderDeleted={handleOrderDeleted} />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary"
                                onClick={() => handlePrintOrder(order)}
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
              {totalPages >= 1 && (
                <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      Next <ArrowRight className="ml-1 h-4 w-4" />
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

