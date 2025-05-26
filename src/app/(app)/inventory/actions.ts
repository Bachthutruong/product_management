
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Product } from '@/models/Product';
// ProductSchema might not be needed directly here if we use getProductById
import { 
    InventoryMovementSchema, 
    type RecordStockInInput, 
    RecordStockInInputSchema, 
    type InventoryMovement, 
    InventoryMovementTypeSchema,
    type RecordStockAdjustmentInput, // Import the type
    RecordStockAdjustmentInputSchema // Import the schema
} from '@/models/InventoryMovement';
import type { AuthUser } from '@/models/User'; 
import { getProductById, updateProductStock } from '@/app/(app)/products/actions'; // Assuming these exist and work

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function recordStockIn(
  data: RecordStockInInput,
  currentUser: AuthUser
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
    const updateOps: Partial<Product> & { $set?: any, $unset?: any } = {
      stock: stockAfter,
      updatedAt: new Date(),
    };
    
    // Logic for product's main expiryDate:
    // If batchExpiryDate is provided and it's later than the product's current expiryDate,
    // or if the product has no expiryDate, update it.
    // This is a simplification. True batch tracking would be more complex.
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
        return { success: false, error: 'Failed to update product stock. Product may not exist.' };
    }
    // If matched but not modified, it might be okay (e.g. data was already up-to-date), proceed to log.

    const movementData: Omit<InventoryMovement, '_id'> = {
      productId: product._id.toString(),
      productName: product.name,
      type: 'stock-in',
      quantity: quantity,
      movementDate: new Date(),
      userId: currentUser._id,
      userName: currentUser.name,
      batchExpiryDate: batchExpiryDate, // Store the specific batch's expiry
      notes: `Stocked in ${quantity} units.`,
      stockBefore,
      stockAfter,
    };
    
    const movementResult = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne(movementData);
    if (!movementResult.insertedId) {
        console.error(`Failed to log inventory movement for product ${productId} after stock update.`);
        // Potentially roll back product stock update here in a real transaction scenario
        return { success: false, error: 'Failed to log inventory movement after updating stock.' };
    }

    const insertedMovement : InventoryMovement = {
        ...(movementData as Omit<InventoryMovement, '_id' | 'movementDate'> & { movementDate: Date }), // Cast for correct type
        _id: movementResult.insertedId.toString(),
    };

    revalidatePath('/inventory');
    revalidatePath('/products');
    return { success: true, movement: insertedMovement };

  } catch (error: any) {
    console.error('Failed to record stock in:', error);
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error during processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}


export async function getInventoryMovements(filters?: { productId?: string, type?: string }): Promise<InventoryMovement[]> {
  try {
    const db = await getDb();
    const query: any = {};
    if (filters?.productId) query.productId = filters.productId;
    if (filters?.type) query.type = filters.type;

    const movementsFromDb = await db.collection(INVENTORY_MOVEMENTS_COLLECTION)
      .find(query)
      .sort({ movementDate: -1 })
      .limit(100)
      .toArray();
    
    return movementsFromDb.map(movementDoc => InventoryMovementSchema.parse({
      ...movementDoc,
      _id: movementDoc._id.toString(),
      productId: movementDoc.productId.toString(), // ensure it's string if it was ObjectId
      userId: movementDoc.userId.toString(), // ensure it's string
      movementDate: new Date(movementDoc.movementDate),
      batchExpiryDate: movementDoc.batchExpiryDate ? new Date(movementDoc.batchExpiryDate) : null,
    }) as InventoryMovement);
  } catch (error) {
    console.error('Failed to fetch inventory movements:', error);
    return [];
  }
}

// RecordStockAdjustmentInputSchema and RecordStockAdjustmentInput are now imported from @/models/InventoryMovement

export async function recordStockAdjustment(
  data: RecordStockAdjustmentInput,
  currentUser: AuthUser
): Promise<{ success: boolean; movement?: InventoryMovement; error?: string; errors?: z.ZodIssue[] }> {
  const validation = RecordStockAdjustmentInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }
  const { productId, quantityChange, reason, notes } = validation.data;

  const db = await getDb();
  const productObjectId = new ObjectId(productId);
  const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

  if (!product) {
    return { success: false, error: 'Product not found.' };
  }

  const stockBefore = product.stock;
  const stockAfter = stockBefore + quantityChange;

  if (stockAfter < 0) {
    return { success: false, error: `Adjustment would result in negative stock (${stockAfter}). Current stock: ${stockBefore}.` };
  }
  
  // TODO: Add transaction support here if MongoDB version allows and it's critical
  try {
    const productUpdateResult = await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: { stock: stockAfter, updatedAt: new Date() } }
    );

    if (productUpdateResult.modifiedCount === 0 && productUpdateResult.matchedCount === 0) {
      return { success: false, error: 'Failed to update product stock for adjustment. Product may not exist.' };
    }

    const movementType = quantityChange > 0 ? 'adjustment-add' : 'adjustment-remove';
    
    const movementData: Omit<InventoryMovement, '_id'> = {
      productId: product._id.toString(),
      productName: product.name,
      type: movementType,
      quantity: quantityChange, // Storing the actual change, not absolute value
      movementDate: new Date(),
      userId: currentUser._id,
      userName: currentUser.name,
      notes: `${reason}${notes ? ` - ${notes}` : ''}`,
      stockBefore,
      stockAfter,
    };

    const movementResult = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne(movementData);
    if (!movementResult.insertedId) {
      // Rollback product stock update if possible (or log critical error)
      console.error(`Critical: Failed to log stock adjustment for product ${productId} after stock was updated.`);
      return { success: false, error: 'Failed to log stock adjustment after updating stock. Data inconsistency possible.' };
    }
    
    const insertedMovement = InventoryMovementSchema.parse({
        ...movementData,
         _id: movementResult.insertedId.toString(),
         // quantity here is already set correctly above to be the change itself
    }) as InventoryMovement;

    revalidatePath('/inventory');
    revalidatePath('/products');
    return { success: true, movement: insertedMovement };

  } catch (error: any) {
     console.error('Failed to record stock adjustment:', error);
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error during adjustment processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred during stock adjustment.' };
  }
}
