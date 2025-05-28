
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getOrders, deleteOrder, updateOrderStatus } from '@/app/(app)/orders/actions'; 
import type { Order, OrderStatus } from '@/models/Order';
import { CreateOrderForm } from '@/components/orders/CreateOrderForm';

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
import {
  Dialog,
  DialogContent,
  DialogHeader as DialogNativeHeader, 
  DialogTitle as DialogNativeTitle, 
  DialogDescription as DialogNativeDescription, 
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, PlusCircle, ShoppingCart, PackageSearch, Edit3, Trash2, Printer, CheckCircle, Truck, ThumbsUp } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface OrderStatusActionButtonProps {
  order: Order;
  onStatusUpdated: () => void;
}

function OrderStatusActionButton({ order, onStatusUpdated }: OrderStatusActionButtonProps) {
  const { toast } = useToast();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    setIsUpdatingStatus(true);
    const result = await updateOrderStatus(order._id, newStatus);
    if (result.success) {
      toast({
        title: "Order Status Updated",
        description: `Order ${order.orderNumber} status changed to ${newStatus}.`,
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
  };

  if (order.status === 'pending' || order.status === 'processing') {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => handleUpdateStatus('shipped')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-blue-500 hover:bg-blue-600 text-white"
      >
        {isUpdatingStatus ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Truck className="mr-1 h-3 w-3" />}
        Mark as Shipped
      </Button>
    );
  }
  if (order.status === 'shipped') {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => handleUpdateStatus('delivered')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-green-500 hover:bg-green-600 text-white"
      >
        {isUpdatingStatus ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
        Mark as Delivered
      </Button>
    );
  }
   if (order.status === 'delivered') { // Assuming "hoàn thành" means completed after delivery
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => handleUpdateStatus('completed')} 
        disabled={isUpdatingStatus}
        className="text-xs bg-teal-500 hover:bg-teal-600 text-white"
      >
        {isUpdatingStatus ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ThumbsUp className="mr-1 h-3 w-3" />}
        Mark as Completed
      </Button>
    );
  }
  return null; // No action for other statuses like 'completed', 'cancelled'
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOrderDialogOpen, setIsCreateOrderDialogOpen] = useState(false);

  const fetchOrders = useCallback(async (term?: string) => {
    setIsLoadingOrders(true);
    try {
      const fetchedOrders = await getOrders({ searchTerm: term }); // Pass searchTerm correctly
      setOrders(fetchedOrders);
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
  }, [toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchOrders(searchTerm);
    }
  }, [user, authLoading, fetchOrders, searchTerm]);

  const handleOrderCreatedOrUpdated = () => {
    fetchOrders(searchTerm); 
    setIsCreateOrderDialogOpen(false); // Assuming this is for create, edit dialog would have its own state
  };

  if (authLoading) {
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
        <div className="flex items-center gap-2 w-full md:w-auto">
          <form onSubmit={(e) => { e.preventDefault(); fetchOrders(searchTerm); }} className="relative flex-grow md:flex-grow-0 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search orders..." 
              className="pl-8 w-full" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </form>
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
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>Manage and track all customer orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOrders && orders.length === 0 ? (
             <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Orders Found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? "No orders match your search." : "There are no orders yet. Create one to get started."}
              </p>
            </div>
          ) : (
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
                      <TableCell>{format(new Date(order.orderDate), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell className="text-right">${order.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={order.status === 'completed' || order.status === 'delivered' ? 'default' : 
                                   order.status === 'cancelled' ? 'destructive' : 'secondary'}
                          className={
                            order.status === 'completed' ? 'bg-green-600 text-white border-green-700' :
                            order.status === 'delivered' ? 'bg-emerald-500 text-white border-emerald-600' :
                            order.status === 'pending' ? 'bg-yellow-400 text-yellow-900 border-yellow-500' :
                            order.status === 'processing' ? 'bg-blue-400 text-blue-900 border-blue-500' :
                            order.status === 'shipped' ? 'bg-purple-500 text-white border-purple-600' : ''
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
                                <span className="sr-only">Print order {order.orderNumber}</span>
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

