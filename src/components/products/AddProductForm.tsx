"use client";

import { useState, type ChangeEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductFormInputSchema, type Product } from '@/models/Product';
import { type Category } from '@/models/Category';
import { addProduct } from '@/app/(app)/products/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, XCircle, CalendarIcon, UploadCloud } from 'lucide-react';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// Define the Zod schema for form values including coercions
const AddProductFormResolverSchema = ProductFormInputSchema.extend({
  price: z.coerce.number().min(0, { message: "Price must be a positive number" }),
  cost: z.coerce.number().min(0, { message: "Cost must be non-negative" }).optional().default(0),
  stock: z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" }),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.date().optional().nullable(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
});

type FormValuesType = z.infer<typeof AddProductFormResolverSchema>;

export function AddProductForm({ userId, onProductAdded }: { userId: string, onProductAdded?: (newProduct: Product) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFilesToUpload, setImageFilesToUpload] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchCategories() {
      setIsLoadingCategories(true);
      try {
        const result = await getCategories({ limit: 500 });
        setCategories(result.categories);
      } catch (error) {
        console.error("Failed to fetch categories for form:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load categories for selection." });
      }
      setIsLoadingCategories(false);
    }
    fetchCategories();
  }, [toast]);

  const form = useForm<FormValuesType>({
    resolver: zodResolver(AddProductFormResolverSchema),
    defaultValues: {
      name: '',
      sku: '',
      categoryId: undefined,
      categoryName: undefined,
      unitOfMeasure: '',
      price: 0,
      cost: 0,
      stock: 0,
      description: '',
      expiryDate: null,
      lowStockThreshold: 0,
    },
  });

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFiles = event.target.files;
    if (newFiles && newFiles.length > 0) {
      const newFilesArray = Array.from(newFiles);
      const updatedFiles = [...imageFilesToUpload];
      const currentFileNames = new Set(updatedFiles.map(f => f.name));
      newFilesArray.forEach(file => {
        if (!currentFileNames.has(file.name)) {
          updatedFiles.push(file);
        }
      });
      setImageFilesToUpload(updatedFiles);

      const allPreviews: string[] = [];
      let previewsLoaded = 0;
      if (updatedFiles.length === 0) {
        setImagePreviews([]);
        return;
      }
      updatedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          allPreviews.push(reader.result as string);
          previewsLoaded++;
          if (previewsLoaded === updatedFiles.length) {
            setImagePreviews(allPreviews);
          }
        }
        reader.readAsDataURL(file);
      });
    } else {
      // No new files selected
    }
    if (event.target) {
      event.target.value = '';
    }
  };

  const removeImagePreview = (index: number) => {
    const updatedFiles = [...imageFilesToUpload];
    updatedFiles.splice(index, 1);
    setImageFilesToUpload(updatedFiles);

    const updatedPreviews = [...imagePreviews];
    updatedPreviews.splice(index, 1);
    setImagePreviews(updatedPreviews);
  };

  const resetFormAndPreviews = () => {
    form.reset();
    setImagePreviews([]);
    setImageFilesToUpload([]); // Reset to empty array
    const fileInput = document.getElementById('images-input-in-dialog') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  async function onSubmit(data: FormValuesType) { // data does not contain 'images'
    console.log("[CLIENT] AddProductForm onSubmit: Function called. Data received from form (should not include images):", data);

    setIsSubmitting(true);
    const formData = new FormData();

    // Append react-hook-form managed data
    Object.entries(data).forEach(([key, value]) => {
      // The 'images' key should not exist in `data` anymore
      if (key === 'expiryDate' && value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      } else if ((key === 'cost' || key === 'lowStockThreshold') && (value === '' || value === undefined || value === null)) {
        formData.append(key, '0');
      }
    });

    // Append files from component state
    if (imageFilesToUpload && imageFilesToUpload.length > 0) {
      console.log("[CLIENT] AddProductForm onSubmit: imageFilesToUpload has files. Length:", imageFilesToUpload.length);
      for (let i = 0; i < imageFilesToUpload.length; i++) {
        formData.append('images', imageFilesToUpload[i]); // imageFilesToUpload is now File[]
        console.log("[CLIENT] AddProductForm onSubmit: Appended file from imageFilesToUpload:", imageFilesToUpload[i].name);
      }
    } else {
      console.log("[CLIENT] AddProductForm onSubmit: imageFilesToUpload is null or empty.");
    }

    formData.append('changedByUserId', userId);

    try {
      const result = await addProduct(formData);
      if (result.success && result.product) {
        toast({
          title: 'Product Added',
          description: `${result.product.name} has been successfully added.`,
        });
        resetFormAndPreviews();
        if (onProductAdded) onProductAdded(result.product);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Adding Product',
          description: result.error || 'An unknown error occurred.',
        });
        if (result.errors) {
          result.errors.forEach((err) => {
            form.setError(err.path.join('.') as keyof FormValuesType, { message: err.message });
          });
        }
      }
    } catch (error) {
      console.error("Error in addProduct submission:", error);
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'An unexpected error occurred during product submission.',
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
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      const selectedCat = categories.find(c => c._id === value);
                      field.onChange(value); // Set categoryId
                      form.setValue('categoryName', selectedCat?.name || ''); // Set categoryName
                    }}
                    value={field.value || ''}
                    disabled={isLoadingCategories}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCategories ? "Loading categories..." : "Select a category"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!isLoadingCategories && categories.length === 0 && (
                        <SelectItem value="no-categories-pls-add" disabled>
                          No categories found. Add one first.
                        </SelectItem>
                      )}
                      {categories.filter(category => typeof category._id === 'string' && category._id !== '').map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        date < new Date(new Date().setHours(0, 0, 0, 0))
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
            <FormLabel htmlFor="images-input-in-dialog">Product Images (Multiple)</FormLabel>
            <FormControl>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="images-input-in-dialog"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted transition-colors"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="mb-1 text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">Select multiple images if needed (e.g., PNG, JPG)</p>
                  </div>
                  <Input
                    id="images-input-in-dialog"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            </FormControl>
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


