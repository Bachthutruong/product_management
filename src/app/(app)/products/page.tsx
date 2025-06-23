'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getProducts, deleteProduct } from '@/app/(app)/products/actions';
import { getCategories } from '@/app/(app)/categories/actions';
import type { Product, ProductImage } from '@/models/Product';
import type { Category } from '@/models/Category';
import type { UserRole } from '@/models/User';
import { useAuth } from '@/hooks/useAuth';
import { AddProductForm } from '@/components/products/AddProductForm';
import { EditProductForm } from '@/components/products/EditProductForm';
import { ProductStockInHistoryDialog } from '@/components/products/ProductStockInHistoryDialog';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, ImageOff, CalendarClock, AlertCircle, Edit3, PackageX, PlusCircle, Loader2, History, Eye as EyeIcon, Search, Filter, X, ArrowLeft, ArrowRight, FolderTree } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription as DialogNativeDescription,
  DialogHeader as DialogNativeHeader,
  DialogTitle as DialogNativeTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogNativeTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import NextImage from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { format, isBefore, addYears } from 'date-fns';
import { formatToYYYYMMDD } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1];

type StockStatusFilter = 'all' | 'low' | 'inStock' | 'outOfStock';

interface ProductFilters {
  searchTerm: string;
  categoryId: string;
  stockStatus: StockStatusFilter;
}

