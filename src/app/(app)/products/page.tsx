
'use client'; // Required for using hooks like useAuth, useState, useEffect

import { useEffect, useState } from 'react';
import { getProducts, deleteProduct } from '@/app/(app)/products/actions';
import type { Product } from '@/models/Product';
import type { UserRole } from '@/models/User';
import { useAuth } from '@/hooks/useAuth';
import { AddProductForm } from '@/components/products/AddProductForm';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Trash2, ImageOff, CalendarClock, AlertCircle, Edit3, PackageX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { format, differenceInYears, isBefore, addYears } from 'date-fns';
import { Loader2 } from 'lucide-react';

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
    return null; // Don't render button if user is not admin
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
      onProductDeleted(); // Callback to re-fetch products
    } else {
      toast({ variant: "destructive", title: "Error Deleting Product", description: result.error });
    }
    setIsDeleting(false);
    setIsAlertOpen(false);
  };

  return (
    <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" disabled={isDeleting}>
           {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">Delete {productName}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete "{productName}"?</AlertDialogTitle>
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

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const fetchedProducts = await getProducts();
      setProducts(fetchedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      toast({ variant: "destructive", title: "Loading Error", description: "Could not load products." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) { // Only fetch if auth is resolved
        fetchProducts();
    }
  }, [authLoading]); // Re-fetch if authLoading changes (e.g., on initial load)

  const handleProductAdded = () => {
    fetchProducts(); // Re-fetch products when a new one is added
  };
  
  const handleProductDeleted = () => {
    fetchProducts(); // Re-fetch products when one is deleted
  };

  if (authLoading || isLoading) {
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
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {user?._id && <AddProductForm userId={user._id} onProductAdded={handleProductAdded} />}
        </div>
        
        <div className="lg:col-span-2">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Product List</CardTitle>
              <CardDescription>Your current product catalog. Warnings for low stock & upcoming expiry.</CardDescription>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <PackageX className="w-16 h-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold text-foreground">No Products Found</h3>
                  <p className="text-muted-foreground">Add your first product using the form.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px] sm:w-[80px]">Image</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Alerts</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => {
                        const isLowStock = product.lowStockThreshold !== undefined && product.stock < product.lowStockThreshold;
                        let isExpiringSoon = false;
                        let expiryWarningText = '';
                        if (product.expiryDate) {
                          const today = new Date();
                          const oneYearFromNow = addYears(today, 1);
                          isExpiringSoon = isBefore(new Date(product.expiryDate), oneYearFromNow) && isBefore(today, new Date(product.expiryDate));
                          if(isBefore(new Date(product.expiryDate), today)) {
                            expiryWarningText = 'Expired';
                          } else if (isExpiringSoon) {
                            expiryWarningText = 'Expires <1yr';
                          }
                        }

                        return (
                          <TableRow key={product._id}>
                            <TableCell>
                              {product.images && product.images.length > 0 && product.images[0].url ? (
                                <Image 
                                  src={product.images[0].url} 
                                  alt={product.name} 
                                  width={48} 
                                  height={48} 
                                  className="rounded-md object-cover aspect-square"
                                  data-ai-hint="product item"
                                />
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
                                  <Badge variant={expiryWarningText === 'Expired' ? 'destructive' : 'outline'} className={`text-xs ${expiryWarningText === 'Expired' ? '' : 'border-orange-500 text-orange-600'}`}>
                                     <CalendarClock className="mr-1 h-3 w-3" /> {expiryWarningText}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center items-center space-x-1">
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => alert(`Edit product: ${product.name} - Not implemented`)}>
                                    <Edit3 className="h-4 w-4" />
                                    <span className="sr-only">Edit {product.name}</span>
                                </Button>
                                {user?.role && ( // Ensure user role is available
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
