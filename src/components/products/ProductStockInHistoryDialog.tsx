"use client";

import { useEffect, useState, useCallback } from 'react';
import { getInventoryMovements } from '@/app/(app)/inventory/actions';
import { getProductById } from '@/app/(app)/products/actions';
import type { InventoryMovement } from '@/models/InventoryMovement';
import type { Product, ProductBatch } from '@/models/Product';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageSearch, CalendarIcon, UserCircle2, Package } from "lucide-react";
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatToYYYYMMDDWithTime, formatToYYYYMMDD } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductStockInHistoryDialogProps {
  productId: string;
}

export function ProductStockInHistoryDialog({ productId }: ProductStockInHistoryDialogProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch both inventory movements and product with batches
      const [movementsResult, productData] = await Promise.all([
        getInventoryMovements({ productId, type: 'stock-in' }),
        getProductById(productId)
      ]);
      
      setMovements(movementsResult.movements);
      setProduct(productData);
    } catch (error) {
      console.error("Failed to fetch stock data:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load stock information for this product." });
      setMovements([]);
      setProduct(null);
    } finally {
      setIsLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    if (productId) {
      fetchData();
    }
  }, [productId, fetchData]);

  const isExpired = (date: Date) => {
    return new Date(date) < new Date();
  };

  const isNearExpiry = (date: Date) => {
    const today = new Date();
    const daysUntilExpiry = Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0; // Near expiry within 30 days
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasData = movements.length > 0 || (product?.batches && product.batches.length > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold text-foreground">No Stock Information Found</h3>
        <p className="text-muted-foreground">This product has no recorded stock movements or batches.</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="batches" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="batches">Current Batches</TabsTrigger>
        <TabsTrigger value="history">Stock-In History</TabsTrigger>
      </TabsList>

      <TabsContent value="batches" className="mt-4">
        <ScrollArea className="h-[60vh] pr-4">
          {product?.batches && product.batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead className="text-right">Initial Qty</TableHead>
                  <TableHead className="text-right">Remaining Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.batches.map((batch: ProductBatch) => (
                  <TableRow key={batch.batchId}>
                    <TableCell className="font-medium">{batch.batchId}</TableCell>
                    <TableCell>{formatToYYYYMMDD(batch.expiryDate)}</TableCell>
                    <TableCell className="text-right">{batch.initialQuantity}</TableCell>
                    <TableCell className="text-right font-medium">
                      {batch.remainingQuantity}
                    </TableCell>
                    <TableCell>
                      {batch.remainingQuantity === 0 ? (
                        <Badge variant="outline">Out of Stock</Badge>
                      ) : isExpired(batch.expiryDate) ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : isNearExpiry(batch.expiryDate) ? (
                        <Badge variant="secondary">Near Expiry</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {batch.costPerUnit ? formatCurrency(batch.costPerUnit) : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Package className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No batches found for this product.</p>
            </div>
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <ScrollArea className="h-[60vh] pr-4">
          {movements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock-In Date</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Batch Expiry</TableHead>
                  <TableHead>Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((move) => (
                  <TableRow key={move._id}>
                    <TableCell>{formatToYYYYMMDDWithTime(move.movementDate)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      +{move.quantity}
                    </TableCell>
                    <TableCell>
                      {move.batchExpiryDate ? formatToYYYYMMDD(move.batchExpiryDate) : <Badge variant="outline">N/A</Badge>}
                    </TableCell>
                    <TableCell className="flex items-center">
                      <UserCircle2 className="mr-1.5 h-4 w-4 text-muted-foreground" />
                      {move.userName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No stock-in history found.</p>
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
