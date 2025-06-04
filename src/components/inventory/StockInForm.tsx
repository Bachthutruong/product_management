"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowDownToLine, CalendarIcon, CheckIcon, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { formatForCalendarDisplay } from '@/lib/date-utils';

// Create a modified schema that requires batchExpiryDate
const StockInFormSchema = RecordStockInInputSchema.extend({
  batchExpiryDate: z.date({ message: "Batch expiry date is required" }),
});

type StockInFormInput = z.infer<typeof StockInFormSchema>;

interface StockInFormProps {
  onStockInRecorded?: () => void;
}

export function StockInForm({ onStockInRecorded }: StockInFormProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [openProductPopover, setOpenProductPopover] = useState(false);
  const { toast } = useToast();

  const form = useForm<StockInFormInput>({
    resolver: zodResolver(StockInFormSchema),
    defaultValues: {
      productId: '',
      quantity: 1,
      batchExpiryDate: undefined,
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

  async function onSubmit(data: StockInFormInput) {
    if (!user) {
      toast({ variant: "destructive", title: "認證錯誤", description: "您必須登入。" });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await recordStockIn(data, user);
      if (result.success && result.movement) {
        toast({
          title: '入庫已記錄',
          description: `${data.quantity} 單位的 ${result.movement.productName} 已入庫。`,
        });
        form.reset({
          productId: '',
          quantity: 1,
          batchExpiryDate: undefined,
          userId: user._id,
        });
        if (onStockInRecorded) onStockInRecorded();
      } else {
        toast({
          variant: 'destructive',
          title: '記錄入庫錯誤',
          description: result.error || '發生未知錯誤。',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '提交錯誤',
        description: '發生意外錯誤。',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <p>請登入以記錄庫存。</p>;
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center">
          <ArrowDownToLine className="mr-2 h-6 w-6 text-green-500" />
          入庫 (接收產品)
        </CardTitle>
        <CardDescription>記錄新到貨庫存。選擇產品，輸入數量和批次到期日期。</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>產品</FormLabel>
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
                            ? products.find(p => p._id === field.value)?.name || "選擇產品"
                            : (isLoadingProducts ? "載入產品中..." : "選擇產品")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
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
                                      目前庫存: {product.stock}
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>接收數量</FormLabel>
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
                  <FormLabel>批次到期日期 (必填)</FormLabel>
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
                            formatForCalendarDisplay(field.value)
                          ) : (
                            <span>選擇日期</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DatePickerCalendar
                        selected={field.value || undefined}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1))} // Can select today or future
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
              記錄入庫
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
