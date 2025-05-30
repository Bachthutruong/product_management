
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RecordStockAdjustmentInputSchema, type RecordStockAdjustmentInput } from '@/models/InventoryMovement';
import type { Product } from '@/models/Product';
import { getProducts } from '@/app/(app)/products/actions';
import { recordStockAdjustment } from '@/app/(app)/inventory/actions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, AlertTriangle } from 'lucide-react';

interface StockAdjustmentFormProps {
  onStockAdjusted?: () => void;
}

export function StockAdjustmentForm({ onStockAdjusted }: StockAdjustmentFormProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<RecordStockAdjustmentInput>({
    resolver: zodResolver(RecordStockAdjustmentInputSchema),
    defaultValues: {
      productId: '',
      quantityChange: 0,
      reason: '',
      notes: '',
    },
  });

  useEffect(() => {
    async function fetchProductsForSelect() {
      setIsLoadingProducts(true);
      try {
        const result = await getProducts(); // Changed from fetchedProducts
        setProducts(result.products); // Access the .products property
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not load products for selection." });
      } finally {
        setIsLoadingProducts(false);
      }
    }
    fetchProductsForSelect();
  }, [toast]);

  async function onSubmit(data: RecordStockAdjustmentInput) {
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
      return;
    }
    if (data.quantityChange === 0) {
      form.setError("quantityChange", { message: "Quantity change cannot be zero." });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await recordStockAdjustment(data, user);
      if (result.success && result.movement) {
        const adjustmentType = data.quantityChange > 0 ? 'added' : 'removed';
        const absQuantity = Math.abs(data.quantityChange);
        toast({
          title: 'Stock Adjustment Recorded',
          description: `${absQuantity} units of ${result.movement.productName} ${adjustmentType} due to ${data.reason}.`,
        });
        form.reset({
          productId: '',
          quantityChange: 0,
          reason: '',
          notes: '',
        });
        if (onStockAdjusted) onStockAdjusted();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Recording Adjustment',
          description: result.error || 'An unknown error occurred.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'An unexpected error occurred while recording the stock adjustment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <p>Please log in to record stock adjustments.</p>;
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Edit className="mr-2 h-6 w-6 text-orange-500" />
          Stock Adjustment
        </CardTitle>
        <CardDescription>Record stock changes (e.g., damages, corrections, internal use). Use positive for additions, negative for removals.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isLoadingProducts || isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingProducts ? "Loading products..." : "Select a product"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product._id} value={product._id}>
                          {product.name} (SKU: {product.sku || 'N/A'}) - Current Stock: {product.stock}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantityChange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Change</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., -5 or 10"
                      {...field}
                      disabled={isSubmitting}
                      onChange={e => field.onChange(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Adjustment</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Damaged goods, Stock count correction" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    {/* @ts-expect-error Textarea is not in FormControl */}
                    <Textarea placeholder="Any extra details about this adjustment..." {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting || isLoadingProducts} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Edit className="mr-2 h-4 w-4" />
              )}
              Record Stock Adjustment
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
