
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RecordStockInInputSchema, type RecordStockInInput } from '@/models/InventoryMovement';
import type { Product } from '@/models/Product';
import { getProducts } from '@/app/(app)/products/actions';
import { recordStockIn } from '@/app/(app)/inventory/actions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowDownToLine, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StockInFormProps {
  onStockInRecorded?: () => void;
}

export function StockInForm({ onStockInRecorded }: StockInFormProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<RecordStockInInput>({
    resolver: zodResolver(RecordStockInInputSchema),
    defaultValues: {
      productId: '',
      quantity: 1,
      batchExpiryDate: null,
      userId: user?._id || '',
    },
  });
  
  useEffect(() => {
    if (user?._id) {
      form.setValue('userId', user._id);
    }
  }, [user, form]);

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

  async function onSubmit(data: RecordStockInInput) {
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await recordStockIn(data, user);
      if (result.success && result.movement) {
        toast({
          title: 'Stock In Recorded',
          description: `${data.quantity} units of ${result.movement.productName} stocked in.`,
        });
        form.reset({
            productId: '',
            quantity: 1,
            batchExpiryDate: null,
            userId: user._id,
        });
        if (onStockInRecorded) onStockInRecorded();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Recording Stock In',
          description: result.error || 'An unknown error occurred.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <p>Please log in to record stock.</p>;
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <ArrowDownToLine className="mr-2 h-6 w-6 text-green-500" />
          Stock In (Receive Products)
        </CardTitle>
        <CardDescription>Record new stock arrivals. Select product, enter quantity, and optional batch expiry.</CardDescription>
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Received</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" placeholder="e.g., 50" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="batchExpiryDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Batch Expiry Date (Optional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSubmitting}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))} // Can select today or future
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting || isLoadingProducts} className="w-full bg-green-600 hover:bg-green-700 text-white">
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="mr-2 h-4 w-4" />
              )}
              Record Stock In
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
