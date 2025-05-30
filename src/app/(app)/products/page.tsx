
'use client'; 

import { useEffect, useState, useCallback } from 'react';
import { getProducts, deleteProduct } from '@/app/(app)/products/actions';
import type { Product, ProductImage } from '@/models/Product';
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
import { AlertTriangle, Trash2, ImageOff, CalendarClock, AlertCircle, Edit3, PackageX, PlusCircle, Loader2, History, Eye as EyeIcon, Search, Filter, X, ArrowLeft, ArrowRight } from "lucide-react";
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
  AlertDialogTitle as AlertDialogNativeTitle, // Renamed to avoid conflict
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import NextImage from 'next/image'; 
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { format, isBefore, addYears } from 'date-fns';

const ITEMS_PER_PAGE = 10;

type StockStatusFilter = 'all' | 'low' | 'inStock' | 'outOfStock';

interface ProductFilters {
  searchTerm: string;
  category: string;
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
  const [imageToPreview, setImageToPreview] = useState<ProductImage | null>(null);

  // Filter and Pagination State
  const [searchTermInput, setSearchTermInput] = useState('');
  const [categoryFilterInput, setCategoryFilterInput] = useState('');
  const [stockStatusFilterInput, setStockStatusFilterInput] = useState<StockStatusFilter>('all');
  
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>({
    searchTerm: '',
    category: '',
    stockStatus: 'all',
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const fetchProducts = useCallback(async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      const result = await getProducts({
        searchTerm: appliedFilters.searchTerm,
        category: appliedFilters.category,
        stockStatus: appliedFilters.stockStatus === 'all' ? undefined : appliedFilters.stockStatus,
        page: currentPage,
        limit: ITEMS_PER_PAGE,
      });
      setProducts(result.products);
      setTotalPages(result.totalPages);
      setTotalProducts(result.totalCount);
      setCurrentPage(result.currentPage); // Ensure currentPage is updated from backend result
    } catch (error) {
      console.error("Failed to fetch products:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load products." });
    } finally {
      setIsLoading(false);
    }
  }, [toast, authLoading, appliedFilters, currentPage]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]); 

  const handleProductAddedOrUpdated = () => {
    fetchProducts(); // Refresh current page or page 1 if preferred
    setIsAddProductDialogOpen(false); 
    setIsEditProductDialogOpen(false);
    setEditingProduct(null);
  };
  
  const handleProductDeleted = () => {
    // If current page becomes empty after deletion, try to go to previous page or page 1
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
  
  const openImagePreviewDialog = (image: ProductImage) => {
    setImageToPreview(image);
    setIsPreviewImageDialogOpen(true);
  };

  const handleApplyFilters = (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      searchTerm: searchTermInput,
      category: categoryFilterInput,
      stockStatus: stockStatusFilterInput,
    });
    setCurrentPage(1); 
  };

  const handleClearFilters = () => {
    setSearchTermInput('');
    setCategoryFilterInput('');
    setStockStatusFilterInput('all');
    setAppliedFilters({
      searchTerm: '',
      category: '',
      stockStatus: 'all',
    });
    setCurrentPage(1); 
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
    }
  };

  if (authLoading && isLoading) { 
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
                Fill in product details, including images, unit, expiry, and stock alerts. Click "Add Product" when you're done.
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
            Refine your product view. {isLoading ? "Loading..." : `${totalProducts} products found.`}
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
                <label htmlFor="categoryFilter" className="block text-sm font-medium text-muted-foreground mb-1">Category</label>
                <Input 
                  id="categoryFilter"
                  placeholder="e.g., Electronics" 
                  value={categoryFilterInput} 
                  onChange={(e) => setCategoryFilterInput(e.target.value)} 
                />
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
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" /> Apply
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
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
          {isLoading && products.length === 0 ? ( 
             <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : !isLoading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <PackageX className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No Products Found</h3>
              <p className="text-muted-foreground">
                {appliedFilters.searchTerm || appliedFilters.category || appliedFilters.stockStatus !== 'all' 
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
                        today.setHours(0,0,0,0);
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
                                onClick={() => openImagePreviewDialog(firstImage)} 
                                className="focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
                                title={`View image for ${product.name}`}
                              >
                                <NextImage 
                                  src={firstImage.url} 
                                  alt={product.name} 
                                  width={48} 
                                  height={48} 
                                  className="rounded-md object-cover aspect-square cursor-pointer hover:opacity-80 transition-opacity"
                                  data-ai-hint="product item"
                                />
                              </button>
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                                <ImageOff className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.sku || 'N/A'}</TableCell>
                          <TableCell>{product.unitOfMeasure || 'N/A'}</TableCell>
                          <TableCell className="text-right">${product.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${(product.cost ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{product.stock}</TableCell>
                          <TableCell>
                            {product.expiryDate ? format(new Date(product.expiryDate), 'dd/MM/yy') : 'N/A'}
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
                                  disabled={!user || user.role !== 'admin'} // Temporarily restrict to admin for safety during refactor
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
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage - 1)} 
                    disabled={currentPage === 1 || isLoading}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    onClick={() => handlePageChange(currentPage + 1)} 
                    disabled={currentPage === totalPages || isLoading}
                  >
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
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

      {imageToPreview && (
        <Dialog open={isPreviewImageDialogOpen} onOpenChange={setIsPreviewImageDialogOpen}>
          <DialogContent className="max-w-xl p-2">
            <DialogNativeHeader className="sr-only"> 
              <DialogNativeTitle>Image Preview</DialogNativeTitle>
              <DialogNativeDescription>{imageToPreview.url}</DialogNativeDescription>
            </DialogNativeHeader>
            <NextImage
              src={imageToPreview.url}
              alt="Product image preview"
              width={800}
              height={600}
              className="rounded-md object-contain max-h-[80vh] w-full"
              data-ai-hint="product image large"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
    
