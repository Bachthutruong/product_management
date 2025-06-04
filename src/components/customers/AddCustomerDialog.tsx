"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCustomerInputSchema, type CreateCustomerInput } from '@/models/Customer';
import { addCustomer } from '@/app/(app)/customers/actions';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, UserPlus } from 'lucide-react';

interface AddCustomerDialogProps {
  onCustomerAdded?: (newCustomer: CreateCustomerInput & { _id: string }) => void;
  triggerButton?: React.ReactNode; // Allow custom trigger
}

export function AddCustomerDialog({ onCustomerAdded, triggerButton }: AddCustomerDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerInputSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

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
