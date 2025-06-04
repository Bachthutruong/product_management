'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOrderById } from '@/app/(app)/orders/actions';
import type { Order } from '@/models/Order';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, User, Calendar, DollarSign, FileText, ShoppingCart, Edit3, Receipt } from "lucide-react";
import { formatCurrency } from '@/lib/utils';
import { formatToYYYYMMDDWithTime } from '@/lib/date-utils';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId || typeof orderId !== 'string') {
        router.push('/orders');
        return;
      }

      setIsLoading(true);
      try {
        // Lấy đơn hàng theo ID
        const result = await getOrderById(orderId);
        
        if (!result.success || !result.order) {
          toast({ 
            variant: "destructive", 
            title: "找不到訂單", 
            description: result.error || "無法找到該訂單。" 
          });
          router.push('/orders');
          return;
        }

        setOrder(result.order);
      } catch (error) {
        console.error("Failed to fetch order:", error);
        toast({ 
          variant: "destructive", 
          title: "載入錯誤", 
          description: "無法載入訂單詳細資料。" 
        });
        router.push('/orders');
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrder();
  }, [orderId, router, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'processing': return 'bg-blue-500';
      case 'shipped': return 'bg-purple-500';
      case 'delivered': return 'bg-green-500';
      case 'completed': return 'bg-green-600';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'default';
      case 'cancelled':
        return 'destructive';
      case 'pending':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push('/orders')}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div>
            <h1 className="text-3xl font-bold text-foreground">訂單編號 {order.orderNumber}</h1>
            <p className="text-muted-foreground">訂單詳細資料</p>
          </div>
          <Badge variant={getStatusVariant(order.status)} className="ml-auto">
            <span className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(order.status)}`}></span>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              訂單資訊
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">訂單編號</label>
                <p className="text-foreground font-medium">{order.orderNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">訂單日期</label>
                <p className="text-foreground">{formatToYYYYMMDDWithTime(order.orderDate)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">狀態</label>
                <Badge variant={getStatusVariant(order.status)} className="mt-1">
                  <span className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(order.status)}`}></span>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">建立者</label>
                <p className="text-foreground">{order.createdByName}</p>
              </div>
            </div>
            
            {order.notes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">備註</label>
                <p className="text-foreground whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              客戶資訊
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">客戶名稱</label>
              <p className="text-foreground font-medium">{order.customerName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">客戶ID</label>
              <p className="text-foreground">{order.customerId}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            訂單商品
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead className="text-right">總價</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.productSku || 'N/A'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </TableCell>
                    <TableCell>{item.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            訂單摘要
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">小計</span>
              <span className="text-foreground">{formatCurrency(order.subtotal)}</span>
            </div>
            
            {order.discountAmount && order.discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  折扣 {order.discountType === 'percentage' ? `(${order.discountValue}%)` : ''}
                </span>
                <span className="text-green-600">-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            
            {order.shippingFee && order.shippingFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">運費</span>
                <span className="text-foreground">{formatCurrency(order.shippingFee)}</span>
              </div>
            )}
            
            <div className="border-t pt-2">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">總金額</span>
                <span className="text-xl font-bold text-foreground">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
            
            {order.profit && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">利潤</span>
                <span className={`font-medium ${order.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(order.profit)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4">
        {/* <Button
          onClick={() => router.push(`/orders?edit=${order._id}`)}
          className="flex items-center gap-2"
        >
          <Edit3 className="h-4 w-4" />
          Edit Order
        </Button> */}
        <Button
          variant="outline"
          onClick={() => router.push('/orders')}
        >
          返回訂單列表
        </Button>
      </div>
    </div>
  );
} 