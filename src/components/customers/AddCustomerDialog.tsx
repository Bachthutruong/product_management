
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
          title: 'Customer Added',
          description: `${result.customer.name} has been successfully added.`,
        });
        form.reset();
        setIsOpen(false);
        //@ts-expect-error _id is not in Customer model but might be added dynamically
        if (onCustomerAdded) onCustomerAdded(result.customer);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Adding Customer',
          description: result.error || 'An unknown error occurred.',
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
        title: 'Submission Error',
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const defaultTrigger = (
    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
      <UserPlus className="mr-2 h-5 w-5" /> Add Customer
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
            Add New Customer
          </DialogTitle>
          <DialogDescription>
            Fill in the details for the new customer. Email and phone are optional.
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
                  <PlusCircle className="mr-2 h-4 w-4" />
                )}
                Add Customer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
