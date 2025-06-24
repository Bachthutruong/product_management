"use client";

import { useEffect, useState, useCallback } from 'react';
import { getInventoryMovements, recordStockIn, recordStockAdjustment, undoInventoryMovement, redoInventoryMovement } from '@/app/(app)/inventory/actions';
import type { Product } from '@/models/Product';
import { getProducts } from '@/app/(app)/products/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import { useAuth } from '@/hooks/useAuth';
import type { InventoryMovement, InventoryMovementType } from '@/models/InventoryMovement';
import { InventoryMovementTypeSchema } from '@/models/InventoryMovement';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, PackageSearch, Search, Filter, X, CalendarIcon, ArrowLeft, ArrowRight, CheckIcon, ChevronsUpDown, Package, Warehouse, Undo2, Redo2 } from "lucide-react";
import { format, isValid } from 'date-fns';
import { formatToYYYYMMDDWithTime, formatToYYYYMMDD, formatForCalendarDisplay } from '@/lib/date-utils';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1]; // Default to 10

interface InventoryFilters {
  searchTerm: string;
  productId: string | undefined;
  movementType: InventoryMovementType | undefined;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

export default function InventoryPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Unified form states
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [batchExpiryDate, setBatchExpiryDate] = useState<Date | undefined>(undefined);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Product and category data
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [openProductPopover, setOpenProductPopover] = useState(false);

  const [productsForFilter, setProductsForFilter] = useState<Product[]>([]);
  const [isLoadingProductsForFilter, setIsLoadingProductsForFilter] = useState(true);
  const [productFilterSearch, setProductFilterSearch] = useState('');
  const [openProductFilterPopover, setOpenProductFilterPopover] = useState(false);

  // Filter Inputs
  const [searchTermInput, setSearchTermInput] = useState('');
  const [productIdInput, setProductIdInput] = useState<string | undefined>(undefined);
  const [movementTypeInput, setMovementTypeInput] = useState<InventoryMovementType | undefined>(undefined);
  const [dateFromInput, setDateFromInput] = useState<Date | undefined>(undefined);
  const [dateToInput, setDateToInput] = useState<Date | undefined>(undefined);

  // Applied Filters for API
  const [appliedFilters, setAppliedFilters] = useState<InventoryFilters>({
    searchTerm: '',
    productId: undefined,
    movementType: undefined,
    dateFrom: undefined,
    dateTo: undefined,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMovements, setTotalMovements] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);
  const [undoingMovements, setUndoingMovements] = useState<Set<string>>(new Set());
  const [redoingMovements, setRedoingMovements] = useState<Set<string>>(new Set());

