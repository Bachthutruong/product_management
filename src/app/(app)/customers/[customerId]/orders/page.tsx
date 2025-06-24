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
      toast({ variant: "destructive", title: "錯誤", description: "客戶 ID 遺失。" });
      setIsLoading(false);
      return;
    }
    
    console.log('[CustomerOrdersPage] Fetching data for customerId:', customerId);
    setIsLoading(true);
    
    try {
      const [fetchedCustomer, fetchedOrdersResult] = await Promise.all([
        getCustomerById(customerId),
        getOrders({ customerId: customerId })
      ]);

      console.log('[CustomerOrdersPage] Fetched customer:', fetchedCustomer);
      console.log('[CustomerOrdersPage] Fetched orders result:', fetchedOrdersResult);

      if (!fetchedCustomer) {
        toast({ variant: "destructive", title: "錯誤", description: "客戶未找到。" });
      }
      setCustomer(fetchedCustomer);
      
      // getOrders returns an object with orders array, not direct array
      if (fetchedOrdersResult && Array.isArray(fetchedOrdersResult.orders)) {
        console.log('[CustomerOrdersPage] Setting orders:', fetchedOrdersResult.orders.length, 'orders found');
        setOrders(fetchedOrdersResult.orders);
      } else if (Array.isArray(fetchedOrdersResult)) {
        // Fallback if it's a direct array (old API)
        console.log('[CustomerOrdersPage] Setting orders (direct array):', fetchedOrdersResult.length, 'orders found');
        setOrders(fetchedOrdersResult as Order[]);
      } else {
        console.error("Fetched orders result is not in expected format:", fetchedOrdersResult);
        setOrders([]);
      }
    } catch (error) {
      console.error("Failed to fetch customer orders:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入客戶或訂單資料。",
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
        <h1 className="text-2xl font-semibold text-foreground">客戶未找到</h1>
        <p className="text-muted-foreground">要求的客戶無法找到。</p>
        <Button asChild className="mt-6">
          <Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> 返回客戶列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <Button asChild variant="outline" size="sm" className="mb-4">
            <Link href="/customers"><ArrowLeft className="mr-2 h-4 w-4" /> 返回所有客戶</Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground flex items-center">
            <ShoppingCart className="mr-3 h-8 w-8 text-primary" /> {customer.name} 的訂單
          </h1>
          <p className="text-muted-foreground">
            {customer.email && <span>Email: {customer.email} | </span>}
            {customer.phone && <span>Phone: {customer.phone}</span>}
          </p>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>訂單歷史</CardTitle>
          <CardDescription>所有由 {customer.name} 下的訂單。</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">沒有找到訂單</h3>
              <p className="text-muted-foreground">
                此客戶尚未下任何訂單。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訂單 #</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>建立者</TableHead>
                    <TableHead className="text-right">總金額</TableHead>
                    <TableHead>狀態</TableHead>
                    {user?.role === 'admin' && <TableHead className="text-right">利潤</TableHead>}
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
