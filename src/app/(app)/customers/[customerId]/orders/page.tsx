"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getOrders } from '@/app/(app)/orders/actions';
import { getCustomerById } from '@/app/(app)/customers/actions';
import type { Order } from '@/models/Order';
import type { Customer } from '@/models/Customer';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShoppingCart, PackageSearch, ArrowLeft, User } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatToYYYYMMDDWithTime } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';

export default function CustomerOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const customerId = params.customerId as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomerDetailsAndOrders = useCallback(async () => {
    if (!customerId) {
      toast({ variant: "destructive", title: "Error", description: "Customer ID is missing." });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [fetchedCustomer, fetchedOrders] = await Promise.all([
        getCustomerById(customerId),
        getOrders({ customerId: customerId })
      ]);

      if (!fetchedCustomer) {
        toast({ variant: "destructive", title: "Error", description: "Customer not found." });
      }
      setCustomer(fetchedCustomer);
      //@ts-expect-error _id is not in Order model but might be added dynamically
      setOrders(fetchedOrders);
    } catch (error) {
      console.error("Failed to fetch customer orders:", error);
      toast({
        variant: "destructive",
        title: "Loading Error",
        description: "Could not load customer or order data.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [customerId, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchCustomerDetailsAndOrders();
    }
  }, [authLoading, fetchCustomerDetailsAndOrders]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] p-6 text-center">
        <User className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-semibold text-foreground">Customer Not Found</h1>
        <p className="text-muted-foreground">The requested customer could not be found.</p>
        <Button asChild className="mt-6">
          <Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-4">
            <Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> Back to All Customers</Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground flex items-center">
            <ShoppingCart className="mr-3 h-8 w-8 text-primary" /> Orders for {customer.name}
          </h1>
          <p className="text-muted-foreground">
            {customer.email && <span>Email: {customer.email} | </span>}
            {customer.phone && <span>Phone: {customer.phone}</span>}
          </p>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>All orders placed by {customer.name}.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Orders Found</h3>
              <p className="text-muted-foreground">
                This customer has not placed any orders yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    {user?.role === 'admin' && <TableHead className="text-right">Profit</TableHead>}
                    {/* Add other relevant columns if needed */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order._id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{formatToYYYYMMDDWithTime(order.orderDate)}</TableCell>
                      <TableCell>{order.createdByName || 'N/A'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
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
                          {order.profit !== undefined && order.profit !== null ? formatCurrency(order.profit) : 'N/A'}
                        </TableCell>
                      )}
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
