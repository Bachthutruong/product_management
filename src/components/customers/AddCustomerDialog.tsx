"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCustomerInputSchema, type CreateCustomerInput } from '@/models/Customer';
import { addCustomer } from '@/app/(app)/customers/actions';
import { getCustomerCategories } from '@/app/(app)/customer-categories/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, UserPlus } from 'lucide-react';
import { type CustomerCategory } from '@/models/CustomerCategory';

interface AddCustomerDialogProps {
  onCustomerAdded?: (newCustomer: CreateCustomerInput & { _id: string }) => void;
  triggerButton?: React.ReactNode; // Allow custom trigger
}

export function AddCustomerDialog({ onCustomerAdded, triggerButton }: AddCustomerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerCategories, setCustomerCategories] = useState<CustomerCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const { toast } = useToast();

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerInputSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      customerCode: '',
      notes: '',
      categoryId: '',
    },
  });

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const categories = await getCustomerCategories();
        setCustomerCategories(categories.filter(cat => cat.isActive));
      } catch (error) {
        console.error('Error loading customer categories:', error);
        toast({
          title: "載入失敗",
          description: "無法載入客戶分類資料。",
          variant: "destructive",
        });
      } finally {
        setIsLoadingCategories(false);
      }
    };

    if (isOpen) {
      loadCategories();
    }
  }, [isOpen, toast]);

  async function onSubmit(data: CreateCustomerInput) {
    setIsSubmitting(true);
    try {
      const result = await addCustomer(data);
      if (result.success && result.customer) {
        toast({
          title: '客戶已新增',
          description: `${result.customer.name} 已成功新增。`,
        });
        form.reset();
        setIsOpen(false);
        //@ts-expect-error _id is not in Customer model but might be added dynamically
        if (onCustomerAdded) onCustomerAdded(result.customer);
      } else {
        toast({
          variant: 'destructive',
          title: '新增客戶錯誤',
          description: result.error || '發生未知錯誤。',
        });
        if (result.errors) {
          result.errors.forEach((err) => {
            form.setError(err.path[0] as keyof CreateCustomerInput, { message: err.message });
          });
        }
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

  const defaultTrigger = (
    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
      <UserPlus className="mr-2 h-5 w-5" /> 新增客戶
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) form.reset(); }}>
      <DialogTrigger asChild>
        {triggerButton || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserPlus className="mr-2 h-6 w-6 text-primary" />
            新增客戶
          </DialogTitle>
          <DialogDescription>
            填寫新客戶的詳細資訊。電子郵件和電話為選填欄位。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>客戶分類 *</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting || isLoadingCategories}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCategories ? "載入中..." : "選擇客戶分類"} />
                      </SelectTrigger>
                      <SelectContent>
                        {customerCategories.map((category) => (
                          <SelectItem key={category._id} value={category._id!}>
                            {category.name} ({category.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>全名 *</FormLabel>
                  <FormControl>
                    <Input placeholder="王小明" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>客戶編號 (選填)</FormLabel>
                  <FormControl>
                    <Input placeholder="A0001" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>電子郵件地址 (選填)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="customer@example.com" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>電話號碼 (選填)</FormLabel>
                  <FormControl>
                    <Input placeholder="+886912345678" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地址 (選填)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="台灣台北市信義區市府路1號" {...field} disabled={isSubmitting} />
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
                  <FormLabel>備註 (選填)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="關於此客戶的額外資訊..." {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  取消
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-4 w-4" />
                )}
                新增客戶
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
