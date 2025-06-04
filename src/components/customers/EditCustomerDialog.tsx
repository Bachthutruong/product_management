"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCustomerInputSchema, type CreateCustomerInput, type Customer } from '@/models/Customer';
import { updateCustomer } from '@/app/(app)/customers/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit3, Save } from 'lucide-react';

interface EditCustomerDialogProps {
  customer: Customer | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerUpdated?: () => void;
}

const EditCustomerFormSchema = CreateCustomerInputSchema.partial();
type EditCustomerFormValues = Partial<CreateCustomerInput>;


export function EditCustomerDialog({ customer, isOpen, onOpenChange, onCustomerUpdated }: EditCustomerDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<EditCustomerFormValues>({
    resolver: zodResolver(EditCustomerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
      });
    } else {
      form.reset({ name: '', email: '', phone: '', address: '' });
    }
  }, [customer, form, isOpen]); // Reset form when customer or isOpen changes

  async function onSubmit(data: EditCustomerFormValues) {
    if (!customer) return;
    setIsSubmitting(true);
    try {
      const result = await updateCustomer(customer._id, data);
      if (result.success && result.customer) {
        toast({
          title: '客戶已更新',
          description: `${result.customer.name} 已成功更新。`,
        });
        if (onCustomerUpdated) onCustomerUpdated();
        onOpenChange(false); // Close dialog
      } else {
        toast({
          variant: 'destructive',
          title: '更新客戶錯誤',
          description: result.error || '發生未知錯誤。',
        });
         if (result.errors) {
          result.errors.forEach((err) => {
            // For partial schemas, path might be just the field name.
            const fieldName = err.path[0] as keyof EditCustomerFormValues;
            if (fieldName) {
                 form.setError(fieldName, { message: err.message });
            }
          });
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '提交錯誤',
        description: '更新客戶時發生意外錯誤。',
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Edit3 className="mr-2 h-6 w-6 text-primary" />
            編輯客戶: {customer.name}
          </DialogTitle>
          <DialogDescription>
            修改客戶詳細資訊。完成後請點擊「儲存變更」。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>全名</FormLabel>
                  <FormControl>
                    <Input placeholder="王小明" {...field} disabled={isSubmitting} />
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
                  <Save className="mr-2 h-4 w-4" />
                )}
                儲存變更
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
