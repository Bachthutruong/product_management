
"use client";

import { useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductFormInputSchema, type AddProductFormValues } from '@/models/Product';
import { addProduct } from '@/app/(app)/products/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, XCircle, CalendarIcon } from 'lucide-react';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function AddProductForm({ userId, onProductAdded }: { userId: string, onProductAdded?: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<AddProductFormValues>({
    resolver: zodResolver(ProductFormInputSchema.extend({
      price: z.union([z.string(), z.number()]).pipe(z.coerce.number().min(0, { message: "Price must be a positive number" })),
      cost: z.union([z.string(), z.number()]).optional().pipe(z.coerce.number().min(0, { message: "Cost must be non-negative" }).default(0)),
      stock: z.union([z.string(), z.number()]).pipe(z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" })),
      lowStockThreshold: z.union([z.string(), z.number()]).optional().pipe(z.coerce.number().int().min(0).optional().default(0)),
      expiryDate: z.date().optional().nullable(),
    })),
    defaultValues: {
      name: '',
      sku: '',
      category: '',
      unitOfMeasure: '',
      price: '', // Keep as string for controlled input, Zod will coerce
      cost: '',  // Keep as string
      stock: '',  // Keep as string
      description: '',
      images: null,
      expiryDate: null,
      lowStockThreshold: '', // Keep as string
    },
  });

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      form.setValue('images', files);
      const newPreviews: string[] = [];
      Array.from(files).forEach(file => newPreviews.push(URL.createObjectURL(file)));
      setImagePreviews(newPreviews);
    } else {
      form.setValue('images', null);
      setImagePreviews([]);
    }
  };

  const removeImagePreview = (index: number) => {
    const currentFiles = form.getValues('images');
    if (currentFiles) {
      const newFilesArray = Array.from(currentFiles);
      newFilesArray.splice(index, 1);
      
      const dataTransfer = new DataTransfer();
      newFilesArray.forEach(file => dataTransfer.items.add(file));
      form.setValue('images', dataTransfer.files.length > 0 ? dataTransfer.files : null);

      const newPreviews = [...imagePreviews];
      newPreviews.splice(index, 1);
      setImagePreviews(newPreviews);
    }
  };

  async function onSubmit(data: AddProductFormValues) {
    setIsSubmitting(true);

    const formData = new FormData();
    // Append text fields, ensuring numeric fields are sent as strings if they are empty or valid numbers
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'images') {
        // Handled below
      } else if (key === 'expiryDate' && value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value !== undefined && value !== null) {
         // For numeric fields, send the string value (even if empty)
         // Zod on server-side will coerce/validate
         formData.append(key, String(value));
      }
    });
    
    // Append image files
    if (data.images instanceof FileList) {
      for (let i = 0; i < data.images.length; i++) {
        formData.append('images', data.images[i]);
      }
    }
    
    formData.append('changedByUserId', userId); 

    try {
      const result = await addProduct(formData);
      if (result.success && result.product) {
        toast({
          title: 'Product Added',
          description: `${result.product.name} has been successfully added.`,
        });
        form.reset({ 
          name: '', sku: '', category: '', unitOfMeasure: '',
          price: '', cost:'', stock: '', description: '', images: null,
          expiryDate: null, lowStockThreshold: '',
        });
        setImagePreviews([]);
        const fileInput = document.getElementById('images-input-in-dialog') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        if (onProductAdded) onProductAdded();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Adding Product',
          description: result.error || 'An unknown error occurred.',
        });
        if (result.errors) {
          result.errors.forEach((err) => {
            form.setError(err.path.join('.') as keyof AddProductFormValues, { message: err.message });
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Super Widget" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., SW-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Electronics" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input type="text" inputMode="decimal" placeholder="e.g., 19.99" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost</FormLabel>
                    <FormControl>
                      <Input type="text" inputMode="decimal" placeholder="e.g., 10.50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Quantity</FormLabel>
                    <FormControl>
                      <Input type="text" inputMode="numeric" placeholder="e.g., 100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unitOfMeasure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit of Measure</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., pcs, box, kg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low Stock Threshold</FormLabel>
                    <FormControl>
                      <Input type="text" inputMode="numeric" placeholder="e.g., 10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expiry Date (Optional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined} 
                          onSelect={(date) => field.onChange(date || null)} 
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0,0,0,0)) 
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
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
                    <Textarea placeholder="Brief description of the product..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem>
              <FormLabel htmlFor="images-input-in-dialog">Product Images</FormLabel>
              <FormControl>
                <Input 
                  id="images-input-in-dialog" 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleImageChange}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </FormControl>
              <FormMessage>{form.formState.errors.images?.message as React.ReactNode}</FormMessage>
            </FormItem>

            {imagePreviews.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {imagePreviews.map((src, index) => (
                  <div key={index} className="relative group aspect-square">
                    <Image
                      src={src}
                      alt={`Preview ${index + 1}`}
                      width={100}
                      height={100}
                      className="object-cover w-full h-full rounded-md border"
                      data-ai-hint="product image preview"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-black/50 text-white hover:bg-destructive hover:text-destructive-foreground rounded-full opacity-75 group-hover:opacity-100"
                      onClick={() => removeImagePreview(index)}
                    >
                      <XCircle className="h-4 w-4" />
                      <span className="sr-only">Remove image</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="pt-4"> 
          <Button type="submit" disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            Add Product
          </Button>
        </div>
      </form>
    </Form>
  );
}
