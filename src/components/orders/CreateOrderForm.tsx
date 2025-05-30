
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

interface CreateOrderFormProps {
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
          title: 'Order Created',
          description: `Order ${result.order?.orderNumber || ''} has been successfully created.`,
        });
        form.reset();
        if (onOrderCreated && result.order) onOrderCreated(result.order._id);
        if (closeDialog) closeDialog();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Creating Order',
          description: result.error || 'An unknown error occurred.',
        });
        if (result.errors) {
          console.error("Order creation Zod errors:", result.errors);
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'An unexpected error occurred while creating the order.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleCustomerAdded = (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer]);
    form.setValue('customerId', newCustomer._id);
    toast({ title: "Customer Selected", description: `${newCustomer.name} is now selected for this order.` });
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
                <FormLabel>Customer</FormLabel>
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
                            : "Select customer"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search customer..."
                          value={customerSearch}
                          onValueChange={setCustomerSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No customer found.</CommandEmpty>
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
                                  {customer.name} ({customer.phone || customer.email || 'No contact'})
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
            <FormLabel>Order Items</FormLabel>
            {fields.map((item, index) => (
              <Card key={item.id} className="p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-start">
                  <FormField
                    control={form.control}
                    name={`items.${index}.productId`}
                    render={({ field: productField }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Product</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            productField.onChange(value);
                            handleProductSelect(index, value);
                          }}
                          defaultValue={productField.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p._id} value={p._id} disabled={p.stock <= 0}>
                                {p.name} (SKU: {p.sku || 'N/A'}) - Stock: {p.stock} - Price: ${p.price.toFixed(2)}
                                {p.stock <= 0 && " (Out of stock)"}
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
                    name={`items.${index}.quantity`}
                    render={({ field: quantityField }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Qty" {...quantityField}
                            min="1"
                            max={products.find(p => p._id === form.getValues(`items.${index}.productId`))?.stock || undefined}
                            onChange={(e) => quantityField.onChange(parseInt(e.target.value, 10) || 1)}
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
                      <FormLabel className="sr-only">Item Notes</FormLabel>
                      <FormControl>
                        {/* @ts-expect-error Input is not in FormControl */}
                        <Input placeholder="Notes for this item (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={handleAddProductLine} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Product to Order
            </Button>
            {form.formState.errors.items && typeof form.formState.errors.items === 'object' && !Array.isArray(form.formState.errors.items) && (
              <FormMessage>{(form.formState.errors.items as any).message || "Please add at least one item."}</FormMessage>
            )}
          </div>

          {/* Discount */}
          <Card className="p-4 bg-muted/30">
            <FormLabel className="text-base font-medium">Discount & Shipping</FormLabel>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select discount type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
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
                    <FormLabel>Discount Value</FormLabel>
                    <FormControl>
                      {/* @ts-expect-error Input is not in FormControl */}
                      <Input
                        type="number"
                        placeholder="e.g., 10 or 5.50"
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
            <FormField
              control={form.control}
              name="shippingFeeInput"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Shipping Fee ($)</FormLabel>
                  <FormControl>
                    {/* @ts-expect-error Input is not in FormControl */}
                    <Input type="number" placeholder="e.g., 5.00" {...field} min="0" step="0.01" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>


          {/* Order Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Notes (Optional)</FormLabel>
                <FormControl>
                  {/* @ts-expect-error Textarea is not in FormControl */}
                  <Textarea placeholder="Any special instructions for this order..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Order Summary */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal:</span> <span>${subtotal.toFixed(2)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount:</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            {parseFloat(watchedShippingFeeInput || '0') > 0 && (
              <div className="flex justify-between"><span>Shipping:</span> <span>+${parseFloat(watchedShippingFeeInput || '0').toFixed(2)}</span></div>
            )}
            <hr className="my-2" />
            <div className="flex justify-between font-bold text-lg text-primary"><span>Total Amount:</span> <span>${totalAmount.toFixed(2)}</span></div>
          </CardContent>
        </Card>

        <CardFooter className="flex justify-end gap-2 px-0 pb-0">
          <Button type="button" variant="outline" onClick={closeDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || fields.length === 0 || !form.formState.isValid} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckIcon className="mr-2 h-4 w-4" />
            )}
            Complete Order
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
