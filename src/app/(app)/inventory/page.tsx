
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
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, PackageSearch, Search, Filter, X, CalendarIcon, ArrowLeft, ArrowRight } from "lucide-react";
import { format, isValid } from 'date-fns';
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
      const result = await getProducts({limit: 1000}); 
      setProductsForFilter(result.products);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load products for filter." });
    } finally {
      setIsLoadingProductsForFilter(false);
    }
  }, [toast]);

  const fetchInventoryHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getInventoryMovements({
        productId: appliedFilters.productId === "all" ? undefined : appliedFilters.productId,
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
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load inventory history." });
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
        <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
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
                Future Actions
              </CardTitle>
              <CardDescription>Other inventory actions like transfers might go here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">This space is reserved for additional inventory operations.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-lg md:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            Inventory History
          </CardTitle>
          <CardDescription>
            Log of all stock movements. 
            {isLoading && totalMovements === 0 ? " Loading entries..." : ` ${totalMovements} entries found.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTermInventory" className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
                <Input 
                  id="searchTermInventory"
                  placeholder="Product, user, notes..." 
                  value={searchTermInput} 
                  onChange={(e) => setSearchTermInput(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="productFilterInventory" className="block text-sm font-medium text-muted-foreground mb-1">Product</label>
                <Select 
                  value={productIdInput} 
                  onValueChange={(value) => setProductIdInput(value === "all" ? undefined : value)} 
                  disabled={isLoadingProductsForFilter}
                >
                  <SelectTrigger id="productFilterInventory">
                    <SelectValue placeholder={isLoadingProductsForFilter ? "Loading products..." : "All Products"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {productsForFilter.map(p => <SelectItem key={p._id} value={p._id}>{p.name} (SKU: {p.sku || 'N/A'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="typeFilterInventory" className="block text-sm font-medium text-muted-foreground mb-1">Movement Type</label>
                <Select value={movementTypeInput} onValueChange={(value) => setMovementTypeInput(value === "all" ? undefined : value as InventoryMovementType)}>
                  <SelectTrigger id="typeFilterInventory">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {InventoryMovementTypeSchema.options.map(type => (
                      <SelectItem key={type} value={type}>{type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
               <div>
                  <label htmlFor="dateFromInventory" className="block text-sm font-medium text-muted-foreground mb-1">Date From</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateFromInventory"
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
                <label htmlFor="dateToInventory" className="block text-sm font-medium text-muted-foreground mb-1">Date To</label>
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateToInventory"
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !dateToInput && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateToInput ? format(dateToInput, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateToInput} onSelect={setDateToInput} initialFocus disabled={(date) => dateFromInput ? date < dateFromInput : false}/>
                    </PopoverContent>
                  </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" /> Apply Search & Filters
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
                <X className="mr-2 h-4 w-4" /> Clear All
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
              <h3 className="text-xl font-semibold text-foreground">No Inventory Movements Found</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.productId || appliedFilters.movementType || appliedFilters.dateFrom || appliedFilters.dateTo 
                  ? "No records match your current filters or search term."
                  : "There are no inventory movements recorded yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty Change</TableHead>
                      <TableHead className="text-right">Stock Before</TableHead>
                      <TableHead className="text-right">Stock After</TableHead>
                      <TableHead>Batch Expiry</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Notes/Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((move) => (
                      <TableRow key={move._id}>
                        <TableCell>{isValid(new Date(move.movementDate)) ? format(new Date(move.movementDate), 'dd/MM/yy HH:mm') : 'Invalid Date'}</TableCell>
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
                          {move.quantity > 0 ? `+${move.quantity}`: move.quantity}
                        </TableCell>
                        <TableCell className="text-right">{move.stockBefore}</TableCell>
                        <TableCell className="text-right">{move.stockAfter}</TableCell>
                        <TableCell>{move.batchExpiryDate && isValid(new Date(move.batchExpiryDate)) ? format(new Date(move.batchExpiryDate), 'dd/MM/yy') : 'N/A'}</TableCell>
                        <TableCell>{move.userName}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{move.notes || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
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

