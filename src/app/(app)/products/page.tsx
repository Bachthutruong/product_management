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
      toast({ variant: "destructive", title: "Permission Denied", description: "Only admins can delete products." });
      setIsAlertOpen(false);
      return;
    }
    setIsDeleting(true);
    const result = await deleteProduct(productId, userRole);
    if (result.success) {
      toast({ title: "Product Deleted", description: `${productName} has been successfully deleted.` });
      onProductDeleted();
    } else {
      toast({ variant: "destructive", title: "Error Deleting Product", description: result.error });
    }
    setIsDeleting(false);
    setIsAlertOpen(false);
  };

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting} title={`Delete ${productName}`}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">Delete {productName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogNativeTitle>Are you sure you want to delete "{productName}"?</AlertDialogNativeTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the product and its images.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete
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
        toast({ variant: "destructive", title: "Filter Error", description: "Could not load categories for filtering." });
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
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load products." });
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

  if (authLoading && isLoading && products.length === 0) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">Products</h1>
        <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-5 w-5" /> Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogNativeHeader>
              <DialogNativeTitle className="flex items-center text-2xl">
                <PlusCircle className="mr-3 h-7 w-7 text-primary" />
                Add New Product
              </DialogNativeTitle>
              <DialogNativeDescription>
                Fill in product details. Click "Add Product" when you're done.
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
            Filter & Search Products
          </CardTitle>
          <CardDescription>
            Refine your product view. {isLoading && totalProducts === 0 ? "Loading..." : `${totalProducts} products found.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="searchTermProducts" className="block text-sm font-medium text-muted-foreground mb-1">Search Term</label>
                <Input
                  id="searchTermProducts"
                  placeholder="Name, SKU, description..."
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="categoryFilterProducts" className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
                <Select
                  value={categoryFilterInput}
                  onValueChange={(value) => setCategoryFilterInput(value)}
                  disabled={isLoadingCategories}
                >
                  <SelectTrigger id="categoryFilterProducts">
                    <SelectValue placeholder={isLoadingCategories ? "Loading..." : "All Categories"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {allCategories.filter(cat => typeof cat._id === 'string' && cat._id !== '').map(cat => (
                      <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>
                    ))}
                    {!isLoadingCategories && allCategories.length === 0 && (
                      <SelectItem value="no-cat" disabled>No categories available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="stockStatusFilter" className="block text-sm font-medium text-muted-foreground mb-1">Stock Status</label>
                <Select value={stockStatusFilterInput} onValueChange={(value) => setStockStatusFilterInput(value as StockStatusFilter)}>
                  <SelectTrigger id="stockStatusFilter">
                    <SelectValue placeholder="All Stock Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="inStock">In Stock</SelectItem>
                    <SelectItem value="low">Low Stock</SelectItem>
                    <SelectItem value="outOfStock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading || isLoadingCategories}>
                <Search className="mr-2 h-4 w-4" /> Apply
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading || isLoadingCategories}>
                <X className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Product List</CardTitle>
          <CardDescription>Your current product catalog. Warnings for low stock & upcoming expiry.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && products.length === 0 && totalProducts === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !isLoading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Products Found</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.categoryId || appliedFilters.stockStatus !== 'all'
                  ? "No products match your current filters."
                  : "Add your first product using the 'Add Product' button."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px] sm:w-[80px]">Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Expiry (Main)</TableHead>
                      <TableHead>Alerts</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
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
                          expiryWarningText = 'Expired';
                        } else if (isBefore(expiry, oneYearFromNow)) {
                          expiryWarningText = 'Expires <1yr';
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
                                title={`View image for ${product.name}`}
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
                                  <AlertCircle className="mr-1 h-3 w-3" /> Low Stock ({product.stock}/{product.lowStockThreshold})
                                </Badge>
                              )}
                              {expiryWarningText && (
                                <Badge variant={expiryWarningText === 'Expired' ? 'destructive' : 'outline'} className={`text-xs whitespace-nowrap ${expiryWarningText === 'Expired' ? '' : 'border-orange-500 text-orange-600'}`}>
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
                                title={`View stock-in history for ${product.name}`}
                              >
                                <History className="h-4 w-4" />
                                <span className="sr-only">View stock-in history for {product.name}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary"
                                onClick={() => openEditDialog(product)}
                                title={`Edit ${product.name}`}
                                disabled={!user}
                              >
                                <Edit3 className="h-4 w-4" />
                                <span className="sr-only">Edit ${product.name}</span>
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
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || isLoading}
                    >
                      Next <ArrowRight className="ml-1 h-4 w-4" />
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
                Edit Product: {editingProduct.name}
              </DialogNativeTitle>
              <DialogNativeDescription>
                Modify product details. Click "Save Changes" when you're done.
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
                Stock-In History: {viewingHistoryForProduct.name}
              </DialogNativeTitle>
              <DialogNativeDescription>
                Review all stock-in movements for this product, including quantities and batch expiry dates.
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
              <DialogNativeTitle className="text-xl sm:text-2xl">Image Preview</DialogNativeTitle>
              <DialogNativeDescription className="text-sm text-muted-foreground">
                Viewing image {currentPreviewImageIndex + 1} of {imagesForPreview.length}
              </DialogNativeDescription>
            </DialogNativeHeader>
            <div className="relative aspect-[4/3]">
              <NextImage
                src={imagesForPreview[currentPreviewImageIndex].url}
                alt={`Product image ${currentPreviewImageIndex + 1}`}
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
                  aria-label="Previous image"
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
                  aria-label="Next image"
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

