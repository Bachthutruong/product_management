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
import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { formatForCalendarDisplay } from '@/lib/date-utils';

// Define the Zod schema for form values including coercions
const AddProductFormResolverSchema = ProductFormInputSchema.extend({
  price: z.coerce.number().min(0, { message: "價格必須是非負數" }),
  cost: z.coerce.number().min(0, { message: "成本必須是非負數" }).optional().default(0),
  stock: z.coerce.number().int({ message: "庫存必須是整數" }).min(0, { message: "庫存必須是非負數" }),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.date({ message: "到期日期是必需的" }),
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
        toast({ variant: "destructive", title: "錯誤", description: "無法載入分類以供選擇。" });
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
      expiryDate: undefined,
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
          title: '產品已新增',
          description: `${result.product.name} 已成功新增。`,
        });
        resetFormAndPreviews();
        if (onProductAdded) onProductAdded(result.product);
      } else {
        toast({
          variant: 'destructive',
          title: '新增產品錯誤',
          description: result.error || '發生未知錯誤。',
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
        title: '提交錯誤',
        description: '新增產品時發生意外錯誤。',
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
                <FormLabel>產品名稱</FormLabel>
                <FormControl>
                  <Input placeholder="例如：超級小部件" {...field} />
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
                    <Input placeholder="例如：SW-001" {...field} />
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
                  <FormLabel>分類</FormLabel>
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
                        <SelectValue placeholder={isLoadingCategories ? "正在載入分類..." : "選擇一個分類"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!isLoadingCategories && categories.length === 0 && (
                        <SelectItem value="no-categories-pls-add" disabled>
                          找不到分類。請先新增一個。
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
                  <FormLabel>價格</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="decimal" placeholder="例如：19.99" {...field} />
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
                  <FormLabel>成本</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="decimal" placeholder="例如：10.50" {...field} />
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
                  <FormLabel>庫存數量</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="numeric" placeholder="例如：100" {...field} />
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
                  <FormLabel>計量單位</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：個, 盒, 公斤" {...field} />
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
                  <FormLabel>低庫存閾值</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="numeric" placeholder="例如：10" {...field} />
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
                <FormLabel>到期日期 (必填)</FormLabel>
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
                          formatForCalendarDisplay(field.value)
                        ) : (
                          <span>選擇日期</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DatePickerCalendar
                      selected={field.value || undefined}
                      onSelect={(date) => field.onChange(date || null)}
                      disabled={(date) =>
                        date < new Date(new Date().setHours(0, 0, 0, 0))
                      }
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
                <FormLabel>描述 (選填)</FormLabel>
                <FormControl>
                  <Textarea placeholder="輸入產品的簡要描述..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel htmlFor="images-input-in-dialog">產品圖片 (多張)</FormLabel>
            <FormControl>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="images-input-in-dialog"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted transition-colors"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="mb-1 text-sm text-muted-foreground">
                      <span className="font-semibold">點擊上傳</span> 或拖曳檔案
                    </p>
                    <p className="text-xs text-muted-foreground">如果需要，選擇多張圖片 (例如：PNG, JPG)</p>
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
                    alt={`預覽 ${index + 1}`}
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
                    <span className="sr-only">移除圖片</span>
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
            新增產品
          </Button>
        </div>
      </form>
    </Form>
  );
}


