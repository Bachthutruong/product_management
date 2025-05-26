
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
          title: 'Customer Updated',
          description: `${result.customer.name} has been successfully updated.`,
        });
        if (onCustomerUpdated) onCustomerUpdated();
        onOpenChange(false); // Close dialog
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Updating Customer',
          description: result.error || 'An unknown error occurred.',
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
        title: 'Submission Error',
        description: 'An unexpected error occurred while updating the customer.',
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
            Edit Customer: {customer.name}
          </DialogTitle>
          <DialogDescription>
            Modify the customer details below. Click "Save Changes" when you're done.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} disabled={isSubmitting} />
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
                  <FormLabel>Email Address (Optional)</FormLabel>
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
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+1234567890" {...field} disabled={isSubmitting} />
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
                  <FormLabel>Address (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="123 Main St, Anytown, USA" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
               <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
