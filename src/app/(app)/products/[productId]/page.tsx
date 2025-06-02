'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getProductById } from '@/app/(app)/products/actions';
import type { Product } from '@/models/Product';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Calendar, AlertCircle, DollarSign, Tag, Layers, BarChart3, Edit3 } from "lucide-react";
import NextImage from 'next/image';
import { formatCurrency } from '@/lib/utils';
import { formatToYYYYMMDD } from '@/lib/date-utils';
import { isBefore, addYears } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from '@/hooks/use-toast';

export default function ProductDetailPage() {
  const { productId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    async function fetchProduct() {
      if (!productId || typeof productId !== 'string') {
        router.push('/products');
        return;
      }

      setIsLoading(true);
      try {
        // Lấy sản phẩm theo ID
        const product = await getProductById(productId);
        
        if (!product) {
          toast({ 
            variant: "destructive", 
            title: "Product Not Found", 
            description: "The requested product could not be found." 
          });
          router.push('/products');
          return;
        }

        setProduct(product);
      } catch (error) {
        console.error("Failed to fetch product:", error);
        toast({ 
          variant: "destructive", 
          title: "Loading Error", 
          description: "Could not load product details." 
        });
        router.push('/products');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProduct();
  }, [productId, router, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const isLowStock = product.lowStockThreshold !== undefined && 
    product.stock > 0 && 
    product.stock < product.lowStockThreshold;

  let expiryStatus = '';
  if (product.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearFromNow = addYears(today, 1);
    const expiry = new Date(product.expiryDate);

    if (isBefore(expiry, today)) {
      expiryStatus = 'expired';
    } else if (isBefore(expiry, oneYearFromNow)) {
      expiryStatus = 'expiring';
    }
  }

  const hasImages = product.images && product.images.length > 0;
  const currentImage = hasImages ? product.images[currentImageIndex] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push('/products')}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
          <p className="text-muted-foreground">Product Details</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Images */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasImages ? (
              <div className="space-y-4">
                <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                  <NextImage
                    src={currentImage!.url}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {product.images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`relative w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0 border-2 transition-colors ${
                          index === currentImageIndex
                            ? 'border-primary'
                            : 'border-transparent hover:border-muted-foreground'
                        }`}
                      >
                        <NextImage
                          src={image.url}
                          alt={`${product.name} ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                <Package className="h-24 w-24 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Information */}
        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">SKU</label>
                  <p className="text-foreground">{product.sku || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <p className="text-foreground">{product.categoryName || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Unit of Measure</label>
                  <p className="text-foreground">{product.unitOfMeasure || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Current Stock</label>
                  <div className="flex items-center gap-2">
                    <p className="text-foreground font-medium">{product.stock}</p>
                    {isLowStock && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Low Stock
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Selling Price</label>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(product.price)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cost Price</label>
                  <p className="text-xl font-semibold text-muted-foreground">{formatCurrency(product.cost ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Expiry & Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Expiry & Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Expiry Date</label>
                <div className="flex items-center gap-2">
                  <p className="text-foreground">{product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : 'N/A'}</p>
                  {expiryStatus === 'expired' && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                  {expiryStatus === 'expiring' && (
                    <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Expires Soon
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Low Stock Threshold</label>
                <p className="text-foreground">{product.lowStockThreshold ?? 'Not set'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Product Description */}
      {product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Product Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-wrap">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* No Description Message */}
      {!product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Product Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground italic">No description available for this product.</p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        {/* <Button
          onClick={() => router.push(`/products?edit=${product._id}`)}
          className="flex items-center gap-2"
        >
          <Edit3 className="h-4 w-4" />
          Edit Product
        </Button> */}
        <Button
          variant="outline"
          onClick={() => router.push('/products')}
        >
          Back to Products
        </Button>
      </div>
    </div>
  );
} 