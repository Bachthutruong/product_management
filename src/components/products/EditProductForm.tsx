"use client";

import { useState, type ChangeEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProductFormInputSchema, type Product, type ProductImage } from '@/models/Product';
import { type Category } from '@/models/Category';
import { updateProduct } from '@/app/(app)/products/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, XCircle, CalendarIcon, UploadCloud, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePickerCalendar } from '@/components/ui/enhanced-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { formatForCalendarDisplay } from '@/lib/date-utils';

const EditProductFormResolverSchema = ProductFormInputSchema.extend({
  price: z.coerce.number().min(0, { message: "價格必須是非負數" }),
  cost: z.coerce.number().min(0, { message: "成本必須是非負數" }).optional().default(0),
  stock: z.coerce.number().int({ message: "庫存必須是整數" }).min(0, { message: "庫存必須是非負數" }),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.date({ message: "到期日期是必需的" }),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
});
// This is the type that react-hook-form will work with internally for values.
// It does NOT include `images` or `imagesToDelete[]` as those are handled outside react-hook-form's state for submission.
type EditFormValuesType = z.infer<typeof EditProductFormResolverSchema>;


interface EditProductFormProps {
  product: Product;
  userId: string;
  onProductUpdated?: (updatedProduct: Product) => void;
  onCancel?: () => void;
}

