
"use client";

import { useEffect, useState, useCallback } from 'react';
import { StockInForm } from '@/components/inventory/StockInForm';
import { StockAdjustmentForm } from '@/components/inventory/StockAdjustmentForm'; // Import the new form
import { getInventoryMovements } from '@/app/(app)/inventory/actions';
import type { InventoryMovement } from '@/models/InventoryMovement';
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
import { Badge } from "@/components/ui/badge";
import { ArrowUpFromLine, History, Loader2, PackageSearch, Edit } from "lucide-react"; // Added Edit icon
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function InventoryPage() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { toast } = useToast();

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const fetchedMovements = await getInventoryMovements();
      setMovements(fetchedMovements);
    } catch (error) {
      console.error("Failed to fetch inventory history:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load inventory history." });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleStockOperationRecorded = () => {
    fetchHistory(); // Refresh history after new stock-in or adjustment
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
        {/* Placeholder for future quick actions or overall stats */}
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <StockInForm onStockInRecorded={handleStockOperationRecorded} />
        </div>

        <div className="md:col-span-1">
          {/* Replaced placeholder with the new StockAdjustmentForm */}
          <StockAdjustmentForm onStockAdjusted={handleStockOperationRecorded} />
        </div>
        
        <div className="md:col-span-1">
          {/* Placeholder for future functionality, e.g. Stock Transfer Form */}
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

      <Card className="shadow-lg md:col-span-3"> {/* Ensure history table takes full width below forms */}
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            Inventory History
          </CardTitle>
          <CardDescription>Log of all recent stock movements. Latest 100 entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageSearch className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Inventory Movements Yet</h3>
              <p className="text-muted-foreground">Stock in some items or make adjustments to see history here.</p>
            </div>
          ) : (
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
                      <TableCell>{format(new Date(move.movementDate), 'dd/MM/yy HH:mm')}</TableCell>
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
                      <TableCell>{move.batchExpiryDate ? format(new Date(move.batchExpiryDate), 'dd/MM/yy') : 'N/A'}</TableCell>
                      <TableCell>{move.userName}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{move.notes || 'N/A'}</TableCell>
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
