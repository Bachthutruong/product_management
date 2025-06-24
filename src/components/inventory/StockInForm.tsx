"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RecordStockInInputSchema, type RecordStockInInput } from '@/models/InventoryMovement';
import type { Product } from '@/models/Product';
import type { Category } from '@/models/Category';
import { getProducts } from '@/app/(app)/products/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import { recordStockIn } from '@/app/(app)/inventory/actions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowDownToLine, CalendarIcon, CheckIcon, ChevronsUpDown, FolderTree } from 'lucide-react';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
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
    async function fetchDataForSelect() {
      setIsLoadingProducts(true);
      setIsLoadingCategories(true);
      try {
        const [productsResult, categoriesResult] = await Promise.all([
          getProducts({ limit: 1000 }), // Get more products to show all
          getCategories({ limit: 500 })
        ]);
        setProducts(productsResult.products);
        setCategories(categoriesResult.categories);
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not load data for selection." });
      } finally {
        setIsLoadingProducts(false);
        setIsLoadingCategories(false);
      }
    }
    fetchDataForSelect();
  }, [toast]);

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    // Reset product selection when category changes
    form.setValue('productId', '');
    setProductSearch('');
  };

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    // If no category selected, return all products
    if (!selectedCategoryId) return products;
    return products.filter(product => product.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

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
            {/* Product Category Selection */}
            <div className="flex flex-col space-y-2">
              <label htmlFor="productCategory" className="text-sm font-medium">
                產品分類 (可選擇，若無則顯示全部)
              </label>
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedCategoryId}
                  onValueChange={handleCategoryChange}
                  disabled={isLoadingCategories}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={isLoadingCategories ? "載入中..." : "選擇產品分類 (可留空顯示全部)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>產品 *</FormLabel>
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
                            ? filteredProducts.find(p => p._id === field.value)?.name || "選擇產品"
                            : (isLoadingProducts ? "載入產品中..." : "選擇產品")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[500px] p-0">
                      <div className="flex flex-col">
                        <div className="p-3 border-b">
                          <Input
                            placeholder="搜尋產品 (名稱、SKU)..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          {(() => {
                            const filteredItems = filteredProducts.filter(p => 
                              p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                              (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
                            );
                            
                            if (filteredItems.length === 0) {
                              return (
                                <div className="p-4 text-center text-muted-foreground">
                                  {filteredProducts.length === 0 
                                    ? (selectedCategoryId ? "此分類下沒有產品。" : "沒有產品資料。")
                                    : "找不到符合的產品。"}
                                </div>
                              );
                            }
                            
                            return filteredItems.map((product) => (
                              <div
                                key={product._id}
                                className={cn(
                                  "flex items-center space-x-2 p-3 cursor-pointer hover:bg-accent",
                                  product._id === field.value && "bg-accent"
                                )}
                                onClick={() => {
                                  field.onChange(product._id);
                                  setOpenProductPopover(false);
                                  setProductSearch('');
                                }}
                              >
                                <CheckIcon
                                  className={cn(
                                    "h-4 w-4",
                                    product._id === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col flex-1">
                                  <span>{product.name} (SKU: {product.sku || 'N/A'})</span>
                                  <span className="text-xs text-muted-foreground">
                                    目前庫存: {product.stock}
                                  </span>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
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
