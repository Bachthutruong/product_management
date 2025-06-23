"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateOrderFormSchema, type CreateOrderFormValues, type CreateOrderInput, DiscountTypeSchema, type Order } from '@/models/Order';
import type { Product } from '@/models/Product';
import type { Customer } from '@/models/Customer';
import { getProducts } from '@/app/(app)/products/actions';
import { getCustomers } from '@/app/(app)/customers/actions';
import { updateOrder } from '@/app/(app)/orders/actions';
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

interface EditOrderFormProps {
  order: Order;
  onOrderUpdated?: (orderId: string) => void;
  closeDialog?: () => void;
}

export function EditOrderForm({ order, onOrderUpdated, closeDialog }: EditOrderFormProps) {
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
  const [updateCounter, setUpdateCounter] = useState(0);

  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(CreateOrderFormSchema),
    defaultValues: {
      customerId: order.customerId,
      items: order.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        cost: item.cost || 0,
        notes: item.notes || ''
      })),
      discountType: order.discountType || null,
      discountValueInput: order.discountValue?.toString() || '',
      shippingFeeInput: order.shippingFee?.toString() || '',
      notes: order.notes || '',
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
      setProducts(fetchedProductsResult.products);
      setCustomers(fetchedCustomersResult);
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
        cost: 0,
        notes: ''
      });
    } else {
      toast({ variant: "default", title: "No Products", description: "Please add products to the inventory first." });
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

  // Function to trigger recalculation
  const triggerRecalculation = useCallback(() => {
    setUpdateCounter(prev => prev + 1);
  }, []);

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
  }, [watchedItems, watchedDiscountType, watchedDiscountValueInput, watchedShippingFeeInput, updateCounter]);

  async function onSubmit(data: CreateOrderFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
      return;
    }
    setIsSubmitting(true);

    const orderInput: CreateOrderInput = {
      customerId: data.customerId,
      items: data.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        cost: Number(item.cost || 0),
        notes: item.notes,
        batchesUsed: [], // Will be populated by the updateOrder function
      })),
      discountType: data.discountType,
      discountValue: data.discountValueInput ? parseFloat(data.discountValueInput) : undefined,
      shippingFee: data.shippingFeeInput ? parseFloat(data.shippingFeeInput) : undefined,
      notes: data.notes,
    };

    try {
      const result = await updateOrder(order._id, orderInput, user);
      if (result.success) {
        toast({
          title: 'Order Updated',
          description: `Order ${order.orderNumber} has been successfully updated.`,
        });
        if (onOrderUpdated && result.order) onOrderUpdated(result.order._id);
        if (closeDialog) closeDialog();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Updating Order',
          description: result.error || 'An unknown error occurred.',
        });
        if (result.errors) {
          console.error("Order update Zod errors:", result.errors);
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'An unexpected error occurred while updating the order.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleCustomerAdded = (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    form.setValue('customerId', newCustomer._id);
    setCustomerSearch(newCustomer.name);
    setOpenCustomerPopover(false);
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (customer.email?.toLowerCase() || '').includes(customerSearch.toLowerCase())
  );

  const getSelectedCustomer = () => {
    return customers.find(c => c._id === form.watch('customerId'));
  };

  const getFilteredProducts = (searchTerm: string, currentIndex: number) => {
    return products.filter(product => {
      // Filter by search term
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter out products with stock <= 0
      const hasStock = product.stock > 0;
      
      // Filter out products already added to the order (except the current item being edited)
      const alreadyAdded = watchedItems.some((item, itemIndex) => 
        item.productId === product._id && itemIndex !== currentIndex
      );
      
      return matchesSearch && hasStock && !alreadyAdded;
    });
  };

  return (
    <Card className="w-full max-w-6xl mx-auto shadow-xl">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6" />
          <div>
            <CardTitle className="text-2xl font-bold">編輯訂單 - {order.orderNumber}</CardTitle>
            <CardDescription className="text-blue-100 mt-1">更新訂單詳細資訊和明細項目</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="p-6 space-y-6">
            
            {/* Customer Selection */}
            <div className="bg-slate-50 p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-800">客戶資訊</h3>
              </div>
              
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客戶 *</FormLabel>
                    <div className="flex gap-2">
                      <Popover open={openCustomerPopover} onOpenChange={setOpenCustomerPopover}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("flex-1 justify-between", !field.value && "text-muted-foreground")}
                            >
                              {field.value
                                ? getSelectedCustomer()?.name || "選擇客戶"
                                : "選擇客戶"
                              }
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                          <Command>
                            <CommandInput 
                              placeholder="搜尋客戶..." 
                              value={customerSearch}
                              onValueChange={setCustomerSearch}
                            />
                            <CommandEmpty>找不到客戶。</CommandEmpty>
                            <CommandGroup>
                              <CommandList className="max-h-48">
                                {isLoadingCustomers ? (
                                  <div className="p-2 text-center">
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                  </div>
                                ) : (
                                  filteredCustomers.map((customer) => (
                                    <CommandItem
                                      value={customer._id}
                                      key={customer._id}
                                      onSelect={() => {
                                        form.setValue("customerId", customer._id);
                                        setCustomerSearch(customer.name);
                                        setOpenCustomerPopover(false);
                                      }}
                                    >
                                      <CheckIcon
                                        className={cn("mr-2 h-4 w-4", customer._id === field.value ? "opacity-100" : "opacity-0")}
                                      />
                                      <div>
                                        <p className="font-medium">{customer.name}</p>
                                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                                      </div>
                                    </CommandItem>
                                  ))
                                )}
                              </CommandList>
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <AddCustomerDialog onCustomerAdded={handleCustomerAdded} />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Order Items */}
            <div className="bg-slate-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-800">訂單明細</h3>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddProductLine}
                  className="flex items-center gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  新增項目
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      
                      {/* Product Selection */}
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field: productField }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>產品 *</FormLabel>
                            <Popover 
                              open={openProductPopovers[index] || false} 
                              onOpenChange={(open) => setOpenProductPopovers(prev => ({ ...prev, [index]: open }))}
                            >
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn("w-full justify-between", !productField.value && "text-muted-foreground")}
                                  >
                                    {productField.value
                                      ? products.find(p => p._id === productField.value)?.name || "選擇產品"
                                      : "選擇產品"
                                    }
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0">
                                <Command>
                                  <CommandInput 
                                    placeholder="搜尋產品..." 
                                    value={productSearches[index] || ''}
                                    onValueChange={(value) => setProductSearches(prev => ({ ...prev, [index]: value }))}
                                  />
                                  <CommandEmpty>找不到產品。</CommandEmpty>
                                  <CommandGroup>
                                    <CommandList className="max-h-48">
                                      {isLoadingProducts ? (
                                        <div className="p-2 text-center">
                                          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                        </div>
                                      ) : (
                                        getFilteredProducts(productSearches[index] || '', index).map((product) => (
                                          <CommandItem
                                            value={product._id}
                                            key={product._id}
                                            onSelect={() => {
                                              handleProductSelect(index, product._id);
                                              setOpenProductPopovers(prev => ({ ...prev, [index]: false }));
                                              setProductSearches(prev => ({ ...prev, [index]: '' }));
                                            }}
                                          >
                                            <CheckIcon
                                              className={cn("mr-2 h-4 w-4", product._id === productField.value ? "opacity-100" : "opacity-0")}
                                            />
                                            <div>
                                              <p className="font-medium">{product.name}</p>
                                              <p className="text-sm text-muted-foreground">SKU: {product.sku} | 庫存: {product.stock} | 價格: ${product.price}</p>
                                            </div>
                                          </CommandItem>
                                        ))
                                      )}
                                    </CommandList>
                                  </CommandGroup>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Quantity */}
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: qtyField }) => (
                          <FormItem>
                            <FormLabel>數量 *</FormLabel>
                            <FormControl>
                              <Input 
                                type="text" 
                                inputMode="numeric" 
                                placeholder="例如：1, 2, 10"
                                value={qtyField.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Allow empty string for easier editing
                                  if (value === '') {
                                    qtyField.onChange('');
                                  } else {
                                    // Only allow positive integers
                                    const numValue = parseInt(value, 10);
                                    if (!isNaN(numValue) && numValue > 0) {
                                      qtyField.onChange(numValue);
                                    }
                                  }
                                  // Trigger recalculation immediately
                                  triggerRecalculation();
                                }}
                                onBlur={(e) => {
                                  // Ensure we have a valid number on blur
                                  const value = e.target.value;
                                  if (value === '' || isNaN(parseInt(value, 10))) {
                                    qtyField.onChange(1); // Default to 1 if invalid
                                  }
                                  qtyField.onBlur();
                                }}
                                name={qtyField.name}
                                ref={qtyField.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Unit Price */}
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field: priceField }) => (
                          <FormItem>
                            <FormLabel>單價 *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01" 
                                min="0" 
                                {...priceField}
                                onChange={(e) => {
                                  priceField.onChange(e);
                                  // Trigger recalculation immediately
                                  triggerRecalculation();
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Remove Button */}
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => remove(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.notes`}
                        render={({ field: notesField }) => (
                          <FormItem>
                            <FormLabel>項目備註</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="此項目的選項備註"
                                value={notesField.value || ''}
                                onChange={notesField.onChange}
                                onBlur={notesField.onBlur}
                                name={notesField.name}
                                ref={notesField.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {fields.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>尚未新增項目。點擊「新增項目」開始建立訂單。</p>
                </div>
              )}
            </div>

            {/* Discount and Shipping */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Discount Section */}
              <div className="bg-slate-50 p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <Percent className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-800">折扣</h3>
                </div>
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>折扣類型</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value === 'none' ? null : value);
                          // Trigger recalculation immediately
                          triggerRecalculation();
                        }} value={field.value || 'none'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="選擇折扣類型" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">無折扣</SelectItem>
                            <SelectItem value="percentage">百分比</SelectItem>
                            <SelectItem value="fixed">固定金額</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedDiscountType && (
                    <FormField
                      control={form.control}
                      name="discountValueInput"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {watchedDiscountType === 'percentage' ? '折扣百分比' : '折扣金額 ($)'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={watchedDiscountType === 'percentage' ? '0.01' : '0.01'}
                              min="0"
                              max={watchedDiscountType === 'percentage' ? '100' : undefined}
                              placeholder={watchedDiscountType === 'percentage' ? '0.00' : '0.00'}
                              value={field.value || ''}
                              onChange={(e) => {
                                field.onChange(e);
                                // Trigger recalculation immediately
                                triggerRecalculation();
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Shipping Section */}
              <div className="bg-slate-50 p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <Truck className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-800">運費</h3>
                </div>
                
                <FormField
                  control={form.control}
                  name="shippingFeeInput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>運費 ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={field.value || ''}
                          onChange={(e) => {
                            field.onChange(e);
                            // Trigger recalculation immediately
                            triggerRecalculation();
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Order Totals */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-lg border-2 border-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-6 w-6 text-blue-600" />
                <h3 className="text-xl font-bold text-gray-800">訂單總結</h3>
              </div>
              
              <div className="space-y-2 text-lg">
                <div className="flex justify-between">
                  <span className="text-gray-600">小計:</span>
                  <span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>折扣:</span>
                    <span className="font-semibold">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {parseFloat(watchedShippingFeeInput || '0') > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">運費:</span>
                    <span className="font-semibold">{formatCurrency(parseFloat(watchedShippingFeeInput || '0'))}</span>
                  </div>
                )}
                <hr className="border-gray-300" />
                <div className="flex justify-between text-xl font-bold text-blue-700">
                  <span>總計:</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Order Notes */}
            <div className="bg-slate-50 p-4 rounded-lg border">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>訂單備註</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="新增此訂單的任何額外備註..."
                        className="min-h-[100px]"
                        value={field.value || ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="bg-gray-50 rounded-b-lg p-6">
            <div className="flex gap-3 w-full">
              <Button 
                type="button" 
                variant="outline" 
                onClick={closeDialog}
                disabled={isSubmitting}
                className="flex-1"
              >
                取消
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || fields.length === 0}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在更新訂單...
                  </>
                ) : (
                  "更新訂單"
                )}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
} 