"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateOrderFormSchema, type CreateOrderFormValues, type CreateOrderInput, DiscountTypeSchema } from '@/models/Order';
import type { Product } from '@/models/Product';
import type { Customer } from '@/models/Customer';
import { getProducts } from '@/app/(app)/products/actions';
import { getCustomers } from '@/app/(app)/customers/actions';
import { createOrder } from '@/app/(app)/orders/actions';
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
import { Loader2, PlusCircle, Trash2, ShoppingCart, Users, Percent, DollarSign, Truck, CheckIcon, ChevronsUpDown } from 'lucide-react';
import { AddCustomerDialog } from '@/components/customers/AddCustomerDialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

export interface CreateOrderFormProps {
  onOrderCreated?: (orderId: string) => void;
  closeDialog?: () => void;
}

export function CreateOrderForm({ onOrderCreated, closeDialog }: CreateOrderFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [openCustomerPopover, setOpenCustomerPopover] = useState(false);
  const [productSearches, setProductSearches] = useState<{[key: number]: string}>({});
  const [openProductPopovers, setOpenProductPopovers] = useState<{[key: number]: boolean}>({});
  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(CreateOrderFormSchema),
    defaultValues: {
      customerId: '',
      items: [],
      discountType: null,
      discountValueInput: '',
      shippingFeeInput: '',
      notes: '',
    },
  });
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const fetchInitialData = useCallback(async () => {
    setIsLoadingProducts(true);
    setIsLoadingCustomers(true);
    try {
      const [fetchedProductsResult, fetchedCustomersResult] = await Promise.all([
        getProducts(),
        getCustomers(),
      ]);
      setProducts(fetchedProductsResult.products); // Access .products
      setCustomers(fetchedCustomersResult); // Assuming getCustomers returns Customer[] directly
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load products or customers." });
    } finally {
      setIsLoadingProducts(false);
      setIsLoadingCustomers(false);
    }
  }, [toast]);
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  const handleAddProductLine = () => {
    if (products.length > 0) {
      append({
        productId: '',
        productName: '',
        productSku: '',
        quantity: 1,
        unitPrice: 0,
        cost: 0, // Will be set on product selection
        notes: ''
      });
    } else {
      toast({ variant: "default", title: "No Products", description: "Please add products to the inventory first. " });
    }
  };
  const handleProductSelect = (lineIndex: number, productId: string) => {
    const selectedProduct = products.find(p => p._id === productId);
    if (selectedProduct) {
      update(lineIndex, {
        ...fields[lineIndex],
        productId: selectedProduct._id,
        productName: selectedProduct.name,
        productSku: selectedProduct.sku,
        unitPrice: selectedProduct.price,
        cost: selectedProduct.cost || 0,
      });
      form.trigger(`items.${lineIndex}.quantity`);
    }
  };
  const watchedItems = form.watch("items");
  const watchedDiscountType = form.watch("discountType");
  const watchedDiscountValueInput = form.watch("discountValueInput");
  const watchedShippingFeeInput = form.watch("shippingFeeInput");
  const { subtotal, discountAmount, totalAmount } = useMemo(() => {
    let currentSubtotal = 0;
    watchedItems.forEach(item => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      currentSubtotal += quantity * price;
    });
    let currentDiscountAmount = 0;
    const discountValue = parseFloat(watchedDiscountValueInput || '0');
    if (watchedDiscountType === 'percentage' && discountValue > 0) {
      currentDiscountAmount = (currentSubtotal * discountValue) / 100;
    } else if (watchedDiscountType === 'fixed' && discountValue > 0) {
      currentDiscountAmount = discountValue;
    }
    currentDiscountAmount = Math.max(0, Math.min(currentDiscountAmount, currentSubtotal));
    const shipping = parseFloat(watchedShippingFeeInput || '0') || 0;
    const currentTotalAmount = currentSubtotal - currentDiscountAmount + shipping;
    return {
      subtotal: currentSubtotal,
      discountAmount: currentDiscountAmount,
      totalAmount: currentTotalAmount
    };
  }, [watchedItems, watchedDiscountType, watchedDiscountValueInput, watchedShippingFeeInput]);
  async function onSubmit(data: CreateOrderFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "認證錯誤", description: "您必須登入。" });
      return;
    }
    setIsSubmitting(true);
    const orderInput: CreateOrderInput = {
      customerId: data.customerId,
      //@ts-expect-error batchesUsed is not in CreateOrderInput
      items: data.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        cost: Number(item.cost || 0), // Ensure cost is passed
        notes: item.notes,
      })),
      discountType: data.discountType,
      discountValue: data.discountValueInput ? parseFloat(data.discountValueInput) : undefined,
      shippingFee: data.shippingFeeInput ? parseFloat(data.shippingFeeInput) : undefined,
      notes: data.notes,
    };
    try {
      const result = await createOrder(orderInput, user);
      if (result.success) {
        toast({
          title: '訂單已建立',
          description: `訂單 ${result.order?.orderNumber || ''} 已成功建立。`,
        });
        form.reset();
        if (onOrderCreated && result.order) onOrderCreated(result.order._id);
        if (closeDialog) closeDialog();
      } else {
        toast({
          variant: 'destructive',
          title: '建立訂單錯誤',
          description: result.error || '發生未知錯誤。',
        });
        if (result.errors) {
          console.error("Order creation Zod errors:", result.errors);
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '提交錯誤',
        description: '建立訂單時發生意外錯誤。',
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  const handleCustomerAdded = (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    form.setValue('customerId', newCustomer._id);
    toast({ title: "客戶已選取", description: `${newCustomer.name} 現已選取此訂單。` });
  };
  if (isLoadingProducts || isLoadingCustomers) {
    return <div className="flex justify-center items-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Customer Selection */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>客戶</FormLabel>
                <div className="flex items-center gap-2">
                  <Popover open={openCustomerPopover} onOpenChange={setOpenCustomerPopover}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? customers.find(
                              (customer) => customer._id === field.value
                            )?.name
                            : "選擇客戶"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="搜尋客戶..."
                          value={customerSearch}
                          onValueChange={setCustomerSearch}
                        />
                        <CommandList>
                          <CommandEmpty>找不到客戶。</CommandEmpty>
                          <CommandGroup>
                            {customers
                              .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                              .map((customer) => (
                                <CommandItem
                                  value={customer.name}
                                  key={customer._id}
                                  onSelect={() => {
                                    form.setValue("customerId", customer._id)
                                    setOpenCustomerPopover(false)
                                  }}
                                >
                                  <CheckIcon
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      customer._id === field.value
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {customer.name} ({customer.phone || customer.email || '無聯絡資訊'})
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <AddCustomerDialog
                    onCustomerAdded={handleCustomerAdded}
                    triggerButton={<Button type="button" variant="outline" size="icon"><Users className="h-4 w-4" /></Button>}
                  />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Order Items */}
          <div className="space-y-3">
            <FormLabel>訂單明細</FormLabel>
            {fields.map((item, index) => (
              <Card key={item.id} className="p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-start">
                  <FormField
                    control={form.control}
                    name={`items.${index}.productId`}
                    render={({ field: productField }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="sr-only">產品</FormLabel>
                        <Popover
                          open={openProductPopovers[index] || false}
                          onOpenChange={(open) => setOpenProductPopovers(prev => ({...prev, [index]: open}))}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !productField.value && "text-muted-foreground"
                                )}
                              >
                                {productField.value
                                  ? products.find(p => p._id === productField.value)?.name || "選擇產品"
                                  : "選擇產品"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0">
                            <Command>
                              <CommandInput
                                placeholder="搜尋產品..."
                                value={productSearches[index] || ''}
                                onValueChange={(value) => setProductSearches(prev => ({...prev, [index]: value}))}
                              />
                              <CommandList>
                                <CommandEmpty>找不到產品。</CommandEmpty>
                                <CommandGroup>
                                  {products
                                    .filter(p => {
                                      // Filter by search term
                                      const matchesSearch = p.name.toLowerCase().includes((productSearches[index] || '').toLowerCase()) ||
                                        (p.sku && p.sku.toLowerCase().includes((productSearches[index] || '').toLowerCase()));
                                      
                                      // Filter out products with stock <= 0
                                      const hasStock = p.stock > 0;
                                      
                                      // Filter out products already added to the order
                                      const alreadyAdded = watchedItems.some(item => item.productId === p._id);
                                      
                                      return matchesSearch && hasStock && !alreadyAdded;
                                    })
                                    .map((product) => (
                                      <CommandItem
                                        key={product._id}
                                        value={product.name}
                                        onSelect={() => {
                                          productField.onChange(product._id);
                                          handleProductSelect(index, product._id);
                                          setOpenProductPopovers(prev => ({...prev, [index]: false}));
                                        }}
                                      >
                                        <CheckIcon
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            product._id === productField.value
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>{product.name} (SKU: {product.sku || 'N/A'})</span>
                                          <span className="text-xs text-muted-foreground">
                                            庫存: {product.stock} - 價格: {formatCurrency(product.price)}
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
                    name={`items.${index}.quantity`}
                    render={({ field: quantityField }) => (
                      <FormItem>
                        <FormLabel className="sr-only">數量</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="數量"
                            value={quantityField.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Allow empty string for easier editing
                              if (value === '') {
                                quantityField.onChange('');
                              } else {
                                // Only allow positive integers
                                const numValue = parseInt(value, 10);
                                if (!isNaN(numValue) && numValue > 0) {
                                  quantityField.onChange(numValue);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              // Ensure we have a valid number on blur
                              const value = e.target.value;
                              if (value === '' || isNaN(parseInt(value, 10))) {
                                quantityField.onChange(1); // Default to 1 if invalid
                              }
                              quantityField.onBlur();
                            }}
                            name={quantityField.name}
                            ref={quantityField.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive/80 mt-1 md:mt-0 self-center">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`items.${index}.notes`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">項目備註</FormLabel>
                      <FormControl>
                        {/* @ts-expect-error Input is not in FormControl */}
                        <Input placeholder="此項目的備註 (選填)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={handleAddProductLine} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> 新增產品到訂單
            </Button>
            {form.formState.errors.items && typeof form.formState.errors.items === 'object' && !Array.isArray(form.formState.errors.items) && (
              <FormMessage>{(form.formState.errors.items as any).message || "請至少新增一個項目。"}</FormMessage>
            )}
          </div>
          {/* Discount */}
          <Card className="p-4 bg-muted/30">
            <FormLabel className="text-base font-medium">折扣與運費</FormLabel>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>折扣類型</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="選擇折扣類型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">百分比 (%)</SelectItem>
                        <SelectItem value="fixed">固定金額 ($)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountValueInput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>折扣金額</FormLabel>
                    <FormControl>
                      {/* @ts-expect-error Input is not in FormControl */}
                      <Input
                        type="number"
                        placeholder="例如：10 或 5.50"
                        {...field}
                        disabled={!watchedDiscountType}
                        min="0"
                        step={watchedDiscountType === 'percentage' ? "0.1" : "0.01"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* Shipping Fee */}
            <div className="mt-4">
              <FormLabel className="text-base font-medium">運費</FormLabel>
              <div className="mt-2">
                <FormField
                  control={form.control}
                  name="shippingFeeInput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">運費 ($)</FormLabel>
                      <FormControl>
                        {/* @ts-expect-error Input is not in FormControl */}
                        <Input
                          type="number"
                          placeholder="例如：5.00"
                          {...field}
                          min="0"
                          step="0.01"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </Card>
          {/* Order Summary (Totals) */}
          <Card className="p-4 bg-muted/30">
            <FormLabel className="text-base font-medium">訂單總結</FormLabel>
            <div className="space-y-2 mt-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">小計:</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="text-muted-foreground">折扣:</span>
                  <span className="font-semibold">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {parseFloat(watchedShippingFeeInput || '0') > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">運費:</span>
                  <span className="font-semibold">{formatCurrency(parseFloat(watchedShippingFeeInput || '0'))}</span>
                </div>
              )}
              <hr className="border-border" />
              <div className="flex justify-between text-lg font-bold">
                <span>總計:</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </Card>
          {/* Order Notes */}
          <Card className="p-4 bg-muted/30">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>訂單備註 (選填)</FormLabel>
                  <FormControl>
                    {/* @ts-expect-error Textarea is not in FormControl */}
                    <Textarea placeholder="輸入訂單的備註..." {...field} className="min-h-[80px]" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
        </div>
        <CardFooter className="flex justify-end gap-3 border-t p-4">
          <Button type="button" variant="outline" onClick={closeDialog}>取消</Button>
          <Button type="submit" disabled={isSubmitting || fields.length === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在建立訂單...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                建立訂單
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}