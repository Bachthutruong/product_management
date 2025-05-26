
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getOrders } from '@/app/(app)/orders/actions'; // Assuming deleteOrder, updateOrder will be here
import type { Order } from '@/models/Order';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, PlusCircle, ShoppingCart, PackageSearch, Edit3, Trash2, Printer } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';


export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOrderDialogOpen, setIsCreateOrderDialogOpen] = useState(false);
  // TODO: State for edit/view dialog

  const fetchOrders = useCallback(async (term?: string) => {
    setIsLoadingOrders(true);
    try {
      const fetchedOrders = await getOrders(term);
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

  const handleOrderCreated = () => {
    fetchOrders(searchTerm); // Refresh list
    setIsCreateOrderDialogOpen(false); // Close dialog
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
              {/* DialogHeader is part of CreateOrderForm now */}
              <CreateOrderForm onOrderCreated={handleOrderCreated} closeDialog={() => setIsCreateOrderDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>Manage and track all customer orders. Edit, Delete, Print coming soon.</CardDescription>
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
                  {orders.map((order) => (
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
                            order.status === 'completed' || order.status === 'delivered' ? 'bg-green-100 text-green-800 border-green-300' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                            order.status === 'processing' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                            order.status === 'shipped' ? 'bg-purple-100 text-purple-800 border-purple-300' : ''
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
                        <div className="flex justify-center items-center space-x-1">
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" 
                                onClick={() => alert(`View/Edit order: ${order.orderNumber} - Not implemented`)}>
                                <Edit3 className="h-4 w-4" />
                            </Button>
                            {user?.role === 'admin' && (
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" 
                                    onClick={() => alert(`Delete order: ${order.orderNumber} - Not implemented`)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                             <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" 
                                onClick={() => alert(`Print order: ${order.orderNumber} - Not implemented`)}>
                                <Printer className="h-4 w-4" />
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
    </div>
  );
}
