"use client";

import { useEffect, useState, useCallback } from 'react';
import { getInventoryMovements } from '@/app/(app)/inventory/actions';
import type { InventoryMovement } from '@/models/InventoryMovement';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageSearch, CalendarIcon, UserCircle2 } from "lucide-react";
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProductStockInHistoryDialogProps {
  productId: string;
}

export function ProductStockInHistoryDialog({ productId }: ProductStockInHistoryDialogProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchStockInHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getInventoryMovements({ productId, type: 'stock-in' });
      setMovements(result.movements);
    } catch (error) {
      console.error("Failed to fetch stock-in history:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load stock-in history for this product." });
      setMovements([]);
    } finally {
      setIsLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    if (productId) {
      fetchStockInHistory();
    }
  }, [productId, fetchStockInHistory]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold text-foreground">No Stock-In History Found</h3>
        <p className="text-muted-foreground">This product has no recorded stock-in movements.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[60vh] pr-4">
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
              <TableCell>{format(new Date(move.movementDate), 'dd/MM/yyyy HH:mm')}</TableCell>
              <TableCell className="text-right font-medium text-green-600">
                +{move.quantity}
              </TableCell>
              <TableCell>
                {move.batchExpiryDate ? format(new Date(move.batchExpiryDate), 'dd/MM/yyyy') : <Badge variant="outline">N/A</Badge>}
              </TableCell>
              <TableCell className="flex items-center">
                <UserCircle2 className="mr-1.5 h-4 w-4 text-muted-foreground" />
                {move.userName}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
