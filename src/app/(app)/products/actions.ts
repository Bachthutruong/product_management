
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductFormInputSchema } from '@/models/Product';
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
    const products = await db.collection<Product>(PRODUCTS_COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
    
    return products.map(product => ({
      ...product,
      _id: product._id.toString(),
      images: product.images || [], // Ensure images is always an array
      createdAt: product.createdAt ? new Date(product.createdAt) : undefined,
      updatedAt: product.updatedAt ? new Date(product.updatedAt) : undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
}

export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key === 'price' || key === 'stock') {
      rawFormData[key] = parseFloat(value as string);
    } else {
      rawFormData[key] = value;
    }
  });
  
  // Exclude files from Zod validation for now
  const { images: imageFiles, ...productDataFields } = rawFormData;

  const validation = ProductFormInputSchema.safeParse(productDataFields);

  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const validatedData = validation.data;
  const uploadedImages: { url: string; publicId: string }[] = [];

  try {
    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.size > 0) { // Ensure file is not empty
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          uploadedImages.push(result);
        }
      }
    }

    const db = await getDb();
    const newProductData = {
      ...validatedData,
      images: uploadedImages,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Make sure price and stock are numbers
    newProductData.price = Number(newProductData.price);
    newProductData.stock = Number(newProductData.stock);
    
    const result = await db.collection(PRODUCTS_COLLECTION).insertOne(newProductData);

    if (!result.insertedId) {
      // If insertion fails, try to delete already uploaded images from Cloudinary
      for (const img of uploadedImages) {
        await deleteImageFromCloudinary(img.publicId);
      }
      return { success: false, error: 'Failed to insert product into database.' };
    }
    
    const insertedProduct: Product = {
        ...(newProductData as Omit<typeof newProductData, 'createdAt' | 'updatedAt'> & { createdAt: Date, updatedAt: Date}), // Type assertion
        _id: result.insertedId.toString(),
    };

    revalidatePath('/products');
    return { success: true, product: insertedProduct };
  } catch (error: any) {
    console.error('Failed to add product:', error);
    // If any error occurs after images are uploaded, try to delete them
    for (const img of uploadedImages) {
        try {
            await deleteImageFromCloudinary(img.publicId);
        } catch (deleteError) {
            console.error('Failed to delete uploaded image after error:', deleteError);
        }
    }
    return { success: false, error: error.message || 'An unexpected error occurred while adding the product.' };
  }
}

export async function deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid product ID format.' };
  }
  try {
    const db = await getDb();
    const productToDelete = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(id) });

    if (!productToDelete) {
      return { success: false, error: 'Product not found.' };
    }

    // Delete images from Cloudinary first
    if (productToDelete.images && productToDelete.images.length > 0) {
      for (const image of productToDelete.images) {
        if (image.publicId) {
          try {
            await deleteImageFromCloudinary(image.publicId);
          } catch (cloudinaryError) {
            console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, cloudinaryError);
            // Optionally, decide if you want to proceed with DB deletion or return an error
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
