
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Product } from '@/models/Product';
import { ProductSchema } from '@/models/Product';
import { InventoryMovementSchema, type RecordStockInInput, RecordStockInInputSchema, type InventoryMovement } from '@/models/InventoryMovement';
import type { AuthUser } from '@/models/User'; // To get userName

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function recordStockIn(
  data: RecordStockInInput,
  currentUser: AuthUser // Pass the current user for logging
): Promise<{ success: boolean; movement?: InventoryMovement; error?: string; errors?: z.ZodIssue[] }> {
  const validation = RecordStockInInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { productId, quantity, batchExpiryDate, userId } = validation.data;

  if (userId !== currentUser._id) {
    return { success: false, error: "User ID mismatch. Action denied." };
  }

  try {
    const db = await getDb();
    const productObjectId = new ObjectId(productId);

    const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

    if (!product) {
      return { success: false, error: 'Product not found.' };
    }

    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;

    // Update product stock and potentially expiry date
    const updateOps: Partial<Product> = {
      stock: stockAfter,
      updatedAt: new Date(),
    };

    if (batchExpiryDate) {
      if (!product.expiryDate || batchExpiryDate > new Date(product.expiryDate)) {
        updateOps.expiryDate = batchExpiryDate;
      }
    }
    
    const productUpdateResult = await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: updateOps }
    );

    if (productUpdateResult.modifiedCount === 0 && productUpdateResult.matchedCount === 0) {
        // This case might happen if the product was deleted just before this operation
        return { success: false, error: 'Failed to update product stock. Product may not exist or no changes were made.' };
    }
    if (productUpdateResult.modifiedCount === 0 && productUpdateResult.matchedCount > 0) {
        // Product was found but nothing changed (e.g. stock was already updated by another process)
        // For stock-in this is less likely unless the values were identical, but good to be aware.
        // We can proceed to log the movement if the intent was to record it.
        console.warn(`Product ${productId} matched but not modified. Proceeding to log movement.`);
    }


    // Create inventory movement record
    const movementData: Omit<InventoryMovement, '_id'> = {
      productId: product._id.toString(),
      productName: product.name, // Denormalize product name
      type: 'stock-in',
      quantity: quantity, // Positive for stock-in
      movementDate: new Date(),
      userId: currentUser._id,
      userName: currentUser.name, // Denormalize user name
      batchExpiryDate: batchExpiryDate,
      notes: `Stocked in ${quantity} units.`,
      stockBefore,
      stockAfter,
    };
    
    const movementResult = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne(movementData);
    if (!movementResult.insertedId) {
        // Attempt to revert product stock update if movement logging fails? Complex, for now log error.
        console.error(`Failed to log inventory movement for product ${productId} after stock update.`);
        return { success: false, error: 'Failed to log inventory movement after updating stock.' };
    }

    const insertedMovement : InventoryMovement = {
        ...movementData,
        _id: movementResult.insertedId.toString(),
    }

    revalidatePath('/inventory');
    revalidatePath('/products'); // Product stock changed
    return { success: true, movement: insertedMovement };

  } catch (error: any) {
    console.error('Failed to record stock in:', error);
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error during processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}


export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  try {
    const db = await getDb();
    const movementsFromDb = await db.collection(INVENTORY_MOVEMENTS_COLLECTION)
      .find({})
      .sort({ movementDate: -1 }) // Show newest first
      .limit(100) // Limit for performance, add pagination later
      .toArray();
    
    return movementsFromDb.map(movementDoc => ({
      ...movementDoc,
      _id: movementDoc._id.toString(),
      productId: movementDoc.productId.toString(),
      userId: movementDoc.userId.toString(),
      movementDate: new Date(movementDoc.movementDate),
      batchExpiryDate: movementDoc.batchExpiryDate ? new Date(movementDoc.batchExpiryDate) : null,
    } as InventoryMovement));
  } catch (error) {
    console.error('Failed to fetch inventory movements:', error);
    return [];
  }
}

// Placeholder for Stock Out / Adjustments
export async function recordStockAdjustment(
    productId: string,
    quantityChange: number, // Positive for adding, negative for removing
    reason: string,
    userId: string,
    userName: string,
    batchExpiryDate?: Date | null
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement stock adjustment logic
    // - Update product stock
    // - Create inventory movement record with type 'adjustment-add' or 'adjustment-remove'
    // - Handle potential expiry date changes if relevant for adjustments
    console.log("recordStockAdjustment called with:", productId, quantityChange, reason, userId, userName, batchExpiryDate);
    return { success: false, error: "Stock adjustment not yet implemented." };
  }
