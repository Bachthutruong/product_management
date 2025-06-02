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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, AlertTriangle, CheckIcon, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockAdjustmentFormProps {
  onStockAdjusted?: () => void;
}

export function StockAdjustmentForm({ onStockAdjusted }: StockAdjustmentFormProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [openProductPopover, setOpenProductPopover] = useState(false);
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
                <FormItem className="flex flex-col">
                  <FormLabel>Product</FormLabel>
                  <Popover open={openProductPopover} onOpenChange={setOpenProductPopover}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isLoadingProducts || isSubmitting}
                        >
                          {field.value
                            ? products.find(p => p._id === field.value)?.name || "Select a product"
                            : (isLoadingProducts ? "Loading products..." : "Select a product")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search product..."
                          value={productSearch}
                          onValueChange={setProductSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No product found.</CommandEmpty>
                          <CommandGroup>
                            {products
                              .filter(p => 
                                p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                                (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
                              )
                              .map((product) => (
                                <CommandItem
                                  key={product._id}
                                  value={product.name}
                                  onSelect={() => {
                                    field.onChange(product._id);
                                    setOpenProductPopover(false);
                                  }}
                                >
                                  <CheckIcon
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      product._id === field.value
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{product.name} (SKU: {product.sku || 'N/A'})</span>
                                    <span className="text-xs text-muted-foreground">
                                      Current Stock: {product.stock}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