  // Fetch products and categories
  const fetchProductsAndCategories = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        getProducts({ limit: 1000 }),
        getCategories({ limit: 1000 })
      ]);
      
      setProducts(productsResult.products);
      setFilteredProducts(productsResult.products);
      setCategories(categoriesResult.categories || []);
    } catch (error) {
      toast({ variant: "destructive", title: "錯誤", description: "無法載入商品和分類。" });
    } finally {
      setIsLoadingProducts(false);
    }
  }, [toast]);

  const fetchProductsForFilterDropdown = useCallback(async () => {
    setIsLoadingProductsForFilter(true);
    try {
      const result = await getProducts({ limit: 1000 });
      setProductsForFilter(result.products);
    } catch (error) {
      toast({ variant: "destructive", title: "錯誤", description: "無法載入商品過濾器。" });
    } finally {
      setIsLoadingProductsForFilter(false);
    }
  }, [toast]);

  const fetchInventoryHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getInventoryMovements({
        productId: appliedFilters.productId === "all" ? undefined : appliedFilters.productId,
        // @ts-ignore
        type: appliedFilters.movementType === "all" ? undefined : appliedFilters.movementType,
        dateFrom: appliedFilters.dateFrom ? appliedFilters.dateFrom.toISOString() : undefined,
        dateTo: appliedFilters.dateTo ? appliedFilters.dateTo.toISOString() : undefined,
        searchTerm: appliedFilters.searchTerm,
        page: currentPage,
        limit: itemsPerPage,
      });
      setMovements(result.movements);
      setTotalPages(result.totalPages);
      setTotalMovements(result.totalCount);
    } catch (error) {
      console.error("Failed to fetch inventory history:", error);
      toast({ variant: "destructive", title: "載入錯誤", description: "無法載入庫存歷史。" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, appliedFilters, currentPage, itemsPerPage]);

  // Filter products by category
  useEffect(() => {
    if (selectedCategoryId && selectedCategoryId !== 'all') {
      const filtered = products.filter(product => product.categoryId === selectedCategoryId);
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
    setSelectedProductId(''); // Reset product selection when category changes
  }, [selectedCategoryId, products]);

  useEffect(() => {
    fetchProductsAndCategories();
    fetchProductsForFilterDropdown();
  }, [fetchProductsAndCategories, fetchProductsForFilterDropdown]);

  useEffect(() => {
    fetchInventoryHistory();
  }, [fetchInventoryHistory]);

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({ variant: "destructive", title: "認證錯誤", description: "您必須登入。" });
      return;
    }

    if (!selectedProductId) {
      toast({ variant: "destructive", title: "錯誤", description: "請選擇商品。" });
      return;
    }

    if (quantity === 0) {
      toast({ variant: "destructive", title: "錯誤", description: "數量不能為零。" });
      return;
    }

    const isPositive = quantity > 0;
    
    // 正數 = 入庫，負數 = 調整
    if (isPositive && !batchExpiryDate) {
      toast({ variant: "destructive", title: "錯誤", description: "入庫時批次到期日期為必填項目。" });
      return;
    }

    if (!isPositive && !adjustmentReason.trim()) {
      toast({ variant: "destructive", title: "錯誤", description: "庫存調整時原因為必填項目。" });
      return;
    }

    setIsSubmitting(true);
    try {
      let result;

      if (isPositive) {
        // 正數 = 入庫
        result = await recordStockIn({
          productId: selectedProductId,
          quantity: quantity,
          batchExpiryDate: batchExpiryDate!,
          userId: user._id,
        }, user);
      } else {
        // 負數 = 調整
        result = await recordStockAdjustment({
          productId: selectedProductId,
          quantityChange: quantity,
          reason: adjustmentReason.trim(),
          notes: notes.trim() || undefined,
        }, user);
      }

      if (result.success) {
        toast({
          title: "成功",
          description: isPositive ? "庫存入庫記錄已新增。" : "庫存調整已完成。",
        });

        // Reset form
        setSelectedCategoryId('all');
        setSelectedProductId('');
        setQuantity(0);
        setBatchExpiryDate(undefined);
        setAdjustmentReason('');
        setNotes('');

        // Refresh inventory history
        fetchInventoryHistory();
      } else {
        toast({
          variant: "destructive",
          title: "錯誤",
          description: result.error || "操作失敗。",
        });
      }
    } catch (error) {
      console.error('Error submitting inventory operation:', error);
      toast({
        variant: "destructive",
        title: "錯誤",
        description: error instanceof Error ? error.message : "操作失敗，請稍後再試。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      searchTerm: searchTermInput,
      productId: productIdInput,
      movementType: movementTypeInput,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTermInput('');
    setProductIdInput(undefined);
    setMovementTypeInput(undefined);
    setDateFromInput(undefined);
    setDateToInput(undefined);
    setAppliedFilters({
      searchTerm: '',
      productId: undefined,
      movementType: undefined,
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

  const handleUndoMovement = async (movementId: string) => {
    if (!user) {
      toast({ variant: "destructive", title: "錯誤", description: "您必須登入才能執行此操作。" });
      return;
    }

    if (user.role !== 'admin') {
      toast({ variant: "destructive", title: "權限不足", description: "只有管理員可以撤銷庫存移動。" });
      return;
    }

    setUndoingMovements(prev => new Set(prev).add(movementId));

    try {
      console.log('Calling undo for movement:', movementId);
      const result = await undoInventoryMovement(movementId, user);
      console.log('Undo result:', result);
      
      if (result.success) {
        toast({
          title: "成功",
          description: "庫存移動已成功撤銷，數量已更新。",
        });
        
        // Force refresh the inventory history
        console.log('Refreshing inventory history...');
        await fetchInventoryHistory();
        console.log('Inventory history refreshed');
      } else {
        toast({
          variant: "destructive",
          title: "撤銷失敗",
          description: result.error || "撤銷庫存移動時發生錯誤。",
        });
      }
    } catch (error) {
      console.error('Error undoing movement:', error);
      toast({
        variant: "destructive",
        title: "錯誤",
        description: "撤銷庫存移動時發生意外錯誤。",
      });
    } finally {
      setUndoingMovements(prev => {
        const newSet = new Set(prev);
        newSet.delete(movementId);
        return newSet;
      });
    }
  };

  const handleRedoMovement = async (movementId: string) => {
    if (!user) {
      toast({ variant: "destructive", title: "錯誤", description: "您必須登入才能執行此操作。" });
      return;
    }

    if (user.role !== 'admin') {
      toast({ variant: "destructive", title: "權限不足", description: "只有管理員可以重做庫存移動。" });
      return;
    }

    setRedoingMovements(prev => new Set(prev).add(movementId));

    try {
      const result = await redoInventoryMovement(movementId, user);
      
      if (result.success) {
        toast({
          title: "成功",
          description: "庫存移動已成功重做，已恢復原始狀態。",
        });
        
        // Refresh the inventory history to show updated state
        await fetchInventoryHistory();
      } else {
        toast({
          variant: "destructive",
          title: "重做失敗",
          description: result.error || "重做庫存移動時發生錯誤。",
        });
      }
    } catch (error) {
      console.error('Error redoing movement:', error);
      toast({
        variant: "destructive",
        title: "錯誤",
        description: "重做庫存移動時發生意外錯誤。",
      });
    } finally {
      setRedoingMovements(prev => {
        const newSet = new Set(prev);
        newSet.delete(movementId);
        return newSet;
      });
    }
  };

  const selectedProduct = products.find(p => p._id === selectedProductId);

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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">需要登入</h2>
          <p className="text-muted-foreground">您必須登入才能使用庫存管理功能。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">庫存管理</h1>
      </div>

      {/* Unified Inventory Operation Form */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Warehouse className="mr-2 h-6 w-6 text-primary" />
            庫存操作
          </CardTitle>
          <CardDescription>
            統一庫存操作：輸入正數進行入庫，輸入負數進行調整。填寫相關資訊，正數時需填批次到期日期，負數時需填調整原因。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Category */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  產品分類 <span className="text-xs text-muted-foreground">(可選擇，若無則顯示全部)</span>
                </label>
                                 <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                   <SelectTrigger>
                     <SelectValue placeholder="選擇產品分類 (可留空顯示全部)" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">全部分類</SelectItem>
                     {categories.map((category) => (
                       <SelectItem key={category._id} value={category._id}>
                         {category.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
              </div>

              {/* Product Selection */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">產品 *</label>
                <Popover open={openProductPopover} onOpenChange={setOpenProductPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !selectedProductId && "text-muted-foreground"
                      )}
                      disabled={isLoadingProducts}
                    >
                      {selectedProductId
                        ? products.find(p => p._id === selectedProductId)?.name || "選擇產品"
                        : "選擇產品"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="搜尋產品..."
                        value={productSearch}
                        onValueChange={setProductSearch}
                      />
                      <CommandList>
                        <CommandEmpty>找不到產品。</CommandEmpty>
                        <CommandGroup>
                          {filteredProducts
                            .filter(p => 
                              p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                              (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
                            )
                            .map((product) => (
                              <CommandItem
                                key={product._id}
                                value={product.name}
                                onSelect={() => {
                                  setSelectedProductId(product._id);
                                  setOpenProductPopover(false);
                                  setProductSearch('');
                                }}
                              >
                                <CheckIcon
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    product._id === selectedProductId
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{product.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    SKU: {product.sku || 'N/A'} | 庫存: {product.stock}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  數量變更 *
                </label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  placeholder="正數=入庫，負數=調整減少"
                />
                {selectedProduct && (
                  <p className="text-xs text-muted-foreground mt-1">
                    目前庫存: {selectedProduct.stock}
                  </p>
                )}
              </div>

              {/* Batch Expiry Date (for positive quantity) */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  批次到期日期 <span className="text-red-500">(入庫時必填)</span>
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !batchExpiryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {batchExpiryDate ? formatForCalendarDisplay(batchExpiryDate) : <span>選擇日期</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <DatePickerCalendar
                      selected={batchExpiryDate}
                      onSelect={setBatchExpiryDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Adjustment Reason (for negative quantity) */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                調整原因 <span className="text-red-500">(調整減少時必填)</span>
              </label>
              <Input
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="例如：商品損壞、庫存盤點修正"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                其他備註 <span className="text-xs text-muted-foreground">(選填)</span>
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="關於此次庫存操作的任何額外詳細資訊..."
                rows={3}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isSubmitting || !selectedProductId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : (
                <>
                  <Warehouse className="mr-2 h-4 w-4" />
                  記錄庫存操作
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Inventory History */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            庫存歷史
          </CardTitle>
          <CardDescription>
            所有庫存移動的記錄。
            {isLoading && totalMovements === 0 ? " 載入中..." : ` 找到 ${totalMovements} 筆記錄。`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTermInventory" className="block text-sm font-medium text-muted-foreground mb-1">搜尋</label>
                <Input
                  id="searchTermInventory"
                  placeholder="商品, 用戶, 備註..."
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="productFilterInventory" className="block text-sm font-medium text-muted-foreground mb-1">商品</label>
                <Popover open={openProductFilterPopover} onOpenChange={setOpenProductFilterPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      id="productFilterInventory"
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !productIdInput && "text-muted-foreground"
                      )}
                      disabled={isLoadingProductsForFilter}
                    >
                      {productIdInput && productIdInput !== "all"
                        ? productsForFilter.find(p => p._id === productIdInput)?.name || "所有商品"
                        : "所有商品"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="搜尋商品..."
                        value={productFilterSearch}
                        onValueChange={setProductFilterSearch}
                      />
                      <CommandList>
                        <CommandEmpty>找不到商品。</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setProductIdInput(undefined);
                              setOpenProductFilterPopover(false);
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                "mr-2 h-4 w-4",
                                !productIdInput || productIdInput === "all"
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            所有商品
                          </CommandItem>
                          {productsForFilter
                            .filter(p => 
                              p.name.toLowerCase().includes(productFilterSearch.toLowerCase()) ||
                              (p.sku && p.sku.toLowerCase().includes(productFilterSearch.toLowerCase()))
                            )
                            .map((product) => (
                              <CommandItem
                                key={product._id}
                                value={product.name}
                                onSelect={() => {
                                  setProductIdInput(product._id);
                                  setOpenProductFilterPopover(false);
                                }}
                              >
                                <CheckIcon
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    product._id === productIdInput
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {product.name} (SKU: {product.sku || 'N/A'})
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label htmlFor="typeFilterInventory" className="block text-sm font-medium text-muted-foreground mb-1">動作類型</label>
                <Select value={movementTypeInput} onValueChange={(value) => setMovementTypeInput(value === "all" ? undefined : value as InventoryMovementType)}>
                  <SelectTrigger id="typeFilterInventory">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label htmlFor="dateFromInventory" className="block text-sm font-medium text-muted-foreground mb-1">從</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dateFromInventory"
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
                <label htmlFor="dateToInventory" className="block text-sm font-medium text-muted-foreground mb-1">至</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dateToInventory"
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
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" /> 應用搜尋 & 過濾
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
                <X className="mr-2 h-4 w-4" /> 清除所有
              </Button>
            </div>
          </form>

          {isLoading && movements.length === 0 ? (
            <div className="space-y-3">
              {/* Skeleton table */}
              <div className="animate-pulse">
                <div className={`grid gap-4 py-2 border-b ${user?.role === 'admin' ? 'grid-cols-10' : 'grid-cols-9'}`}>
                  {Array.from({ length: user?.role === 'admin' ? 10 : 9 }, (_, i) => (
                    <div key={i} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={`grid gap-4 py-3 ${user?.role === 'admin' ? 'grid-cols-10' : 'grid-cols-9'}`}>
                    {Array.from({ length: user?.role === 'admin' ? 10 : 9 }, (_, j) => (
                      <div key={j} className="h-4 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">找不到庫存移動</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.productId || appliedFilters.movementType || appliedFilters.dateFrom || appliedFilters.dateTo
                  ? "找不到符合目前過濾器或搜尋條件的記錄。"
                  : "目前沒有任何庫存移動記錄。"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">日期</TableHead>
                      <TableHead className="whitespace-nowrap">商品</TableHead>
                      <TableHead className="whitespace-nowrap">類型</TableHead>
                      <TableHead className="text-right whitespace-nowrap">數量變更</TableHead>
                      <TableHead className="text-right whitespace-nowrap">庫存前</TableHead>
                      <TableHead className="text-right whitespace-nowrap">庫存後</TableHead>
                      <TableHead className="whitespace-nowrap">批次到期</TableHead>
                      <TableHead className="whitespace-nowrap">用戶</TableHead>
                      <TableHead className="whitespace-nowrap">備註/原因</TableHead>
                      {user?.role === 'admin' && <TableHead className="whitespace-nowrap">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                                      {movements.map((move) => {
                    // @ts-ignore - isUndone might not be in type but exists in database
                    const isUndone = move.isUndone === true;
                    // @ts-ignore - undoNotes might not be in type but exists in database  
                    const undoNotes = move.undoNotes;
                    
                    return (
                      <TableRow key={move._id} className={isUndone ? 'opacity-60 bg-muted/30' : ''}>
                        <TableCell className="whitespace-nowrap">{isValid(new Date(move.movementDate)) ? formatToYYYYMMDDWithTime(move.movementDate) : '無效日期'}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {move.productName}
                            {isUndone && (
                              <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                                已撤銷
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={
                            move.type === 'stock-in' ? 'default' :
                              move.type === 'sale' ? 'secondary' :
                                move.type.startsWith('adjustment') ? 'outline' :
                                  'destructive'
                          }
                            className={cn(
                              move.type === 'stock-in' ? 'bg-green-100 text-green-800 border-green-300' :
                                move.type === 'sale' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                  move.type === 'adjustment-remove' || move.type === 'stock-out' ? 'bg-red-100 text-red-800 border-red-300' :
                                    move.type === 'adjustment-add' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                              isUndone ? 'opacity-60' : ''
                            )}
                          >
                            {getMovementTypeLabel(move.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium whitespace-nowrap",
                          move.quantity > 0 ? 'text-green-600' : move.quantity < 0 ? 'text-red-600' : '',
                          isUndone ? 'line-through opacity-60' : ''
                        )}>
                          {move.quantity > 0 ? `+${move.quantity}` : move.quantity}
                        </TableCell>
                        <TableCell className={cn("text-right whitespace-nowrap", isUndone ? 'opacity-60' : '')}>{move.stockBefore}</TableCell>
                        <TableCell className={cn("text-right whitespace-nowrap", isUndone ? 'opacity-60' : '')}>{move.stockAfter}</TableCell>
                        <TableCell className={cn("whitespace-nowrap", isUndone ? 'opacity-60' : '')}>{move.batchExpiryDate && isValid(new Date(move.batchExpiryDate)) ? formatToYYYYMMDD(move.batchExpiryDate) : 'N/A'}</TableCell>
                        <TableCell className={cn("whitespace-nowrap", isUndone ? 'opacity-60' : '')}>{move.userName}</TableCell>
                        <TableCell className={cn("text-xs max-w-xs truncate whitespace-nowrap overflow-hidden text-ellipsis", isUndone ? 'opacity-60' : '')}>
                          {isUndone && undoNotes ? undoNotes : (move.notes || 'N/A')}
                        </TableCell>
                        {user?.role === 'admin' && (
                          <TableCell className="whitespace-nowrap">
                            {move.type !== 'sale' ? (
                              isUndone ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRedoMovement(move._id)}
                                  disabled={redoingMovements.has(move._id)}
                                  className="h-8 px-2 text-xs hover:bg-blue-500 hover:text-white border-blue-500 text-blue-600"
                                >
                                  {redoingMovements.has(move._id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Redo2 className="h-3 w-3" />
                                  )}
                                  <span className="ml-1">重做</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUndoMovement(move._id)}
                                  disabled={undoingMovements.has(move._id)}
                                  className="h-8 px-2 text-xs hover:bg-destructive hover:text-destructive-foreground"
                                >
                                  {undoingMovements.has(move._id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Undo2 className="h-3 w-3" />
                                  )}
                                  <span className="ml-1">撤銷</span>
                                </Button>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">不可撤銷</span>
                            )}
                          </TableCell>
                        )}
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

