
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

const ITEMS_PER_PAGE = 10;

export default function InventoryPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Filters and Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [selectedMovementType, setSelectedMovementType] = useState<InventoryMovementType | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMovements, setTotalMovements] = useState(0);


  const fetchProductsForFilter = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const result = await getProducts(); // getProducts now returns an object
      setProducts(result.products); // Correctly access the products array
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load products for filter." });
    } finally {
      setIsLoadingProducts(false);
    }
  }, [toast]);

  const fetchHistory = useCallback(async (page = 1) => {
    setIsLoadingHistory(true);
    try {
      const result = await getInventoryMovements({
        productId: selectedProductId === "all" ? undefined : selectedProductId, // Handle "all" case
        type: selectedMovementType,
        dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
        dateTo: dateTo ? dateTo.toISOString() : undefined,
        searchTerm: appliedSearchTerm,
        page,
        limit: ITEMS_PER_PAGE,
      });
      setMovements(result.movements);
      setTotalPages(result.totalPages);
      setTotalMovements(result.totalCount);
      setCurrentPage(result.currentPage);
    } catch (error) {
      console.error("Failed to fetch inventory history:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load inventory history." });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [toast, selectedProductId, selectedMovementType, dateFrom, dateTo, appliedSearchTerm]);

  useEffect(() => {
    fetchProductsForFilter();
    // fetchHistory(1); // Initial fetch for page 1 - This is now handled by the second useEffect
  }, [fetchProductsForFilter]);
  
  // Re-fetch when appliedSearchTerm or filters change, resetting to page 1
  useEffect(() => {
    fetchHistory(1);
  }, [selectedProductId, selectedMovementType, dateFrom, dateTo, appliedSearchTerm, fetchHistory]);


  const handleStockOperationRecorded = () => {
    fetchHistory(currentPage); // Refresh current page of history
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAppliedSearchTerm(searchTerm);
    setCurrentPage(1); // Reset to first page on new search/filter
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setAppliedSearchTerm('');
    setSelectedProductId(undefined);
    setSelectedMovementType(undefined);
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1); // Reset to first page
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchHistory(newPage);
    }
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
          <CardDescription>Log of all stock movements. {totalMovements} entries found.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter and Search Section */}
          <form onSubmit={handleSearchSubmit} className="mb-6 space-y-4 p-4 border rounded-lg shadow-sm bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div className="lg:col-span-1">
                <label htmlFor="searchTerm" className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
                <Input 
                  id="searchTerm"
                  placeholder="Product, user, notes..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                />
              </div>
              <div>
                <label htmlFor="productFilter" className="block text-sm font-medium text-muted-foreground mb-1">Product</label>
                <Select 
                  value={selectedProductId} 
                  onValueChange={(value) => setSelectedProductId(value === "all" ? undefined : value)} 
                  disabled={isLoadingProducts}
                >
                  <SelectTrigger id="productFilter">
                    <SelectValue placeholder={isLoadingProducts ? "Loading products..." : "All Products"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products.map(p => <SelectItem key={p._id} value={p._id}>{p.name} (SKU: {p.sku || 'N/A'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="typeFilter" className="block text-sm font-medium text-muted-foreground mb-1">Movement Type</label>
                <Select value={selectedMovementType} onValueChange={(value) => setSelectedMovementType(value === "all" ? undefined : value as InventoryMovementType)}>
                  <SelectTrigger id="typeFilter">
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
                  <label htmlFor="dateFrom" className="block text-sm font-medium text-muted-foreground mb-1">Date From</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateFrom"
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                    </PopoverContent>
                  </Popover>
              </div>
              <div>
                <label htmlFor="dateTo" className="block text-sm font-medium text-muted-foreground mb-1">Date To</label>
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="dateTo"
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus disabled={(date) => dateFrom ? date < dateFrom : false}/>
                    </PopoverContent>
                  </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Search className="mr-2 h-4 w-4" /> Apply Search & Filters
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" /> Clear All
              </Button>
            </div>
          </form>

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Inventory Movements Found</h3>
              <p className="text-muted-foreground">No records match your current filters or search term.</p>
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
                        <TableCell className={`text-right font-medium ${move.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
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
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage - 1)} 
                    disabled={currentPage === 1 || isLoadingHistory}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage + 1)} 
                    disabled={currentPage === totalPages || isLoadingHistory}
                  >
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

