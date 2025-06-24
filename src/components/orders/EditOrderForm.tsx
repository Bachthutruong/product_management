"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateOrderFormSchema, type CreateOrderFormValues, type CreateOrderInput, DiscountTypeSchema, type Order } from '@/models/Order';
import type { Product } from '@/models/Product';
import type { Customer } from '@/models/Customer';
import type { Category } from '@/models/Category';
import { getProducts } from '@/app/(app)/products/actions';
import { getCustomers } from '@/app/(app)/customers/actions';
import { getCustomerCategories } from '@/app/(app)/customer-categories/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import { updateOrder } from '@/app/(app)/orders/actions';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, ShoppingCart, Users, Percent, DollarSign, Truck, CheckIcon, ChevronsUpDown, FolderTree } from 'lucide-react';
import { AddCustomerDialog } from '@/components/customers/AddCustomerDialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { type CustomerCategory } from '@/models/CustomerCategory';

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
  const [customerCategories, setCustomerCategories] = useState<CustomerCategory[]>([]);
  const [productCategories, setProductCategories] = useState<Category[]>([]);
  const [selectedCustomerCategoryId, setSelectedCustomerCategoryId] = useState<string>('');
  const [selectedProductCategoryIds, setSelectedProductCategoryIds] = useState<{[key: number]: string}>({});
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const [productSearches, setProductSearches] = useState<{[key: number]: string}>({});
  const [showProductSelections, setShowProductSelections] = useState<{[key: number]: boolean}>({});
  const [showCustomerSelection, setShowCustomerSelection] = useState(false);
  const [forceUpdateCounter, setForceUpdateCounter] = useState(0);

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
    setIsLoadingCategories(true);
    try {
      const [fetchedProductsResult, fetchedCustomersResult, fetchedCustomerCategoriesResult, fetchedProductCategoriesResult] = await Promise.all([
        getProducts({ limit: 1000 }), // Get more products to show all
        getCustomers(),
        getCustomerCategories(),
        getCategories({ limit: 500 }),
      ]);
      setProducts(fetchedProductsResult.products);
      setCustomers(fetchedCustomersResult);
      setCustomerCategories(fetchedCustomerCategoriesResult.filter(cat => cat.isActive));
      setProductCategories(fetchedProductCategoriesResult.categories);
      
      // Set initial category based on current customer
      const currentCustomer = fetchedCustomersResult.find(c => c._id === order.customerId);
      if (currentCustomer && currentCustomer.categoryId) {
        setSelectedCustomerCategoryId(currentCustomer.categoryId);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load data." });
    } finally {
      setIsLoadingProducts(false);
      setIsLoadingCustomers(false);
      setIsLoadingCategories(false);
    }
  }, [toast, order.customerId]);

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
  }, [watchedItems, watchedDiscountType, watchedDiscountValueInput, watchedShippingFeeInput, forceUpdateCounter]);

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
        cost: Number(item.cost || 0),
        notes: item.notes,
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
          title: '訂單已更新',
          description: `訂單 ${order.orderNumber} 已成功更新。`,
        });
        if (onOrderUpdated && result.order) onOrderUpdated(result.order._id);
        if (closeDialog) closeDialog();
      } else {
        toast({
          variant: 'destructive',
          title: '更新訂單錯誤',
          description: result.error || '發生未知錯誤。',
        });
        if (result.errors) {
          console.error("Order update Zod errors:", result.errors);
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '提交錯誤',
        description: '更新訂單時發生意外錯誤。',
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

  const handleCustomerCategoryChange = (categoryId: string) => {
    setSelectedCustomerCategoryId(categoryId);
    // Reset customer selection when category changes
    form.setValue('customerId', '');
    setCustomerSearch('');
  };

  const handleProductCategoryChange = (categoryId: string, itemIndex: number) => {
    setSelectedProductCategoryIds(prev => ({...prev, [itemIndex]: categoryId}));
    // Reset product selection for this specific item
    form.setValue(`items.${itemIndex}.productId`, '');
    form.setValue(`items.${itemIndex}.productName`, '');
    form.setValue(`items.${itemIndex}.productSku`, '');
  };

  // Filter customers by selected category
  const filteredCustomers = useMemo(() => {
    // If no category selected, return all customers
    if (!selectedCustomerCategoryId) return customers;
    return customers.filter(customer => customer.categoryId === selectedCustomerCategoryId);
  }, [customers, selectedCustomerCategoryId]);

  // Filter products by selected category for specific item
  const getFilteredProductsForItem = useCallback((itemIndex: number) => {
    const categoryId = selectedProductCategoryIds[itemIndex];
    // If no category selected or "all" selected for this item, return all products
    if (!categoryId || categoryId === 'all') return products;
    return products.filter(product => product.categoryId === categoryId);
  }, [products, selectedProductCategoryIds]);

  if (isLoadingProducts || isLoadingCustomers || isLoadingCategories) {
    return <div className="flex justify-center items-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* Customer Category Selection */}
          <div className="flex flex-col space-y-2">
            <label htmlFor="customerCategory" className="text-sm font-medium">
              客戶分類 (可選擇，若無則顯示全部)
            </label>
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedCustomerCategoryId}
                onValueChange={handleCustomerCategoryChange}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="選擇客戶分類 (可留空顯示全部)" />
                </SelectTrigger>
                <SelectContent>
                  {customerCategories
                    .filter(category => category._id && category._id.trim() !== '') // Filter out empty IDs
                    .map((category) => (
                    <SelectItem key={category._id} value={category._id!}>
                      {category.name} ({category.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Customer Selection */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>客戶 *</FormLabel>
                <div className="space-y-2">
                   {/* Customer selection and Add Customer button on same row */}
                   <div className="flex gap-2">
                     <div className="flex-1">
                       {/* Display Selected Customer */}
                       {field.value && (
                         <div className="p-1 bg-green-50 border border-green-200 rounded-md">
                           <div className="flex items-center justify-between">
                             <div>
                               <span className="font-medium text-green-900">
                                 {filteredCustomers.find(c => c._id === field.value)?.name || '已選客戶'}
                               </span>
                               <span className="text-sm text-green-700 ml-2">
                                 ({filteredCustomers.find(c => c._id === field.value)?.phone || 
                                   filteredCustomers.find(c => c._id === field.value)?.email || '無聯絡資訊'})
                               </span>
                             </div>
                             <Button
                               type="button"
                               variant="ghost"
                               size="sm"
                               onClick={() => {
                                 form.setValue("customerId", '');
                                 setCustomerSearch('');
                                 setShowCustomerSelection(false);
                               }}
                               className="text-green-600 hover:text-green-800"
                             >
                               更換
                             </Button>
                           </div>
                         </div>
                       )}
                       
                       {/* Select Customer Button */}
                       {!field.value && !showCustomerSelection && (
                         <Button
                           type="button"
                           variant="outline"
                           onClick={() => setShowCustomerSelection(true)}
                           className="w-full"
                         >
                           選擇客戶
                         </Button>
                       )}
                     </div>
                     
                     {/* Add Customer Button */}
                     <AddCustomerDialog
                      onCustomerAdded={handleCustomerAdded}
                      triggerButton={<Button type="button" variant="outline" size="icon"><Users className="h-4 w-4" /></Button>}
                    />
                   </div>
                   
                   {/* Customer Search and Selection */}
                   {!field.value && showCustomerSelection && (
                     <div className="space-y-2">
                       <div className="flex gap-2">
                         <Input
                           placeholder="搜尋客戶 (姓名、電話、Email)..."
                           value={customerSearch}
                           onChange={(e) => setCustomerSearch(e.target.value)}
                           className="flex-1"
                         />
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => {
                             setShowCustomerSelection(false);
                             setCustomerSearch('');
                           }}
                         >
                           取消
                         </Button>
                       </div>
                      <div 
                        style={{ 
                          height: '200px',
                          overflowY: 'auto',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: 'white'
                        }}
                      >
                        {(() => {
                          const filteredItems = filteredCustomers.filter(c => 
                            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            (c.phone && c.phone.toLowerCase().includes(customerSearch.toLowerCase())) ||
                            (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
                          );
                          
                          if (filteredItems.length === 0) {
                            return (
                              <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
                                {filteredCustomers.length === 0 
                                  ? (selectedCustomerCategoryId ? "此分類下沒有客戶。" : "沒有客戶資料。")
                                  : "找不到符合的客戶。"}
                              </div>
                            );
                          }
                          
                          return filteredItems.map((customer) => (
                            <div
                              key={customer._id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px',
                                cursor: 'pointer',
                                backgroundColor: customer._id === field.value ? '#dcfce7' : 'transparent',
                                borderBottom: '1px solid #f3f4f6'
                              }}
                              onMouseEnter={(e) => {
                                if (customer._id !== field.value) {
                                  e.currentTarget.style.backgroundColor = '#f9fafb';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (customer._id !== field.value) {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }
                              }}
                              onClick={() => {
                                 form.setValue("customerId", customer._id);
                                 setShowCustomerSelection(false);
                                 setCustomerSearch('');
                               }}
                            >
                              <CheckIcon
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  opacity: customer._id === field.value ? 1 : 0,
                                  color: '#22c55e'
                                }}
                              />
                              <span>{customer.name} ({customer.phone || customer.email || '無聯絡資訊'})</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                   )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Order Items */}
          <div className="space-y-3">
            <FormLabel>訂單明細</FormLabel>
            {fields.map((item, index) => {
              const filteredProductsForItem = getFilteredProductsForItem(index);
              return (
              <Card key={item.id} className="p-4 space-y-3 bg-muted/30">
                {/* Product Category Selection for this item */}
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium">
                    產品分類 (可選擇，若無則顯示全部)
                  </label>
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={selectedProductCategoryIds[index] || 'all'}
                      onValueChange={(categoryId) => handleProductCategoryChange(categoryId, index)}
                      disabled={isLoadingCategories}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={isLoadingCategories ? "載入中..." : "選擇產品分類 (可留空顯示全部)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有分類</SelectItem>
                        {productCategories
                          .filter(category => category._id && category._id.trim() !== '') // Filter out empty IDs
                          .map((category) => (
                          <SelectItem key={category._id} value={category._id!}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-[2fr_auto] gap-3 items-center">
                  <FormField
                    control={form.control}
                    name={`items.${index}.productId`}
                    render={({ field: productField }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>產品 *</FormLabel>
                        
                        {/* Display Selected Product */}
                        {productField.value && (
                          <div className="p-1 bg-blue-50 border border-blue-200 rounded-md">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-blue-900">
                                  {filteredProductsForItem.find(p => p._id === productField.value)?.name || '已選產品'}
                                </span>
                                <span className="text-sm text-blue-700 ml-2">
                                  (SKU: {filteredProductsForItem.find(p => p._id === productField.value)?.sku || 'N/A'})
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  productField.onChange('');
                                  form.setValue(`items.${index}.productName`, '');
                                  form.setValue(`items.${index}.productSku`, '');
                                  form.setValue(`items.${index}.unitPrice`, 0);
                                  setShowProductSelections(prev => ({...prev, [index]: false}));
                                }}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                更換
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Select Product Button */}
                        {!productField.value && !showProductSelections[index] && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowProductSelections(prev => ({...prev, [index]: true}))}
                            className="w-full"
                          >
                            選擇產品
                          </Button>
                        )}
                        
                        {/* Product Search and Selection */}
                        {!productField.value && showProductSelections[index] && (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                placeholder="搜尋產品 (名稱、SKU)..."
                                value={productSearches[index] || ''}
                                onChange={(e) => setProductSearches(prev => ({...prev, [index]: e.target.value}))}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowProductSelections(prev => ({...prev, [index]: false}));
                                  setProductSearches(prev => ({...prev, [index]: ''}));
                                }}
                              >
                                取消
                              </Button>
                            </div>
                            <div 
                              style={{ 
                                height: '250px',
                                overflowY: 'auto',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                backgroundColor: 'white'
                              }}
                            >
                            {(() => {
                              const filteredItems = filteredProductsForItem.filter(p => {
                                // Filter by search term
                                const matchesSearch = !productSearches[index] || 
                                  p.name.toLowerCase().includes((productSearches[index] || '').toLowerCase()) ||
                                  (p.sku && p.sku.toLowerCase().includes((productSearches[index] || '').toLowerCase()));
                                
                                // Filter out products already added to the order (but allow current selection)
                                const alreadyAdded = watchedItems.some((item, itemIndex) => 
                                  item.productId === p._id && itemIndex !== index
                                );
                                
                                return matchesSearch && !alreadyAdded;
                              });
                              
                              if (filteredItems.length === 0) {
                                return (
                                  <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
                                    {filteredProductsForItem.length === 0 
                                      ? (selectedProductCategoryIds[index] && selectedProductCategoryIds[index] !== 'all' ? "此分類下沒有產品。" : "沒有產品資料。")
                                      : "找不到符合的產品。"}
                                  </div>
                                );
                              }
                              
                              return filteredItems.map((product) => (
                                <div
                                  key={product._id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: product._id === productField.value ? '#dbeafe' : 'transparent',
                                    borderBottom: '1px solid #f3f4f6'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (product._id !== productField.value) {
                                      e.currentTarget.style.backgroundColor = '#f9fafb';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (product._id !== productField.value) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                  }}
                                  onClick={() => {
                                    productField.onChange(product._id);
                                    handleProductSelect(index, product._id);
                                    setShowProductSelections(prev => ({...prev, [index]: false}));
                                    setProductSearches(prev => ({...prev, [index]: ''}));
                                  }}
                                >
                                  <CheckIcon
                                    style={{
                                      width: '16px',
                                      height: '16px',
                                      opacity: product._id === productField.value ? 1 : 0,
                                      color: '#3b82f6'
                                    }}
                                  />
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <span style={{ color: product.stock <= 0 ? '#ef4444' : '#111827' }}>
                                      {product.name} (SKU: {product.sku || 'N/A'})
                                      {product.stock <= 0 && <span style={{ color: '#ef4444', marginLeft: '4px' }}>[缺貨]</span>}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                      庫存: <span style={{ color: product.stock <= 0 ? '#ef4444' : '#6b7280', fontWeight: product.stock <= 0 ? '500' : 'normal' }}>{product.stock}</span> - 價格: {formatCurrency(product.price)}
                                    </span>
                                  </div>
                                </div>
                              ));
                            })()}
                            </div>
                          </div>
                        )}
                        
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Quantity and Delete Button on same row */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col space-y-1">
                      <FormLabel className="text-xs text-muted-foreground">數量</FormLabel>
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: quantityField }) => (
                          <FormItem>
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
                                      // Trigger form validation and recalculation immediately
                                      form.trigger(`items.${index}.quantity`);
                                    }
                                  }
                                  // Force update totals
                                  setForceUpdateCounter(prev => prev + 1);
                                }}
                                onBlur={(e) => {
                                  // Ensure we have a valid number on blur
                                  const value = e.target.value;
                                  if (value === '' || isNaN(parseInt(value, 10))) {
                                    quantityField.onChange(1); // Default to 1 if invalid
                                  }
                                  quantityField.onBlur();
                                  // Trigger recalculation on blur as well
                                  form.trigger(`items.${index}.quantity`);
                                  // Force update totals
                                  setForceUpdateCounter(prev => prev + 1);
                                }}
                                name={quantityField.name}
                                ref={quantityField.ref}
                                className="w-20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        remove(index);
                        // Clean up states for this index
                        setShowProductSelections(prev => {
                          const newState = {...prev};
                          delete newState[index];
                          return newState;
                        });
                        setProductSearches(prev => {
                          const newState = {...prev};
                          delete newState[index];
                          return newState;
                        });
                      }}
                      className="text-destructive hover:text-destructive/80 shrink-0 mt-5"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
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
              );
            })}
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleAddProductLine} 
              className="w-full"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> 
              新增產品到訂單
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
                正在更新訂單...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                更新訂單
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
} 