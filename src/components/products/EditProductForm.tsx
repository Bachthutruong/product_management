
"use client";

import { useState, type ChangeEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductFormInputSchema, type Product, type ProductImage } from '@/models/Product'; // Removed AddProductFormValues as it's not used here
import { updateProduct } from '@/app/(app)/products/actions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, XCircle, CalendarIcon } from 'lucide-react'; // Removed UploadCloud, not used
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// Schema for form values, allowing strings for numeric/date fields that will be coerced
const EditProductFormValuesSchema = ProductFormInputSchema.extend({
  price: z.union([z.string(), z.number()]).pipe(z.coerce.number().min(0, { message: "Price must be a positive number" })),
  cost: z.union([z.string(), z.number()]).optional().pipe(z.coerce.number().min(0, { message: "Cost must be non-negative" }).default(0)),
  stock: z.union([z.string(), z.number()]).pipe(z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" })),
  lowStockThreshold: z.union([z.string(), z.number()]).optional().pipe(z.coerce.number().int().min(0).optional().default(0)),
  expiryDate: z.date().optional().nullable(),
});
type EditProductFormValues = z.infer<typeof EditProductFormValuesSchema>;


interface EditProductFormProps {
  product: Product;
  userId: string;
  onProductUpdated?: () => void;
  onCancel?: () => void;
}

export function EditProductForm({ product, userId, onProductUpdated, onCancel }: EditProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ProductImage[]>(product.images || []);
  const [imagesToDeletePublicIds, setImagesToDeletePublicIds] = useState<string[]>([]);
  const [newRawFiles, setNewRawFiles] = useState<FileList | null>(null); // State for new raw files
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const form = useForm<EditProductFormValues>({
    resolver: zodResolver(EditProductFormValuesSchema),
    defaultValues: {
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      unitOfMeasure: product.unitOfMeasure || '',
      price: product.price ?? 0,
      cost: product.cost ?? 0,
      stock: product.stock ?? 0,
      description: product.description || '',
      expiryDate: product.expiryDate ? new Date(product.expiryDate) : null,
      lowStockThreshold: product.lowStockThreshold ?? 0,
    },
  });

  useEffect(() => {
    form.reset({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      unitOfMeasure: product.unitOfMeasure || '',
      price: product.price ?? 0,
      cost: product.cost ?? 0,
      stock: product.stock ?? 0,
      description: product.description || '',
      expiryDate: product.expiryDate ? new Date(product.expiryDate) : null,
      lowStockThreshold: product.lowStockThreshold ?? 0,
    });
    setExistingImages(product.images || []);
    setNewImagePreviews([]);
    setImagesToDeletePublicIds([]);
    setNewRawFiles(null); // Reset new raw files
    // Clear file input explicitly
    const fileInput = document.getElementById('images-input-in-edit-dialog') as HTMLInputElement;
    if (fileInput) fileInput.value = '';

  }, [product, form]);

  const handleNewImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setNewRawFiles(files); // Set new raw files to state
      const previews: string[] = [];
      Array.from(files).forEach(file => previews.push(URL.createObjectURL(file)));
      setNewImagePreviews(previews);
    } else {
      setNewRawFiles(null);
      setNewImagePreviews([]);
    }
  };

  const removeNewImagePreview = (index: number) => {
    const currentFiles = newRawFiles;
    if (currentFiles) {
      const newFilesArray = Array.from(currentFiles);
      newFilesArray.splice(index, 1);
      
      const dataTransfer = new DataTransfer();
      newFilesArray.forEach(file => dataTransfer.items.add(file));
      setNewRawFiles(dataTransfer.files.length > 0 ? dataTransfer.files : null); // Update state

      const previews = [...newImagePreviews];
      previews.splice(index, 1);
      setNewImagePreviews(previews);
    }
  };

  const markExistingImageForDeletion = (publicId: string, index: number) => {
    setImagesToDeletePublicIds(prev => [...prev, publicId]);
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(data: EditProductFormValues) {
    if (!currentUser) {
        toast({ variant: "destructive", title: "Error", description: "User not authenticated." });
        return;
    }
    setIsSubmitting(true);

    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'expiryDate' && value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value !== undefined && value !== null && value !== '') {
         formData.append(key, String(value));
      }
    });
    formData.append('changedByUserId', userId);

    // Append new images if any
    if (newRawFiles) { // Use newRawFiles from state
      for (let i = 0; i < newRawFiles.length; i++) {
        formData.append('images', newRawFiles[i]);
      }
    }
    
    // Append publicIds of images to delete
    imagesToDeletePublicIds.forEach(publicId => {
      formData.append('imagesToDelete[]', publicId);
    });

    // Ensure numeric fields that might be empty strings are set correctly for Zod on the server
    if (data.price === 0 || (typeof data.price === 'string' && parseFloat(data.price) === 0) ) formData.set('price', '0');
    if (data.cost === 0 || (typeof data.cost === 'string' && parseFloat(data.cost) === 0) ) formData.set('cost', '0');
    if (data.stock === 0 || (typeof data.stock === 'string' && parseInt(data.stock) === 0) ) formData.set('stock', '0');
    if (data.lowStockThreshold === 0 || (typeof data.lowStockThreshold === 'string' && parseInt(data.lowStockThreshold) === 0)) {
        formData.set('lowStockThreshold', '0');
    }


    try {
      const result = await updateProduct(product._id, formData, currentUser);
      if (result.success && result.product) {
        toast({
          title: 'Product Updated',
          description: `${result.product.name} has been successfully updated.`,
        });
        if (onProductUpdated) onProductUpdated();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Updating Product',
          description: result.error || 'An unknown error occurred.',
        });
        if (result.errors) {
          result.errors.forEach((err) => {
            form.setError(err.path.join('.') as keyof EditProductFormValues, { message: err.message });
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
                       <Input type="number" step="0.01" placeholder="e.g., 19.99" {...field} 
                       onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                       value={field.value ?? ""} />
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
                      <Input type="number" step="0.01" placeholder="e.g., 10.50" {...field} 
                       onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                       value={field.value ?? ""} />
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
                      <Input type="number" step="1" placeholder="e.g., 100" {...field} 
                       onChange={e => field.onChange(e.target.value === '' ? '' : parseInt(e.target.value,10))}
                       value={field.value ?? ""}/>
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
                      <Input type="number" step="1" placeholder="e.g., 10" {...field} 
                       onChange={e => field.onChange(e.target.value === '' ? '' : parseInt(e.target.value,10))}
                       value={field.value ?? ""}/>
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
                              format(new Date(field.value), "PPP")
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
                          selected={field.value ? new Date(field.value) : undefined}
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
            
            {/* Existing Images */}
            {existingImages.length > 0 && (
              <FormItem>
                <FormLabel>Current Images</FormLabel>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {existingImages.map((image, index) => (
                    <div key={image.publicId} className="relative group aspect-square">
                      <Image
                        src={image.url}
                        alt={`Current image ${index + 1}`}
                        width={100}
                        height={100}
                        className="object-cover w-full h-full rounded-md border"
                        data-ai-hint="product item existing"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 bg-black/50 text-white hover:bg-destructive hover:text-destructive-foreground rounded-full opacity-75 group-hover:opacity-100"
                        onClick={() => markExistingImageForDeletion(image.publicId, index)}
                      >
                        <XCircle className="h-4 w-4" />
                        <span className="sr-only">Remove image</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </FormItem>
            )}

            {/* New Images Upload */}
            <FormItem>
              <FormLabel htmlFor="images-input-in-edit-dialog">Add New Images</FormLabel>
              <FormControl>
                <Input 
                  id="images-input-in-edit-dialog" // Unique ID for file input
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleNewImageChange}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </FormControl>
              {/* Intentionally not showing form.formState.errors.images here as 'images' is not in the Zod schema for this form */}
            </FormItem>

            {newImagePreviews.length > 0 && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {newImagePreviews.map((src, index) => (
                  <div key={index} className="relative group aspect-square">
                    <Image
                      src={src}
                      alt={`New preview ${index + 1}`}
                      width={100}
                      height={100}
                      className="object-cover w-full h-full rounded-md border"
                      data-ai-hint="product image preview new"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-black/50 text-white hover:bg-destructive hover:text-destructive-foreground rounded-full opacity-75 group-hover:opacity-100"
                      onClick={() => removeNewImagePreview(index)}
                    >
                      <XCircle className="h-4 w-4" />
                      <span className="sr-only">Remove new image</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="pt-4 flex justify-end gap-2">
           <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </Form>
  );
}

