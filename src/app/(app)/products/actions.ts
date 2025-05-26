
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductInput } from '@/models/Product';
import { ObjectId } from 'mongodb';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot'; // You can set a default DB name or use an env var
const PRODUCTS_COLLECTION = 'products';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getProducts(): Promise<Product[]> {
  try {
    const db = await getDb();
    const products = await db.collection<Product>(PRODUCTS_COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
    
    // Convert ObjectId to string for client-side compatibility
    return products.map(product => ({
      ...product,
      _id: product._id.toString(),
      createdAt: product.createdAt ? new Date(product.createdAt) : undefined,
      updatedAt: product.updatedAt ? new Date(product.updatedAt) : undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
}

export async function addProduct(data: ProductInput): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  const validation = ProductSchema.omit({_id: true, createdAt: true, updatedAt: true}).safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  try {
    const db = await getDb();
    const newProductData = {
      ...validation.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(PRODUCTS_COLLECTION).insertOne(newProductData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert product into database.' };
    }
    
    const insertedProduct: Product = {
        ...newProductData,
        _id: result.insertedId.toString(),
    };

    revalidatePath('/products');
    return { success: true, product: insertedProduct };
  } catch (error) {
    console.error('Failed to add product:', error);
    return { success: false, error: 'An unexpected error occurred while adding the product.' };
  }
}

export async function deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid product ID format.' };
  }
  try {
    const db = await getDb();
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