export function EditProductForm({ product, userId, onProductUpdated, onCancel }: EditProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ProductImage[]>(product.images || []);
  const [imagesToDeletePublicIds, setImagesToDeletePublicIds] = useState<string[]>([]);
  const [newRawFiles, setNewRawFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const form = useForm<EditFormValuesType>({
    resolver: zodResolver(EditProductFormResolverSchema),
    defaultValues: {
      name: product.name || '',
      sku: product.sku || '',
      categoryId: product.categoryId || undefined,
      categoryName: product.categoryName || undefined,
      unitOfMeasure: product.unitOfMeasure || '',
      price: product.price ?? undefined,
      cost: product.cost ?? undefined,
      stock: product.stock ?? undefined,
      description: product.description || '',
      expiryDate: product.expiryDate ? new Date(product.expiryDate) : undefined,
      lowStockThreshold: product.lowStockThreshold ?? undefined,
    },
  });

  useEffect(() => {
    async function fetchCategoriesData() {
      setIsLoadingCategories(true);
      try {
        const result = await getCategories({ limit: 500 }); // Fetch a good number for the dropdown
        setCategories(result.categories);
      } catch (error) {
        console.error("Failed to fetch categories for edit form:", error);
        toast({ variant: "destructive", title: "載入分類錯誤", description: "無法載入分類以供選擇。" });
      }
      setIsLoadingCategories(false);
    }
    fetchCategoriesData();
  }, [toast]);

  useEffect(() => {
    form.reset({
      name: product.name || '',
      sku: product.sku || '',
      categoryId: product.categoryId || undefined,
      categoryName: product.categoryName || undefined,
      unitOfMeasure: product.unitOfMeasure || '',
      price: product.price ?? undefined,
      cost: product.cost ?? undefined,
      stock: product.stock ?? undefined,
      description: product.description || '',
      expiryDate: product.expiryDate ? new Date(product.expiryDate) : undefined,
      lowStockThreshold: product.lowStockThreshold ?? undefined,
    });
    setExistingImages(product.images || []);
    setNewImagePreviews([]);
    setImagesToDeletePublicIds([]);
    setNewRawFiles([]);
    const fileInput = document.getElementById('images-input-in-edit-dialog') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, [product, form]);

  const handleNewImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const selectedFilesArray = Array.from(selectedFiles);
      console.log("[CLIENT] EditProductForm handleNewImageChange: New files selected:", selectedFilesArray.length, selectedFilesArray);

      // Combine with existing new files being staged
      const updatedNewRawFiles = [...newRawFiles];
      const currentNewFileNames = new Set(updatedNewRawFiles.map(f => f.name));
      selectedFilesArray.forEach(file => {
        if (!currentNewFileNames.has(file.name)) { // Basic duplicate prevention for new files
          updatedNewRawFiles.push(file);
        }
      });
      setNewRawFiles(updatedNewRawFiles);

      // Update previews for all NEWLY staged files
      const newFilePreviewsArray: string[] = [];
      let previewsLoaded = 0;
      if (updatedNewRawFiles.length === 0) {
        setNewImagePreviews([]);
      } else {
        updatedNewRawFiles.forEach(file => {
          // For newly added files, generate blob URLs for preview
          newFilePreviewsArray.push(URL.createObjectURL(file));
        });
        setNewImagePreviews(newFilePreviewsArray);
      }
    } else {
      console.log("[CLIENT] EditProductForm handleNewImageChange: No new files selected in this interaction.");
    }
    // Reset file input to allow re-selection of same file if needed
    if (event.target) {
      event.target.value = '';
    }
  };

  const removeNewImagePreview = (index: number) => {
    console.log("[CLIENT] EditProductForm removeNewImagePreview: Removing new image at index", index);
    const updatedNewRawFiles = [...newRawFiles];
    const removedFile = updatedNewRawFiles.splice(index, 1)[0];
    if (removedFile && newImagePreviews[index]?.startsWith('blob:')) {
      URL.revokeObjectURL(newImagePreviews[index]); // Clean up blob URL
    }
    setNewRawFiles(updatedNewRawFiles);

    const updatedPreviews = [...newImagePreviews];
    updatedPreviews.splice(index, 1);
    setNewImagePreviews(updatedPreviews);
  };

  const markExistingImageForDeletion = (publicId: string) => {
    console.log("[CLIENT] EditProductForm markExistingImageForDeletion: Marking image for deletion, publicId:", publicId);
    setImagesToDeletePublicIds(prev => [...prev, publicId]);
    setExistingImages(prev => prev.filter((img) => img.publicId !== publicId));
  };

  async function onSubmit(data: EditFormValuesType) {
    if (!currentUser) {
      toast({ variant: "destructive", title: "認證錯誤", description: "使用者未驗證。請重新登入。" });
      return;
    }
    setIsSubmitting(true);

    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'expiryDate' && value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      } else if ((key === 'cost' || key === 'lowStockThreshold' || key === 'price' || key === 'stock') && (value === '' || value === undefined || value === null)) {
        if (key === 'cost' || key === 'lowStockThreshold') formData.append(key, '0');
      }
    });
    formData.append('changedByUserId', userId);

    if (newRawFiles && newRawFiles.length > 0) {
      console.log("[CLIENT] EditProductForm onSubmit: newRawFiles has files. Length:", newRawFiles.length);
      for (let i = 0; i < newRawFiles.length; i++) {
        formData.append('images', newRawFiles[i]);
        console.log("[CLIENT] EditProductForm onSubmit: Appended new file:", newRawFiles[i].name);
      }
    } else {
      console.log("[CLIENT] EditProductForm onSubmit: No new files in newRawFiles to upload.");
    }

    imagesToDeletePublicIds.forEach(publicId => {
      formData.append('imagesToDelete[]', publicId);
    });

    try {
      const result = await updateProduct(product._id, formData, currentUser);
      if (result.success && result.product) {
        toast({
          title: '產品已更新',
          description: `${result.product.name} 已成功更新。`,
        });
        if (onProductUpdated) onProductUpdated(result.product);
      } else {
        toast({
          variant: 'destructive',
          title: '更新產品錯誤',
          description: result.error || '發生未知錯誤。',
        });
        if (result.errors) {
          result.errors.forEach((err) => {
            form.setError(err.path.join('.') as keyof EditFormValuesType, { message: err.message });
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
                      field.onChange(value);
                      form.setValue('categoryName', selectedCat?.name || '');
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
                        <SelectItem value="no-categories-pls-add" disabled>找不到分類。請先新增一個。</SelectItem>
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
                    <Input type="text" inputMode="decimal" placeholder="例如：19.99" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} />
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
                  <FormLabel>成本 (選填)</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="decimal" placeholder="例如：9.99" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} />
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
                    <Input type="text" inputMode="numeric" placeholder="例如：100" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} />
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
                  <FormLabel>計量單位 (選填)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：個, 公斤, 公升" {...field} />
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
                  <FormLabel>低庫存閾值 (選填)</FormLabel>
                  <FormControl>
                    <Input type="text" inputMode="numeric" placeholder="例如：10" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : e.target.value)} />
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
                          formatForCalendarDisplay(new Date(field.value))
                        ) : (
                          <span>選擇日期</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <DatePickerCalendar
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => field.onChange(date || undefined)}
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
                  <Textarea placeholder="詳細產品描述..." {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {existingImages.length > 0 && (
            <FormItem>
              <FormLabel>現有圖片</FormLabel>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {existingImages.map((image) => (
                  <div key={image.publicId} className="relative aspect-square group">
                    <Image
                      src={image.url}
                      alt="現有產品圖片"
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="rounded-md object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-80 group-hover:opacity-100 transition-opacity z-10"
                      onClick={() => markExistingImageForDeletion(image.publicId)}
                      title="刪除此圖片"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </FormItem>
          )}

          <FormItem>
            <FormLabel htmlFor="images-input-in-edit-dialog">新增圖片 (多張)</FormLabel>
            <FormControl>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="images-input-in-edit-dialog"
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
                    id="images-input-in-edit-dialog"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleNewImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            </FormControl>
          </FormItem>

          {newImagePreviews.length > 0 && (
            <FormItem>
              <FormLabel>待上傳的新圖片</FormLabel>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {newImagePreviews.map((previewUrl, index) => (
                  <div key={previewUrl} className="relative aspect-square group">
                    <Image
                      src={previewUrl}
                      alt={`新圖片預覽 ${index + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="rounded-md object-cover"
                      onError={() => URL.revokeObjectURL(previewUrl)}
                      onLoad={() => { if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl); }}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-80 group-hover:opacity-100 transition-opacity z-10"
                      onClick={() => removeNewImagePreview(index)}
                      title="移除此新圖片"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </FormItem>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-border">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              取消
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting || isLoadingCategories} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSubmitting ? "正在儲存變更..." : "儲存變更"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
