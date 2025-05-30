"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CategoryFormInputSchema, type CategoryFormInput, type Category } from '@/models/Category';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Save, PlusCircle } from 'lucide-react';
import { useEffect } from 'react';

interface CategoryFormProps {
    onSubmit: (data: CategoryFormInput) => Promise<void>;
    initialData?: Category | null;
    isSubmitting?: boolean;
    submitButtonText?: string;
    onCancel?: () => void;
}

export function CategoryForm({
    onSubmit,
    initialData,
    isSubmitting = false,
    submitButtonText,
    onCancel
}: CategoryFormProps) {
    const form = useForm<CategoryFormInput>({
        resolver: zodResolver(CategoryFormInputSchema),
        defaultValues: initialData ?
            { name: initialData.name, description: initialData.description || '' } :
            { name: '', description: '' },
    });

    useEffect(() => {
        if (initialData) {
            form.reset({ name: initialData.name, description: initialData.description || '' });
        } else {
            form.reset({ name: '', description: '' });
        }
    }, [initialData, form]);

    const Icon = initialData ? Save : PlusCircle;
    const buttonText = submitButtonText || (initialData ? 'Save Changes' : 'Add Category');

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Category Name</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., Electronics, Apparel" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Brief description of the category..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                    {onCancel && (
                        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Icon className="mr-2 h-4 w-4" />
                        )}
                        {buttonText}
                    </Button>
                </div>
            </form>
        </Form>
    );
} 