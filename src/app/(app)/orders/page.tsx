"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { getOrders, deleteOrder, updateOrderStatus } from '@/app/(app)/orders/actions';
import type { Order, OrderStatus } from '@/models/Order';
import { OrderStatusSchema, AllOrderStatusOptions } from '@/models/Order';
import { CreateOrderForm } from '@/components/orders/CreateOrderForm';
import { EditOrderForm } from '@/components/orders/EditOrderForm';
import Link from 'next/link';

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Search, PlusCircle, ShoppingCart, PackageSearch, Edit3, Trash2, Printer, CheckCircle, Truck, ThumbsUp, Filter, X, CalendarIcon, ArrowLeft, ArrowRight, Eye, Package } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format, isValid } from 'date-fns';
import { formatToYYYYMMDDWithTime, formatToYYYYMMDD, formatForCalendarDisplay } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1]; // Default to 10

// Helper function to get Chinese status text
const getChineseStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': '待付款',
    'processing': '處理中',
    'shipped': '已出貨', 
    'delivered': '已到貨',
    'completed': '完成',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
};

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
        title: "訂單狀態已更新",
        description: `訂單 ${order.orderNumber} 狀態已變更為 ${targetStatus}.`,
      });
      onStatusUpdated();
    } else {
      toast({
        variant: "destructive",
        title: "更新狀態時發生錯誤",
        description: result.error || "發生預期外的錯誤。",
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
        className="text-xs bg-[#c3223d] hover:bg-[#c3223d]/90 text-white"
      >
        {isUpdatingStatus && targetStatus === 'shipped' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Truck className="mr-1 h-3 w-3" />}
        確認已出貨
      </Button>
    );
    dialogTitle = `確認將訂單 ${order.orderNumber} 變更為已出貨?`;
    dialogDescription = "這將會將訂單狀態變更為 '已出貨'。確認嗎？";
  } else if (order.status === 'shipped') {
    actionButton = (
      <Button
        variant="outline"
        size="sm"
        onClick={() => openConfirmationDialog('completed')}
        disabled={isUpdatingStatus}
        className="text-xs bg-teal-500 hover:bg-teal-600 text-white"
      >
        {isUpdatingStatus && targetStatus === 'completed' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ThumbsUp className="mr-1 h-3 w-3" />}
        確認已完成
      </Button>
    );
    dialogTitle = `確認將訂單 ${order.orderNumber} 變更為已完成?`;
    dialogDescription = "這將會將訂單狀態變更為 '已完成'。確認嗎？";
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
          <AlertDialogCancel onClick={() => { setIsAlertOpen(false); setTargetStatus(null); }} disabled={isUpdatingStatus}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmUpdateStatus}
            disabled={isUpdatingStatus}
            className={
              targetStatus === 'shipped' ? 'bg-blue-500 hover:bg-blue-600' :
                targetStatus === 'completed' ? 'bg-teal-500 hover:bg-teal-600' : ''
            }
          >
            {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
              (targetStatus === 'shipped' ? <Truck className="mr-2 h-4 w-4" /> :
                targetStatus === 'completed' ? <ThumbsUp className="mr-2 h-4 w-4" /> : null
              )
            }
            確認
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteOrderButton({ orderId, orderNumber, onOrderDeleted }: { orderId: string, orderNumber: string, onOrderDeleted: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleDelete = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const result = await deleteOrder(orderId, user.role, user);
      if (result.success) {
        toast({
          title: "訂單已刪除",
          description: `訂單 ${orderNumber} 已成功刪除。`,
        });
        onOrderDeleted();
      } else {
        toast({
          variant: "destructive",
          title: "刪除訂單時發生錯誤",
          description: result.error || "發生預期外的錯誤。",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white hover:bg-[#c3223d]" title={`Delete order ${orderNumber}`}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">刪除訂單 {orderNumber}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>刪除訂單</AlertDialogTitle>
          <AlertDialogDescription>
            確認要刪除訂單 <strong>{orderNumber}</strong>? 此操作無法撤銷，並將永久從系統中刪除訂單。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            刪除訂單
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrderDetailsDialog({ order }: { order: Order }) {
  const [isOpen, setIsOpen] = useState(false);

  const isExpired = (date: Date) => {
    return new Date(date) < new Date();
  };

  const isNearExpiry = (date: Date) => {
    const today = new Date();
    const daysUntilExpiry = Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-white hover:bg-[#c3223d]"
          title={`查看訂單詳細資料 ${order.orderNumber}`}
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">查看訂單詳細資料 {order.orderNumber}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>訂單詳細資料 - {order.orderNumber}</DialogTitle>
          <DialogDescription>
            訂單於 {formatToYYYYMMDDWithTime(order.orderDate)} 由 {order.customerName} 下單
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Order Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">狀態</label>
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
                {getChineseStatus(order.status)}
              </Badge>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">小計</h4>
              <p className="font-medium">{formatCurrency(order.subtotal)}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">總計</h4>
              <p className="font-medium text-lg">{formatCurrency(order.totalAmount)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">建立者</label>
              <p className="font-medium">{order.createdByName || 'N/A'}</p>
            </div>
          </div>

          {/* Order Items with Batch Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">訂單商品及批次資訊</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead className="text-right">總計</TableHead>
                  <TableHead>批次資訊</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        {item.productSku && <p className="text-sm text-muted-foreground">SKU: {item.productSku}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.quantity * item.unitPrice)}</TableCell>
                    <TableCell>
                      {item.batchesUsed && item.batchesUsed.length > 0 ? (
                        <div className="space-y-1">
                          {item.batchesUsed.map((batch, batchIndex) => (
                            <div key={batchIndex} className="text-xs border rounded p-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">批次: {batch.batchId}</span>
                                <span>數量: {batch.quantityUsed}</span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span>有效期: {formatToYYYYMMDD(batch.expiryDate)}</span>
                                <Badge
                                  variant={
                                    isExpired(batch.expiryDate) ? 'destructive' :
                                      isNearExpiry(batch.expiryDate) ? 'secondary' : 'default'
                                  }
                                  className="text-xs"
                                >
                                  {isExpired(batch.expiryDate) ? '已過期' :
                                    isNearExpiry(batch.expiryDate) ? '即將過期' : '有效'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Package className="w-3 h-3 mr-1" />
                          無批次資訊
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Additional Information */}
          {(order.discountAmount && order.discountAmount > 0) && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">折扣</h4>
              <p>{formatCurrency(order.discountAmount)} ({order.discountType === 'percentage' ? `${order.discountValue}%` : '固定金額'})</p>
            </div>
          )}

          {(order.shippingFee && order.shippingFee > 0) && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">運費</h4>
              <p>{formatCurrency(order.shippingFee)}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditOrderDialog({ order, onOrderUpdated }: { order: Order, onOrderUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  const handleOrderUpdated = (orderId: string) => {
    onOrderUpdated();
    setOpen(false);
  };

  const isEmployee = user?.role === 'employee';
  const canEmployeeEdit = isEmployee && (order.status === 'pending' || order.status === 'processing');
  const isEditDisabledForEmployee = isEmployee && !canEmployeeEdit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-white hover:bg-[#c3223d]"
          disabled={isEditDisabledForEmployee}
                        title={isEditDisabledForEmployee ? `無法編輯處於 '${getChineseStatus(order.status)}' 狀態的訂單` : `編輯訂單 ${order.orderNumber}`}
        >
          <Edit3 className="h-4 w-4" />
          <span className="sr-only">編輯訂單 {order.orderNumber}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯訂單 - {order.orderNumber}</DialogTitle>
        </DialogHeader>
        <EditOrderForm
          order={order}
          onOrderUpdated={handleOrderUpdated}
          closeDialog={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

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
        title: "載入錯誤",
        description: "無法載入訂單資料。請稍後再試。",
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
      printWindow.document.write('<html><head><title>訂單資料 - ' + order.orderNumber + '</title>');
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
      printWindow.document.write('<h1>Annie\'s Way  安妮絲薇</h1>'); // Placeholder
      printWindow.document.write('<p>客服專線：07-373-0202 | Email：sales@anniesway.com.tw</p>'); // Placeholder
      printWindow.document.write('<p>地址：高雄市仁武區八德南路468號</p>'); // Placeholder
      printWindow.document.write('</div>');

      // Company & Invoice Details
      printWindow.document.write('<div style="display: flex; justify-content: space-between; margin-bottom: 20px;">');
      printWindow.document.write('<div class="invoice-details" style="width: 48%;">');
      printWindow.document.write('<h3>訂單資料</h3>');
      printWindow.document.write('<div class="details-grid">');
      printWindow.document.write('<strong>訂單編號:</strong><span>' + order.orderNumber + '</span>');
      printWindow.document.write('<strong>訂單日期:</strong><span>' + (isValid(new Date(order.orderDate)) ? formatToYYYYMMDDWithTime(order.orderDate) : 'Invalid Date') + '</span>');
      printWindow.document.write('<strong>狀態:</strong><span>' + getChineseStatus(order.status) + '</span>');
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');

      printWindow.document.write('<div class="customer-details" style="width: 48%;">');
      printWindow.document.write('<h3>顧客資料</h3>');
      printWindow.document.write('<div class="details-grid">');
      printWindow.document.write('<strong>姓名:</strong><span>' + order.customerName + '</span>');
      // @ts-expect-error customerEmail is not in Order model but might be added dynamically
      if (order.customerEmail) printWindow.document.write('<strong>Email:</strong><span>' + order.customerEmail + '</span>');
      // @ts-expect-error customerPhone is not in Order model but might be added dynamically
      if (order.customerPhone) printWindow.document.write('<strong>Phone:</strong><span>' + order.customerPhone + '</span>');
      // @ts-expect-error shippingAddress is not in Order model but might be added dynamically
      if (order.shippingAddress) {
        // @ts-expect-error shippingAddress is not in Order model but might be added dynamically
        const addr = order.shippingAddress;
        printWindow.document.write('<strong>地址:</strong><span>' +
          `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}` +
          '</span>');
      }
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');
      printWindow.document.write('</div>');


      // Items Table
      printWindow.document.write('<table class="items-table">');
      printWindow.document.write('<thead><tr><th>#</th><th>商品</th><th>數量</th><th class="number-cell">單價</th><th class="number-cell">總計</th></tr></thead>');
      printWindow.document.write('<tbody>');
      order.items.forEach((item, index) => {
        printWindow.document.write(
          '<tr>' +
          '<td>' + (index + 1) + '</td>' +
          '<td>' + item.productName + '</td>' +
          '<td>' + item.quantity + '</td>' +
          '<td class="number-cell">' + formatCurrency(item.unitPrice) + '</td>' +
          '<td class="number-cell">' + formatCurrency(item.quantity * item.unitPrice) + '</td>' +
          '</tr>'
        );
      });
      printWindow.document.write('</tbody></table>');

      // Totals
      printWindow.document.write('<div class="totals"><table>');
      printWindow.document.write('<tr><td>小計:</td><td>' + formatCurrency(order.subtotal) + '</td></tr>');
      if (order.discountAmount && order.discountAmount > 0) {
        printWindow.document.write('<tr><td>折扣:</td><td>-' + formatCurrency(order.discountAmount) + '</td></tr>');
      }
      if (order.shippingFee && order.shippingFee > 0) {
        printWindow.document.write('<tr><td>運費:</td><td>' + formatCurrency(order.shippingFee) + '</td></tr>');
      }
      // if (order.taxAmount && order.taxAmount > 0) {
      //   printWindow.document.write('<tr><td>Tax:</td><td>' + formatCurrency(order.taxAmount) + '</td></tr>');
      // }
      printWindow.document.write('<tr style="border-top: 1px solid #ccc; font-weight: bold; font-size: 1.1em;"><td><strong>總計:</strong></td><td><strong>' + formatCurrency(order.totalAmount) + '</strong></td></tr>');
      printWindow.document.write('</table></div><div style="clear:both;"></div>');


      // Notes
      if (order.notes) {
        printWindow.document.write('<div class="notes-section" style="margin-top: 20px;">');
        printWindow.document.write('<h3>備註</h3>');
        printWindow.document.write('<p style="font-size: 0.9em; white-space: pre-wrap;">' + order.notes + '</p>');
        printWindow.document.write('</div>');
      }

      // Footer
      printWindow.document.write('<div class="footer">謝謝您的支持！</div>');

      printWindow.document.write('</div>'); // End invoice-container

      // Print Button
      printWindow.document.write(`
        <div class="print-button-container">
          <button onclick="window.print()">列印訂單</button>
          <button onclick="window.close()">關閉</button>
        </div>
      `);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus(); // Focus on the new window
    } else {
      toast({
        variant: "destructive",
        title: "列印錯誤",
        description: "無法開啟列印視窗。請檢查您的彈出視窗阻擋設定。",
      });
    }
  };

  // Remove the blocking full-page loader

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground flex items-center">
          <ShoppingCart className="mr-3 h-8 w-8 text-primary" /> 訂單管理
        </h1>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin/deleted-orders')}
              className="shrink-0"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              查看已刪除的訂單
            </Button>
          )}
          <Dialog open={isCreateOrderDialogOpen} onOpenChange={setIsCreateOrderDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
                <PlusCircle className="mr-2 h-5 w-5" /> 新增訂單
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center text-2xl">
                  <ShoppingCart className="mr-3 h-7 w-7 text-primary" />
                  新增訂單
                </DialogTitle>
                <DialogDescription>
                  選擇客戶，新增商品，並指定折扣或運費。
                </DialogDescription>
              </DialogHeader>
              <CreateOrderForm onOrderCreated={handleOrderCreatedOrUpdated} closeDialog={() => setIsCreateOrderDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Filter className="mr-2 h-5 w-5 text-primary" />
            查詢訂單
          </CardTitle>
          {/* <CardDescription>
            精簡您的訂單檢視。 {isLoading && totalOrders === 0 ? "載入中..." : `${totalOrders} 筆訂單已找到。`}
          </CardDescription> */}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTermOrders" className="block text-sm font-medium text-muted-foreground mb-1">搜尋</label>
                <Input
                  id="searchTermOrders"
                  placeholder="訂單編號, 客戶姓名..."
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="statusFilterOrders" className="block text-sm font-medium text-muted-foreground mb-1">狀態</label>
                <Select value={statusInput} onValueChange={(value) => setStatusInput(value as OrderStatus | 'all')}>
                  <SelectTrigger id="statusFilterOrders">
                    <SelectValue placeholder="所有狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有狀態</SelectItem>
                    {AllOrderStatusOptions.map(statusValue => (
                      <SelectItem key={statusValue} value={statusValue}>
                        {getChineseStatus(statusValue)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="dateFromOrders" className="block text-sm font-medium text-muted-foreground mb-1">日期從</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dateFromOrders"
                      variant={"outline"}
                      className={cn("w-full justify-start text-left font-normal", !dateFromInput && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFromInput ? formatForCalendarDisplay(dateFromInput) : <span>選擇日期</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePickerCalendar selected={dateFromInput} onSelect={setDateFromInput} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label htmlFor="dateToOrders" className="block text-sm font-medium text-muted-foreground mb-1">日期至</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dateToOrders"
                      variant={"outline"}
                      className={cn("w-full justify-start text-left font-normal", !dateToInput && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateToInput ? formatForCalendarDisplay(dateToInput) : <span>選擇日期</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePickerCalendar 
                      selected={dateToInput} 
                      onSelect={setDateToInput} 
                      disabled={(date) => dateFromInput ? date < dateFromInput : false} 
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-[#c3223d] hover:bg-primary/90 text-white" disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" /> 套用
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
                <X className="mr-2 h-4 w-4" /> 清除過濾
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>訂單列表</CardTitle>
          <CardDescription>管理及追蹤所有客戶訂單。</CardDescription>
        </CardHeader>
        <CardContent>
                      {isLoading && orders.length === 0 ? (
            <div className="space-y-3">
              {/* Skeleton table */}
              <div className="animate-pulse">
                <div className="grid grid-cols-8 gap-4 py-2 border-b">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="grid grid-cols-8 gap-4 py-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(j => (
                      <div key={j} className="h-4 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">找不到訂單</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.status !== 'all' || appliedFilters.dateFrom || appliedFilters.dateTo
                  ? "找不到符合您目前過濾條件的訂單。"
                  : "目前沒有任何訂單。"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead>客戶</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>建立者</TableHead>
                      <TableHead className="text-right">總計</TableHead>
                      <TableHead>狀態</TableHead>
                      {user?.role === 'admin' && <TableHead className="text-right">利潤</TableHead>}
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const isEmployee = user?.role === 'employee';
                      const canEmployeeEdit = isEmployee && (order.status === 'pending' || order.status === 'processing');
                      const isEditDisabledForEmployee = isEmployee && !canEmployeeEdit;

                      return (
                        <TableRow key={order._id}>
                          <TableCell className="font-medium">
                            <Link 
                              href={`/orders/${order._id}`}
                              className="text-primary hover:text-primary/80 hover:underline transition-colors"
                            >
                              {order.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell 
                            className="font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors" 
                            onClick={() => router.push(`/customers/${order.customerId}/orders`)}
                            title={`查看 ${order.customerName} 的訂單`}
                          >
                            {order.customerName}
                          </TableCell>
                          <TableCell>{isValid(new Date(order.orderDate)) ? formatToYYYYMMDDWithTime(order.orderDate) : 'Invalid Date'}</TableCell>
                          <TableCell>{order.createdByName || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
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
                              {getChineseStatus(order.status)}
                            </Badge>
                          </TableCell>
                          {user?.role === 'admin' && (
                            <TableCell className="text-right">
                              {order.profit !== undefined && order.profit !== null ? formatCurrency(order.profit) : 'N/A'}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <div className="flex flex-col sm:flex-row justify-center items-center space-y-1 sm:space-y-0 sm:space-x-1">
                              <OrderDetailsDialog order={order} />
                              <OrderStatusActionButton order={order} onStatusUpdated={handleOrderCreatedOrUpdated} />
                              <EditOrderDialog order={order} onOrderUpdated={handleOrderCreatedOrUpdated} />
                              {user?.role === 'admin' && order._id && order.orderNumber && (
                                <DeleteOrderButton orderId={order._id} orderNumber={order.orderNumber} onOrderDeleted={handleOrderDeleted} />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-white hover:bg-[#c3223d]"
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
    </div>
  );
}

