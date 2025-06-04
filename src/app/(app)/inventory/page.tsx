"use client";

import { useEffect, useState, useCallback } from 'react';
import { StockInForm } from '@/components/inventory/StockInForm';
import { StockAdjustmentForm } from '@/components/inventory/StockAdjustmentForm';
import { getInventoryMovements } from '@/app/(app)/inventory/actions';
import type { Product } from '@/models/Product';
import { getProducts } from '@/app/(app)/products/actions';
import type { InventoryMovement, InventoryMovementType } from '@/models/InventoryMovement';
import { InventoryMovementTypeSchema } from '@/models/InventoryMovement';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
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
import { History, Loader2, PackageSearch, Search, Filter, X, CalendarIcon, ArrowLeft, ArrowRight, CheckIcon, ChevronsUpDown } from "lucide-react";
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
      // setCurrentPage(result.currentPage); // Backend might adjust page
    } catch (error) {
      console.error("Failed to fetch inventory history:", error);
      toast({ variant: "destructive", title: "載入錯誤", description: "無法載入庫存歷史。" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, appliedFilters, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchProductsForFilterDropdown();
  }, [fetchProductsForFilterDropdown]);

  useEffect(() => {
    fetchInventoryHistory();
  }, [fetchInventoryHistory]);

  const handleStockOperationRecorded = () => {
    fetchInventoryHistory();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">庫存管理</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <StockInForm onStockInRecorded={handleStockOperationRecorded} />
        </div>
        <div className="md:col-span-1">
          <StockAdjustmentForm onStockAdjusted={handleStockOperationRecorded} />
        </div>
        <div className="md:col-span-1">
          <Card className="shadow-lg h-full">
            <CardHeader>
              <CardTitle className="flex items-center">
                未來動作
              </CardTitle>
              <CardDescription>其他庫存操作可能會放在這裡。</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">這個空間保留給其他庫存操作。</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-lg md:col-span-3">
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
                      <SelectItem key={type} value={type}>{type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
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

          {isLoading && movements.length === 0 && totalMovements === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                      <TableHead>日期</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>類型</TableHead>
                      <TableHead className="text-right">數量變更</TableHead>
                      <TableHead className="text-right">庫存前</TableHead>
                      <TableHead className="text-right">庫存後</TableHead>
                      <TableHead>批次到期</TableHead>
                      <TableHead>用戶</TableHead>
                      <TableHead>備註/原因</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((move) => (
                      <TableRow key={move._id}>
                        <TableCell>{isValid(new Date(move.movementDate)) ? formatToYYYYMMDDWithTime(move.movementDate) : '無效日期'}</TableCell>
                        <TableCell className="font-medium">{move.productName}</TableCell>
                        <TableCell>
                          <Badge variant={
                            move.type === 'stock-in' ? 'default' :
                              move.type === 'sale' ? 'secondary' :
                                move.type.startsWith('adjustment') ? 'outline' :
                                  'destructive'
                          }
                            className={
                              move.type === 'stock-in' ? 'bg-green-100 text-green-800 border-green-300' :
                                move.type === 'sale' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                  move.type === 'adjustment-remove' || move.type === 'stock-out' ? 'bg-red-100 text-red-800 border-red-300' :
                                    move.type === 'adjustment-add' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''
                            }
                          >
                            {move.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${move.quantity > 0 ? 'text-green-600' : move.quantity < 0 ? 'text-red-600' : ''}`}>
                          {move.quantity > 0 ? `+${move.quantity}` : move.quantity}
                        </TableCell>
                        <TableCell className="text-right">{move.stockBefore}</TableCell>
                        <TableCell className="text-right">{move.stockAfter}</TableCell>
                        <TableCell>{move.batchExpiryDate && isValid(new Date(move.batchExpiryDate)) ? formatToYYYYMMDD(move.batchExpiryDate) : 'N/A'}</TableCell>
                        <TableCell>{move.userName}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{move.notes || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
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

