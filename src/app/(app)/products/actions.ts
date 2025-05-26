
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductFormInputSchema, PriceHistoryEntrySchema } from '@/models/Product';
import type { UserRole } from '@/models/User';
import { uploadImageToCloudinary, deleteImageFromCloudinary } from '@/lib/cloudinary';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const CLOUDINARY_PRODUCT_IMAGE_FOLDER = process.env.CLOUDINARY_FOLDER || 'stockpilot_products';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getProducts(): Promise<Product[]> {
  try {
    const db = await getDb();
    const productsFromDb = await db.collection(PRODUCTS_COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
    
    // Ensure all products conform to the schema, especially for optional fields
    return productsFromDb.map(productDoc => {
      const parsedProduct = ProductSchema.parse({
        ...productDoc,
        _id: productDoc._id.toString(),
        images: productDoc.images || [],
        priceHistory: productDoc.priceHistory || [],
        expiryDate: productDoc.expiryDate ? new Date(productDoc.expiryDate) : null,
        createdAt: productDoc.createdAt ? new Date(productDoc.createdAt) : undefined,
        updatedAt: productDoc.updatedAt ? new Date(productDoc.updatedAt) : undefined,
        lowStockThreshold: productDoc.lowStockThreshold ?? 0,
      });
      return parsedProduct as Product;
    });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
}

const AddProductFormDataSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key === 'price' || key === 'stock' || key === 'lowStockThreshold') {
      const numValue = parseFloat(value as string);
      rawFormData[key] = isNaN(numValue) ? undefined : numValue; // Handle potential NaN
    } else if (key === 'expiryDate') {
      rawFormData[key] = value ? new Date(value as string) : null;
    } else {
      rawFormData[key] = value;
    }
  });
  
  // Exclude files from Zod validation for now
  const { images: imageFiles, ...productDataFields } = rawFormData;

  const validation = AddProductFormDataSchema.safeParse(productDataFields);

  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { changedByUserId, ...validatedData } = validation.data;
  const uploadedImages: { url: string; publicId: string }[] = [];

  try {
    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.size > 0) {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          uploadedImages.push(result);
        }
      }
    }

    const db = await getDb();
    
    const initialPriceHistoryEntry = PriceHistoryEntrySchema.parse({
      price: validatedData.price,
      changedAt: new Date(),
      changedBy: changedByUserId,
    });

    const newProductData = {
      ...validatedData,
      images: uploadedImages,
      priceHistory: [initialPriceHistoryEntry],
      // Ensure numeric fields are correctly typed
      price: Number(validatedData.price),
      stock: Number(validatedData.stock),
      lowStockThreshold: validatedData.lowStockThreshold !== undefined ? Number(validatedData.lowStockThreshold) : 0,
      expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await db.collection(PRODUCTS_COLLECTION).insertOne(newProductData);

    if (!result.insertedId) {
      for (const img of uploadedImages) {
        await deleteImageFromCloudinary(img.publicId);
      }
      return { success: false, error: 'Failed to insert product into database.' };
    }
    
    const insertedProduct: Product = {
        ...(newProductData as Omit<Product, '_id'>),
        _id: result.insertedId.toString(),
    };

    revalidatePath('/products');
    return { success: true, product: insertedProduct };
  } catch (error: any) {
    console.error('Failed to add product:', error);
    for (const img of uploadedImages) {
        try {
            await deleteImageFromCloudinary(img.publicId);
        } catch (deleteError) {
            console.error('Failed to delete uploaded image after error:', deleteError);
        }
    }
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error after processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while adding the product.' };
  }
}

export async function deleteProduct(id: string, userRole: UserRole): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'admin') {
    return { success: false, error: 'Permission denied. Only admins can delete products.' };
  }
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid product ID format.' };
  }
  try {
    const db = await getDb();
    const productToDelete = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(id) });

    if (!productToDelete) {
      return { success: false, error: 'Product not found.' };
    }

    if (productToDelete.images && productToDelete.images.length > 0) {
      for (const image of productToDelete.images) {
        if (image.publicId) {
          try {
            await deleteImageFromCloudinary(image.publicId);
          } catch (cloudinaryError) {
            console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, cloudinaryError);
          }
        }
      }
    }

    const result = await db.collection(PRODUCTS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return { success: false, error: 'Product not found or already deleted.' };
    }
    revalidatePath('/products');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete product:', error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

// Placeholder for updateProduct - to be implemented in a future step
export async function updateProduct(
  productId: string,
  formData: FormData,
  userId: string // For price history
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  // TODO: Implement update logic
  // - Fetch existing product
  // - Validate FormData against a ProductUpdateSchema (similar to AddProductFormDataSchema)
  // - Handle image uploads/deletions (more complex than add)
  // - If price changes, add to priceHistory: { price: newPrice, changedAt: new Date(), changedBy: userId }
  // - Update product in DB
  // - Revalidate path
  console.log('updateProduct called with:', productId, formData, userId);
  return { success: false, error: "Update functionality not yet implemented." };
}
