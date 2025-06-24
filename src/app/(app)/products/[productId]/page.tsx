'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getProductById } from '@/app/(app)/products/actions';
import { getInventoryMovements } from '@/app/(app)/inventory/actions';
import type { Product } from '@/models/Product';
import type { InventoryMovement, InventoryMovementType } from '@/models/InventoryMovement';
import { InventoryMovementTypeSchema } from '@/models/InventoryMovement';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Package, Calendar, AlertCircle, DollarSign, Tag, Layers, BarChart3, Edit3, History, Search, Filter, X } from "lucide-react";
import NextImage from 'next/image';
import { formatCurrency, cn } from '@/lib/utils';
import { formatToYYYYMMDD, formatToYYYYMMDDWithTime } from '@/lib/date-utils';
import { isBefore, addYears, isValid } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from '@/hooks/use-toast';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  
  // Inventory movements pagination and filters
  const [movementsCurrentPage, setMovementsCurrentPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementsTotalCount, setMovementsTotalCount] = useState(0);
  const [movementsPerPage] = useState(10);
  const [movementsSearchTerm, setMovementsSearchTerm] = useState('');
  const [movementsTypeFilter, setMovementsTypeFilter] = useState<InventoryMovementType | 'all'>('all');
  
  // Batch information pagination and filters
  const [batchesCurrentPage, setBatchesCurrentPage] = useState(1);
  const [batchesPerPage] = useState(5);
  const [batchesSearchTerm, setBatchesSearchTerm] = useState('');

  // Function to get Chinese label for movement type
  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'sale':
        return '銷售';
      case 'adjustment-remove':
        return '庫存調整：扣除';
      case 'adjustment-add':
        return '庫存調整：增加';
      case 'stock-in':
        return '進貨入庫';
      case 'stock-out':
        return '庫存出庫';
      default:
        return type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const fetchInventoryMovements = async (productId: string) => {
    setIsLoadingMovements(true);
    try {
      const result = await getInventoryMovements({
        productId: productId,
        page: movementsCurrentPage,
        limit: movementsPerPage,
        searchTerm: movementsSearchTerm || undefined,
        type: movementsTypeFilter === 'all' ? undefined : movementsTypeFilter,
      });
      setInventoryMovements(result.movements);
      setMovementsTotalPages(result.totalPages);
      setMovementsTotalCount(result.totalCount);
    } catch (error) {
      console.error("Failed to fetch inventory movements:", error);
      toast({
        variant: "destructive",
        title: "載入錯誤",
        description: "無法載入庫存歷史。"
      });
    } finally {
      setIsLoadingMovements(false);
    }
  };

  useEffect(() => {
    async function fetchProduct() {
      if (!productId || typeof productId !== 'string') {
        router.push('/products');
        return;
      }

      setIsLoading(true);
      try {
        // Lấy sản phẩm theo ID
        const product = await getProductById(productId);
        
        if (!product) {
          toast({ 
            variant: "destructive", 
            title: "找不到產品", 
            description: "找不到要求的產品。" 
          });
          router.push('/products');
          return;
        }

        setProduct(product);
        
        // Fetch inventory movements for this product
        await fetchInventoryMovements(productId);
      } catch (error) {
        console.error("Failed to fetch product:", error);
        toast({ 
          variant: "destructive", 
          title: "載入錯誤", 
          description: "無法載入產品詳細資料。" 
        });
        router.push('/products');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProduct();
  }, [productId, router, toast]);

  // Re-fetch movements when page, search, or filter changes
  useEffect(() => {
    if (productId && typeof productId === 'string') {
      fetchInventoryMovements(productId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, movementsCurrentPage, movementsSearchTerm, movementsTypeFilter]);

  // Reset batches pagination when search term changes
  useEffect(() => {
    setBatchesCurrentPage(1);
  }, [batchesSearchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const isLowStock = product.lowStockThreshold !== undefined && 
    product.stock > 0 && 
    product.stock < product.lowStockThreshold;

  let expiryStatus = '';
  if (product.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearFromNow = addYears(today, 1);
    const expiry = new Date(product.expiryDate);

    if (isBefore(expiry, today)) {
      expiryStatus = 'expired';
    } else if (isBefore(expiry, oneYearFromNow)) {
      expiryStatus = 'expiring';
    }
  }

  const hasImages = product.images && product.images.length > 0;
  const currentImage = hasImages ? product.images[currentImageIndex] : null;

  // Filtered and paginated batches
  const filteredBatches = product.batches ? product.batches.filter(batch =>
    batch.batchId.toLowerCase().includes(batchesSearchTerm.toLowerCase()) ||
    (batch.notes && batch.notes.toLowerCase().includes(batchesSearchTerm.toLowerCase()))
  ) : [];

  const batchesTotalPages = Math.ceil(filteredBatches.length / batchesPerPage);
  const paginatedBatches = filteredBatches.slice(
    (batchesCurrentPage - 1) * batchesPerPage,
    batchesCurrentPage * batchesPerPage
  );

  const handleMovementsSearch = () => {
    setMovementsCurrentPage(1);
    // The useEffect will trigger re-fetch
  };

  const handleMovementsClearFilters = () => {
    setMovementsSearchTerm('');
    setMovementsTypeFilter('all');
    setMovementsCurrentPage(1);
  };

  const handleBatchesSearch = () => {
    setBatchesCurrentPage(1);
  };

  const handleBatchesClearFilters = () => {
    setBatchesSearchTerm('');
    setBatchesCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push('/products')}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
          <p className="text-muted-foreground">產品詳細資料</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              產品圖片
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasImages ? (
              <div className="space-y-4">
                <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                  <NextImage
                    src={currentImage!.url}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {product.images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`relative w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0 border-2 transition-colors ${
                          index === currentImageIndex
                            ? 'border-primary'
                            : 'border-transparent hover:border-muted-foreground'
                        }`}
                      >
                        <NextImage
                          src={image.url}
                          alt={`${product.name} ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                <Package className="h-24 w-24 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Information */}
        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                基本資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">SKU</label>
                  <p className="text-foreground">{product.sku || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">分類</label>
                  <p className="text-foreground">{product.categoryName || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">單位</label>
                  <p className="text-foreground">{product.unitOfMeasure || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">庫存</label>
                  <div className="flex items-center gap-2">
                    <p className="text-foreground font-medium">{product.stock}</p>
                    {isLowStock && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Low Stock
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                定價
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">銷售價格</label>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(product.price)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">成本價格</label>
                  <p className="text-xl font-semibold text-muted-foreground">{formatCurrency(product.cost ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Expiry & Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                到期 & 警示
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">到期日期</label>
                <div className="flex items-center gap-2">
                  <p className="text-foreground">{product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : 'N/A'}</p>
                  {expiryStatus === 'expired' && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                  {expiryStatus === 'expiring' && (
                    <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Expires Soon
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">低庫存門檻</label>
                <p className="text-foreground">{product.lowStockThreshold ?? '未設定'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Product Description */}
      {product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              產品描述
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-wrap">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* No Description Message */}
      {!product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              產品描述
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground italic">此產品沒有描述。</p>
          </CardContent>
        </Card>
      )}

      {/* Inventory History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            庫存歷史
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            該商品歷史的所有庫存移動記錄，包括數量和批次到期日期。
            {movementsTotalCount > 0 && ` 找到 ${movementsTotalCount} 筆記錄。`}
          </p>
        </CardHeader>
        <CardContent>
          {/* Search and Filter Controls */}
          <div className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">搜尋</label>
                <Input
                  placeholder="用戶、備註..."
                  value={movementsSearchTerm}
                  onChange={(e) => setMovementsSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleMovementsSearch()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">類型過濾</label>
                <Select 
                  value={movementsTypeFilter} 
                  onValueChange={(value) => setMovementsTypeFilter(value as InventoryMovementType | 'all')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="所有類型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有類型</SelectItem>
                    {InventoryMovementTypeSchema.options.map(type => (
                      <SelectItem key={type} value={type}>{getMovementTypeLabel(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button 
                onClick={handleMovementsSearch} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isLoadingMovements}
              >
                <Search className="mr-2 h-4 w-4" /> 搜尋
              </Button>
              <Button 
                variant="outline" 
                onClick={handleMovementsClearFilters}
                disabled={isLoadingMovements}
              >
                <X className="mr-2 h-4 w-4" /> 清除
              </Button>
            </div>
          </div>
          {isLoadingMovements ? (
            <div className="space-y-3">
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
          ) : inventoryMovements.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">此產品暫無庫存移動記錄。</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">日期</TableHead>
                    <TableHead className="whitespace-nowrap">類型</TableHead>
                    <TableHead className="text-right whitespace-nowrap">數量變更</TableHead>
                    <TableHead className="text-right whitespace-nowrap">庫存前</TableHead>
                    <TableHead className="text-right whitespace-nowrap">庫存後</TableHead>
                    <TableHead className="whitespace-nowrap">批次到期</TableHead>
                    <TableHead className="whitespace-nowrap">用戶</TableHead>
                    <TableHead className="whitespace-nowrap">備註</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryMovements.map((movement) => (
                                         <TableRow key={movement._id}>
                       <TableCell className="whitespace-nowrap">
                         {isValid(new Date(movement.movementDate)) ? 
                           formatToYYYYMMDDWithTime(movement.movementDate) : 
                           '無效日期'
                         }
                       </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge 
                          variant={
                            movement.type === 'stock-in' ? 'default' :
                            movement.type === 'sale' ? 'secondary' :
                            movement.type.startsWith('adjustment') ? 'outline' :
                            'destructive'
                          }
                          className={
                            movement.type === 'stock-in' ? 'bg-green-100 text-green-800 border-green-300' :
                            movement.type === 'sale' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                            movement.type === 'adjustment-remove' || movement.type === 'stock-out' ? 'bg-red-100 text-red-800 border-red-300' :
                            movement.type === 'adjustment-add' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''
                          }
                        >
                          {getMovementTypeLabel(movement.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium whitespace-nowrap ${
                        movement.quantity > 0 ? 'text-green-600' : movement.quantity < 0 ? 'text-red-600' : ''
                      }`}>
                        {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {movement.stockBefore}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {movement.stockAfter}
                      </TableCell>
                                             <TableCell className="whitespace-nowrap">
                         {movement.batchExpiryDate && isValid(new Date(movement.batchExpiryDate)) ? 
                           formatToYYYYMMDD(movement.batchExpiryDate) : 
                           'N/A'
                         }
                       </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {movement.userName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap max-w-xs truncate">
                        {movement.notes || 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination for Inventory History */}
          {movementsTotalPages >= 1 && (
            <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                第 {movementsCurrentPage} 頁，共 {movementsTotalPages} 頁 ({movementsTotalCount} 筆記錄)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMovementsCurrentPage(Math.max(1, movementsCurrentPage - 1))}
                  disabled={movementsCurrentPage === 1 || isLoadingMovements}
                >
                  上一頁
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMovementsCurrentPage(Math.min(movementsTotalPages, movementsCurrentPage + 1))}
                  disabled={movementsCurrentPage === movementsTotalPages || isLoadingMovements}
                >
                  下一頁
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Information */}
      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              批次資訊
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              目前批次的詳細資訊，包括到期日期和剩餘數量。
              找到 {filteredBatches.length} 筆批次記錄。
            </p>
          </CardHeader>
          <CardContent>
            {/* Search Controls for Batches */}
            <div className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">搜尋批次</label>
                  <Input
                    placeholder="批次 ID、備註..."
                    value={batchesSearchTerm}
                    onChange={(e) => setBatchesSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleBatchesSearch()}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleBatchesSearch} 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Search className="mr-2 h-4 w-4" /> 搜尋
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleBatchesClearFilters}
                  >
                    <X className="mr-2 h-4 w-4" /> 清除
                  </Button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">批次 ID</TableHead>
                    <TableHead className="whitespace-nowrap">到期日期</TableHead>
                    <TableHead className="text-right whitespace-nowrap">初始數量</TableHead>
                    <TableHead className="text-right whitespace-nowrap">剩餘數量</TableHead>
                    <TableHead className="whitespace-nowrap">狀態</TableHead>
                    <TableHead className="text-right whitespace-nowrap">單位成本</TableHead>
                    <TableHead className="whitespace-nowrap">備註</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">
                          {batchesSearchTerm ? '找不到符合搜尋條件的批次。' : '此產品暫無批次記錄。'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedBatches.map((batch, index) => {
                     const isExpired = batch.expiryDate && isValid(new Date(batch.expiryDate)) && 
                       new Date(batch.expiryDate) < new Date();
                     const isExpiringSoon = batch.expiryDate && isValid(new Date(batch.expiryDate)) && 
                       !isExpired && new Date(batch.expiryDate) < addYears(new Date(), 1);
                    
                    return (
                      <TableRow key={index}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {batch.batchId}
                        </TableCell>
                                                 <TableCell className="whitespace-nowrap">
                           {batch.expiryDate && isValid(new Date(batch.expiryDate)) ? 
                             formatToYYYYMMDD(batch.expiryDate) : 
                             'N/A'
                           }
                         </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {batch.initialQuantity}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap font-medium">
                          {batch.remainingQuantity}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isExpired ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              已過期
                            </Badge>
                          ) : isExpiringSoon ? (
                            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              即將到期
                            </Badge>
                          ) : batch.remainingQuantity === 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              已用完
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">
                              正常
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrency(batch.costPerUnit || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap max-w-xs truncate">
                          {batch.notes || 'N/A'}
                        </TableCell>
                      </TableRow>
                    );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination for Batches */}
            {batchesTotalPages > 1 && (
              <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  第 {batchesCurrentPage} 頁，共 {batchesTotalPages} 頁 ({filteredBatches.length} 筆批次)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchesCurrentPage(Math.max(1, batchesCurrentPage - 1))}
                    disabled={batchesCurrentPage === 1}
                  >
                    上一頁
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchesCurrentPage(Math.min(batchesTotalPages, batchesCurrentPage + 1))}
                    disabled={batchesCurrentPage === batchesTotalPages}
                  >
                    下一頁
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      {/* Action Buttons */}
      <div className="flex gap-4">
        {/* <Button
          onClick={() => router.push(`/products?edit=${product._id}`)}
          className="flex items-center gap-2"
        >
          <Edit3 className="h-4 w-4" />
          Edit Product
        </Button> */}
        <Button
          variant="outline"
          onClick={() => router.push('/products')}
        >
          返回產品列表
        </Button>
      </div>
    </div>
  );
} 