function DeleteProductButton({
  productId,
  productName,
  userRole,
  onProductDeleted
}: {
  productId: string,
  productName: string,
  userRole: UserRole | undefined,
  onProductDeleted: () => void
}) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  if (userRole !== 'admin') {
    return null;
  }

  const handleDelete = async () => {
    if (userRole !== 'admin') {
      toast({ variant: "destructive", title: "權限不足", description: "只有管理員可以刪除產品。" });
      setIsAlertOpen(false);
      return;
    }
    setIsDeleting(true);
    const result = await deleteProduct(productId, userRole);
    if (result.success) {
      toast({ title: "產品已刪除", description: `${productName} 已成功刪除。` });
      onProductDeleted();
    } else {
      toast({ variant: "destructive", title: "刪除產品錯誤", description: result.error });
    }
    setIsDeleting(false);
    setIsAlertOpen(false);
  };

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting} title={`刪除 ${productName}`}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">刪除 {productName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogNativeTitle>確定要刪除「{productName}」嗎？</AlertDialogNativeTitle>
          <AlertDialogDescription>
            此動作無法復原。這將永久刪除產品及其圖片。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <Button onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            刪除
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
  const [isEditProductDialogOpen, setIsEditProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isStockInHistoryDialogOpen, setIsStockInHistoryDialogOpen] = useState(false);
  const [viewingHistoryForProduct, setViewingHistoryForProduct] = useState<Product | null>(null);

  const [isPreviewImageDialogOpen, setIsPreviewImageDialogOpen] = useState(false);
  const [imagesForPreview, setImagesForPreview] = useState<ProductImage[] | null>(null);
  const [currentPreviewImageIndex, setCurrentPreviewImageIndex] = useState<number>(0);

  // Filter and Pagination State
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const [searchTermInput, setSearchTermInput] = useState('');
  const [categoryFilterInput, setCategoryFilterInput] = useState('all');
  const [stockStatusFilterInput, setStockStatusFilterInput] = useState<StockStatusFilter>('all');

  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>({
    searchTerm: '',
    categoryId: '',
    stockStatus: 'all',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);

  useEffect(() => {
    async function fetchFilterCategories() {
      setIsLoadingCategories(true);
      try {
        const result = await getCategories({ limit: 500 });
        setAllCategories(result.categories);
      } catch (error) {
        console.error("Failed to fetch categories for product filter:", error);
        toast({ variant: "destructive", title: "篩選錯誤", description: "無法載入分類以供篩選。" });
      }
      setIsLoadingCategories(false);
    }
    fetchFilterCategories();
  }, [toast]);

  const fetchProducts = useCallback(async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      const result = await getProducts({
        searchTerm: appliedFilters.searchTerm,
        categoryId: appliedFilters.categoryId === 'all' ? undefined : appliedFilters.categoryId,
        stockStatus: appliedFilters.stockStatus === 'all' ? undefined : appliedFilters.stockStatus,
        page: currentPage,
        limit: itemsPerPage,
      });
      setProducts(result.products);
      setTotalPages(result.totalPages);
      setTotalProducts(result.totalCount);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      toast({ variant: "destructive", title: "載入錯誤", description: "無法載入產品。" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, authLoading, appliedFilters, currentPage, itemsPerPage]);

  useEffect(() => {
    if (!authLoading) {
      fetchProducts();
    }
  }, [fetchProducts, authLoading]);

  const handleProductAddedOrUpdated = (newOrUpdatedProduct?: Product) => {
    if (newOrUpdatedProduct) {
      fetchProducts();
    } else {
      fetchProducts();
    }
    setIsAddProductDialogOpen(false);
    setIsEditProductDialogOpen(false);
    setEditingProduct(null);
  };

  const handleProductDeleted = () => {
    if (products.length === 1 && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    } else {
      fetchProducts();
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setIsEditProductDialogOpen(true);
  };

  const openStockInHistoryDialog = (product: Product) => {
    setViewingHistoryForProduct(product);
    setIsStockInHistoryDialogOpen(true);
  };

  const openImagePreviewDialog = (productImages: ProductImage[], startIndex: number = 0) => {
    if (productImages && productImages.length > 0) {
      setImagesForPreview(productImages);
      setCurrentPreviewImageIndex(startIndex);
      setIsPreviewImageDialogOpen(true);
    }
  };

  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      searchTerm: searchTermInput,
      categoryId: categoryFilterInput,
      stockStatus: stockStatusFilterInput,
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTermInput('');
    setCategoryFilterInput('all');
    setStockStatusFilterInput('all');
    setAppliedFilters({
      searchTerm: '',
      categoryId: '',
      stockStatus: 'all',
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
    }
  };

  const handleItemsPerPageChange = (newSize: string) => {
    setItemsPerPage(parseInt(newSize, 10));
    setCurrentPage(1);
  };

  const handleCloseImagePreview = () => {
    setIsPreviewImageDialogOpen(false);
    setImagesForPreview(null);
    setCurrentPreviewImageIndex(0);
  };

  const goToNextPreviewImage = () => {
    if (imagesForPreview && currentPreviewImageIndex < imagesForPreview.length - 1) {
      setCurrentPreviewImageIndex(prev => prev + 1);
    }
  };

  const goToPreviousPreviewImage = () => {
    if (imagesForPreview && currentPreviewImageIndex > 0) {
      setCurrentPreviewImageIndex(prev => prev - 1);
    }
  };

  // Remove the blocking full-page loader

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">產品</h1>
        <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-5 w-5" /> 新增產品
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogNativeHeader>
              <DialogNativeTitle className="flex items-center text-2xl">
                <PlusCircle className="mr-3 h-7 w-7 text-primary" />
                新增產品
              </DialogNativeTitle>
              <DialogNativeDescription>
                填寫產品詳細資訊。完成後點擊「新增產品」。
              </DialogNativeDescription>
            </DialogNativeHeader>
            {user?._id && <AddProductForm userId={user._id} onProductAdded={handleProductAddedOrUpdated} />}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <Filter className="mr-2 h-5 w-5 text-primary" />
            篩選與搜尋產品
          </CardTitle>
          <CardDescription>
            優化您的產品檢視。{isLoading && totalProducts === 0 ? "載入中..." : `${totalProducts} 個產品已找到。`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="searchTermProducts" className="block text-sm font-medium text-muted-foreground mb-1">搜尋詞</label>
                <Input
                  id="searchTermProducts"
                  placeholder="名稱、SKU、描述..."
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="categoryFilterProducts" className="block text-sm font-medium text-muted-foreground mb-1">分類</label>
                <Select
                  value={categoryFilterInput}
                  onValueChange={(value) => setCategoryFilterInput(value)}
                  disabled={isLoadingCategories}
                >
                  <SelectTrigger id="categoryFilterProducts">
                    <SelectValue placeholder={isLoadingCategories ? "載入中..." : "所有分類"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有分類</SelectItem>
                    {allCategories.filter(cat => typeof cat._id === 'string' && cat._id !== '').map(cat => (
                      <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>
                    ))}
                    {!isLoadingCategories && allCategories.length === 0 && (
                      <SelectItem value="no-cat" disabled>沒有可用的分類</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="stockStatusFilter" className="block text-sm font-medium text-muted-foreground mb-1">庫存狀態</label>
                <Select value={stockStatusFilterInput} onValueChange={(value) => setStockStatusFilterInput(value as StockStatusFilter)}>
                  <SelectTrigger id="stockStatusFilter">
                    <SelectValue placeholder="所有庫存狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有狀態</SelectItem>
                    <SelectItem value="inStock">有庫存</SelectItem>
                    <SelectItem value="low">庫存不足</SelectItem>
                    <SelectItem value="outOfStock">無庫存</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading || isLoadingCategories}>
                <Search className="mr-2 h-4 w-4" /> 套用篩選
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading || isLoadingCategories}>
                <X className="mr-2 h-4 w-4" /> 清除篩選
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>產品列表</CardTitle>
          <CardDescription>您的產品目錄。低庫存和即將到期的警告。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && products.length === 0 ? (
            <div className="space-y-3">
              {/* Skeleton table */}
              <div className="animate-pulse">
                <div className="grid grid-cols-11 gap-4 py-2 border-b">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
                    <div key={i} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="grid grid-cols-11 gap-4 py-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(j => (
                      <div key={j} className="h-4 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">找不到產品</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.categoryId || appliedFilters.stockStatus !== 'all'
                  ? "沒有產品符合您目前的篩選條件。"
                  : "使用「新增產品」按鈕新增您的第一個產品。"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px] sm:w-[80px]">圖片</TableHead>
                      <TableHead>名稱</TableHead>
                      <TableHead>分類</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>單位</TableHead>
                      <TableHead className="text-right">價格</TableHead>
                      <TableHead className="text-right">成本</TableHead>
                      <TableHead className="text-right">庫存</TableHead>
                      <TableHead>到期日 (主要)</TableHead>
                      <TableHead>警示</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const isLowStock = product.lowStockThreshold !== undefined && product.stock > 0 && product.stock < product.lowStockThreshold;
                      let expiryWarningText = '';
                      if (product.expiryDate) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const oneYearFromNow = addYears(today, 1);
                        const expiry = new Date(product.expiryDate);

                        if (isBefore(expiry, today)) {
                          expiryWarningText = '已過期';
                        } else if (isBefore(expiry, oneYearFromNow)) {
                          expiryWarningText = '即將一年內到期';
                        }
                      }
                      const firstImage = product.images && product.images.length > 0 ? product.images[0] : null;

                      return (
                        <TableRow key={product._id}>
                          <TableCell>
                            {firstImage && firstImage.url ? (
                              <button
                                onClick={() => openImagePreviewDialog(product.images || [], 0)}
                                className="focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
                                title={`檢視 ${product.name} 的圖片`}
                              >
                                <NextImage
                                  src={firstImage.url}
                                  alt={product.name}
                                  width={48}
                                  height={48}
                                  className="rounded-md object-cover aspect-square cursor-pointer hover:opacity-80 transition-opacity"
                                />
                              </button>
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                                <ImageOff className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link 
                              href={`/products/${product._id}`}
                              className="text-primary hover:text-primary/80 hover:underline transition-colors"
                            >
                              {product.name}
                            </Link>
                          </TableCell>
                          <TableCell>{product.categoryName || 'N/A'}</TableCell>
                          <TableCell>{product.sku || 'N/A'}</TableCell>
                          <TableCell>{product.unitOfMeasure || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(product.cost ?? 0)}</TableCell>
                          <TableCell className="text-right">{product.stock}</TableCell>
                          <TableCell>
                            {product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              {isLowStock && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="mr-1 h-3 w-3" /> 庫存不足 ({product.stock}/{product.lowStockThreshold})
                                </Badge>
                              )}
                              {expiryWarningText && (
                                <Badge variant={expiryWarningText === '已過期' ? 'destructive' : 'outline'} className={`text-xs whitespace-nowrap ${expiryWarningText === '已過期' ? '' : 'border-orange-500 text-orange-600'}`}>
                                  <CalendarClock className="mr-1 h-3 w-3" /> {expiryWarningText}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center items-center space-x-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary"
                                onClick={() => openStockInHistoryDialog(product)}
                                title={`檢視 ${product.name} 的入庫歷史`}
                              >
                                <History className="h-4 w-4" />
                                <span className="sr-only">檢視 {product.name} 的入庫歷史</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary"
                                onClick={() => openEditDialog(product)}
                                title={`編輯 ${product.name}`}
                                disabled={!user}
                              >
                                <Edit3 className="h-4 w-4" />
                                <span className="sr-only">編輯 ${product.name}</span>
                              </Button>
                              {user?.role === 'admin' && (
                                <DeleteProductButton
                                  productId={product._id}
                                  productName={product.name}
                                  userRole={user.role}
                                  onProductDeleted={handleProductDeleted}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages >= 1 && (
                <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">每頁列數:</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={handleItemsPerPageChange}
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue placeholder={itemsPerPage.toString()} />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEMS_PER_PAGE_OPTIONS.map(size => (
                          <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    第 {currentPage} 頁，共 {totalPages} 頁
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> 上一頁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      下一頁 <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {editingProduct && user && (
        <Dialog open={isEditProductDialogOpen} onOpenChange={(isOpen) => {
          setIsEditProductDialogOpen(isOpen);
          if (!isOpen) setEditingProduct(null);
        }}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogNativeHeader>
              <DialogNativeTitle className="flex items-center text-2xl">
                <Edit3 className="mr-3 h-7 w-7 text-primary" />
                編輯產品: {editingProduct.name}
              </DialogNativeTitle>
              <DialogNativeDescription>
                修改產品詳細資訊。完成後點擊「儲存變更」。
              </DialogNativeDescription>
            </DialogNativeHeader>
            <EditProductForm
              product={editingProduct}
              userId={user._id || ''}
              onProductUpdated={handleProductAddedOrUpdated}
              onCancel={() => {
                setIsEditProductDialogOpen(false);
                setEditingProduct(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {viewingHistoryForProduct && (
        <Dialog open={isStockInHistoryDialogOpen} onOpenChange={(isOpen) => {
          setIsStockInHistoryDialogOpen(isOpen);
          if (!isOpen) setViewingHistoryForProduct(null);
        }}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh]">
            <DialogNativeHeader>
              <DialogNativeTitle className="flex items-center text-2xl">
                <History className="mr-3 h-7 w-7 text-primary" />
                入庫歷史: {viewingHistoryForProduct.name}
              </DialogNativeTitle>
              <DialogNativeDescription>
                檢視此產品的所有入庫記錄，包括數量和批次到期日期。
              </DialogNativeDescription>
            </DialogNativeHeader>
            <ProductStockInHistoryDialog productId={viewingHistoryForProduct._id} />
          </DialogContent>
        </Dialog>
      )}

      {imagesForPreview && imagesForPreview.length > 0 && (
        <Dialog open={isPreviewImageDialogOpen} onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseImagePreview();
          } else {
            setIsPreviewImageDialogOpen(true);
          }
        }}>
          <DialogContent className="max-w-2xl p-4 sm:p-6 md:max-w-3xl lg:max-w-4xl">
            <DialogNativeHeader className="mb-4">
              <DialogNativeTitle className="text-xl sm:text-2xl">圖片預覽</DialogNativeTitle>
              <DialogNativeDescription className="text-sm text-muted-foreground">
                正在檢視第 {currentPreviewImageIndex + 1} 張圖片，共 {imagesForPreview.length} 張
              </DialogNativeDescription>
            </DialogNativeHeader>
            <div className="relative aspect-[4/3]">
              <NextImage
                src={imagesForPreview[currentPreviewImageIndex].url}
                alt={`產品圖片 ${currentPreviewImageIndex + 1}`}
                fill
                className="rounded-md object-contain"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
            {imagesForPreview.length > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  onClick={goToPreviousPreviewImage}
                  disabled={currentPreviewImageIndex === 0}
                  variant="outline"
                  size="icon"
                  aria-label="上一張圖片"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <p className="text-sm text-muted-foreground">
                  {currentPreviewImageIndex + 1} / {imagesForPreview.length}
                </p>
                <Button
                  onClick={goToNextPreviewImage}
                  disabled={currentPreviewImageIndex === imagesForPreview.length - 1}
                  variant="outline"
                  size="icon"
                  aria-label="下一張圖片"
                >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

