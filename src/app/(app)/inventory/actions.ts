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
  InventoryMovementTypeSchema, // Ensure this is exported from model if needed
  type InventoryMovementType,   // And the type
  type RecordStockAdjustmentInput,
  RecordStockAdjustmentInputSchema
} from '@/models/InventoryMovement';
import type { AuthUser } from '@/models/User';
import { getProductById, updateProductStock } from '@/app/(app)/products/actions';

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
    return { success: false, error: "資料驗證失敗", errors: validation.error.errors };
  }

  const { productId, quantity, batchExpiryDate, userId } = validation.data;

  if (userId !== currentUser._id) {
    return { success: false, error: "用戶ID不匹配。操作被拒絕。" };
  }

  if (!batchExpiryDate) {
    return { success: false, error: "批次到期日期是必需的。" };
  }

  try {
    const db = await getDb();
    const productObjectId = new ObjectId(productId);
    //@ts-expect-error _id is not in Product model but might be added dynamically
    const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

    if (!product) {
      return { success: false, error: '找不到商品。' };
    }

    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;

    // Create new batch for this stock-in
    const newBatch = {
      batchId: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      expiryDate: batchExpiryDate,
      initialQuantity: quantity,
      remainingQuantity: quantity,
      costPerUnit: product.cost || 0,
      createdAt: new Date(),
      supplier: undefined,
      notes: `入庫 by ${currentUser.name}`,
    };

    // Get existing batches and add the new one
    const existingBatches = product.batches || [];
    const updatedBatches = [...existingBatches, newBatch];

    const updateOps: any = {
      stock: stockAfter,
      batches: updatedBatches,
      updatedAt: new Date(),
    };

    // Update product expiry date if this batch expires later
    if (!product.expiryDate || batchExpiryDate > new Date(product.expiryDate)) {
      updateOps.expiryDate = batchExpiryDate;
    }

    const productUpdateResult = await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: updateOps }
    );

    if (productUpdateResult.modifiedCount === 0 && productUpdateResult.matchedCount === 0) {
      return { success: false, error: '更新庫存失敗。商品可能不存在。' };
    }

    const movementData: Omit<InventoryMovement, '_id'> = {
      //@ts-expect-error _id is not in Product model but might be added dynamically
      productId: product._id.toString(),
      productName: product.name,
      type: 'stock-in',
      quantity: quantity,
      movementDate: new Date(),
      userId: currentUser._id,
      userName: currentUser.name,
      batchExpiryDate: batchExpiryDate,
      notes: `Stocked in ${quantity} units. Batch: ${newBatch.batchId}`,
      stockBefore,
      stockAfter,
    };

    const movementResult = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne(movementData);
    if (!movementResult.insertedId) {
      console.error(`Failed to log inventory movement for product ${productId} after stock update.`);
      return { success: false, error: '更新庫存後記錄庫存移動失敗。' };
    }

    const insertedMovement: InventoryMovement = {
      ...(movementData as Omit<InventoryMovement, '_id' | 'movementDate'> & { movementDate: Date }),
      _id: movementResult.insertedId.toString(),
    };

    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/dashboard');
    return { success: true, movement: insertedMovement };

  } catch (error: any) {
    console.error('Failed to record stock in:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "資料驗證錯誤。", errors: error.errors };
    }
    return { success: false, error: error.message || '發生意外錯誤。' };
  }
}


export async function getInventoryMovements(filters: {
  productId?: string;
  type?: InventoryMovementType;
  dateFrom?: string | null; // ISO string or null
  dateTo?: string | null;   // ISO string or null
  searchTerm?: string;
  page?: number;
  limit?: number;
}): Promise<{ movements: InventoryMovement[]; totalCount: number; totalPages: number; currentPage: number }> {
  try {
    const db = await getDb();
    const {
      productId,
      type,
      dateFrom,
      dateTo,
      searchTerm,
      page = 1,
      limit = 10, // Default items per page
    } = filters;

    const query: any = {};

    if (productId) query.productId = productId; // Assuming productId in DB is string
    if (type) query.type = type;

    if (dateFrom || dateTo) {
      query.movementDate = {};
      if (dateFrom) query.movementDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the whole end day
        query.movementDate.$lte = endDate;
      }
    }

    if (searchTerm) {
      const regex = { $regex: searchTerm, $options: 'i' };
      query.$or = [
        { productName: regex },
        { userName: regex },
        { notes: regex },
        { type: regex } // Allow searching by movement type text
      ];
    }

    const skip = (page - 1) * limit;

    const totalCount = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).countDocuments(query);
    const movementsFromDb = await db.collection(INVENTORY_MOVEMENTS_COLLECTION)
      .find(query)
      .sort({ movementDate: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const parsedMovements = movementsFromDb.map(movementDoc => ({
      ...movementDoc,
      _id: movementDoc._id.toString(),
      productId: movementDoc.productId.toString(),
      userId: movementDoc.userId.toString(),
      movementDate: new Date(movementDoc.movementDate),
      batchExpiryDate: movementDoc.batchExpiryDate ? new Date(movementDoc.batchExpiryDate) : null,
      // Preserve all additional fields like isUndone, undoNotes, etc.
      isUndone: movementDoc.isUndone || false,
      undoNotes: movementDoc.undoNotes || undefined,
      undoneAt: movementDoc.undoneAt || undefined,
      undoneBy: movementDoc.undoneBy || undefined,
      undoneByName: movementDoc.undoneByName || undefined,
      originalStockAfter: movementDoc.originalStockAfter || undefined,
    } as unknown as InventoryMovement));

    return {
      movements: parsedMovements,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };

  } catch (error) {
    console.error('Failed to fetch inventory movements:', error);
    // In case of error, return empty/default state to prevent frontend crash
    return { movements: [], totalCount: 0, totalPages: 0, currentPage: 1 };
  }
}


export async function undoInventoryMovement(
  movementId: string,
  currentUser: AuthUser
): Promise<{ success: boolean; error?: string }> {
  // Check if user is admin
  if (currentUser.role !== 'admin') {
    return { success: false, error: "只有管理員可以撤銷庫存移動。" };
  }

  try {
    const db = await getDb();
    const movementObjectId = new ObjectId(movementId);
    
    // Find the movement to undo
    const movement = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).findOne({ _id: movementObjectId });
    if (!movement) {
      return { success: false, error: "找不到要撤銷的庫存移動記錄。" };
    }

    // Don't allow undoing sales (order-related movements)
    if (movement.type === 'sale') {
      return { success: false, error: "無法撤銷銷售記錄，請通過訂單管理進行處理。" };
    }

    const productObjectId = new ObjectId(movement.productId);
    //@ts-expect-error _id is not in Product model but might be added dynamically
    const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

    if (!product) {
      return { success: false, error: "找不到相關商品。" };
    }

    const currentStock = product.stock;
    let newStock = currentStock;
    let undoNotes = '';

    // Calculate the reverse operation
    switch (movement.type) {
      case 'stock-in':
        newStock = currentStock - movement.quantity;
        undoNotes = `撤銷入庫操作 (原數量: +${movement.quantity})`;
        
        // Remove the batch that was added
        if (product.batches && product.batches.length > 0) {
          const updatedBatches = product.batches.filter(batch => 
            !movement.notes.includes(batch.batchId)
          );
          await db.collection(PRODUCTS_COLLECTION).updateOne(
            { _id: productObjectId },
            { $set: { batches: updatedBatches } }
          );
        }
        break;
        
      case 'adjustment-add':
        newStock = currentStock - movement.quantity;
        undoNotes = `撤銷庫存增加調整 (原數量: +${movement.quantity})`;
        break;
        
      case 'adjustment-remove':
        newStock = currentStock - movement.quantity; // movement.quantity is negative, so this adds back
        undoNotes = `撤銷庫存減少調整 (原數量: ${movement.quantity})`;
        break;
        
      case 'stock-out':
        newStock = currentStock - movement.quantity; // movement.quantity is negative, so this adds back
        undoNotes = `撤銷出庫操作 (原數量: ${movement.quantity})`;
        break;
        
      default:
        return { success: false, error: `不支援撤銷此類型的庫存移動: ${movement.type}` };
    }

    if (newStock < 0) {
      return { success: false, error: `撤銷操作會導致庫存為負 (${newStock})。無法執行撤銷。` };
    }

    // Update product stock
    await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: { stock: newStock, updatedAt: new Date() } }
    );

    // Mark the original movement as undone (no new movement record created)
    await db.collection(INVENTORY_MOVEMENTS_COLLECTION).updateOne(
      { _id: movementObjectId },
      { 
        $set: { 
          isUndone: true,
          undoneAt: new Date(),
          undoneBy: currentUser._id,
          undoneByName: currentUser.name,
          originalStockAfter: movement.stockAfter, // Store original stockAfter for redo
          undoNotes: undoNotes
        } 
      }
    );

    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/dashboard');
    
    return { success: true };

  } catch (error: any) {
    console.error('Failed to undo inventory movement:', error);
    return { success: false, error: error.message || '撤銷庫存移動時發生錯誤。' };
  }
}

export async function redoInventoryMovement(
  movementId: string,
  currentUser: AuthUser
): Promise<{ success: boolean; error?: string }> {
  // Check if user is admin
  if (currentUser.role !== 'admin') {
    return { success: false, error: "只有管理員可以重做庫存移動。" };
  }

  try {
    const db = await getDb();
    const movementObjectId = new ObjectId(movementId);
    
    // Find the undone movement to redo
    const movement = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).findOne({ 
      _id: movementObjectId,
      isUndone: true 
    });
    
    if (!movement) {
      return { success: false, error: "找不到要重做的已撤銷庫存移動記錄。" };
    }

    // Don't allow redoing sales (order-related movements)
    if (movement.type === 'sale') {
      return { success: false, error: "無法重做銷售記錄，請通過訂單管理進行處理。" };
    }

    const productObjectId = new ObjectId(movement.productId);
    //@ts-expect-error _id is not in Product model but might be added dynamically
    const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

    if (!product) {
      return { success: false, error: "找不到相關商品。" };
    }

    const currentStock = product.stock;
    let newStock = currentStock;

    // Recalculate the original operation (restore the effect of the original movement)
    switch (movement.type) {
      case 'stock-in':
        newStock = currentStock + movement.quantity;
        
        // Re-add the batch if it was a stock-in
        if (movement.batchExpiryDate) {
          const newBatch = {
            batchId: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            expiryDate: movement.batchExpiryDate,
            initialQuantity: movement.quantity,
            remainingQuantity: movement.quantity,
            costPerUnit: product.cost || 0,
            createdAt: new Date(),
            supplier: undefined,
            notes: `重做入庫 by ${currentUser.name}`,
          };
          
          const existingBatches = product.batches || [];
          const updatedBatches = [...existingBatches, newBatch];
          
          await db.collection(PRODUCTS_COLLECTION).updateOne(
            { _id: productObjectId },
            { $set: { batches: updatedBatches } }
          );
        }
        break;
        
      case 'adjustment-add':
        newStock = currentStock + movement.quantity;
        break;
        
      case 'adjustment-remove':
        newStock = currentStock + movement.quantity; // movement.quantity is negative, so this subtracts
        break;
        
      case 'stock-out':
        newStock = currentStock + movement.quantity; // movement.quantity is negative, so this subtracts
        break;
        
      default:
        return { success: false, error: `不支援重做此類型的庫存移動: ${movement.type}` };
    }

    if (newStock < 0) {
      return { success: false, error: `重做操作會導致庫存為負 (${newStock})。無法執行重做。` };
    }

    // Update product stock to restore the original effect
    await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: { stock: newStock, updatedAt: new Date() } }
    );

    // Restore the original movement (remove undo status completely)
    await db.collection(INVENTORY_MOVEMENTS_COLLECTION).updateOne(
      { _id: movementObjectId },
      { 
        $unset: { 
          isUndone: "",
          undoneAt: "",
          undoneBy: "",
          undoneByName: "",
          originalStockAfter: "",
          undoNotes: "",
          redoneAt: "",
          redoneBy: "",
          redoneByName: ""
        }
      }
    );

    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/dashboard');
    
    return { success: true };

  } catch (error: any) {
    console.error('Failed to redo inventory movement:', error);
    return { success: false, error: error.message || '重做庫存移動時發生錯誤。' };
  }
}

export async function recordStockAdjustment(
  data: RecordStockAdjustmentInput,
  currentUser: AuthUser
): Promise<{ success: boolean; movement?: InventoryMovement; error?: string; errors?: z.ZodIssue[] }> {
  const validation = RecordStockAdjustmentInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "資料驗證失敗", errors: validation.error.errors };
  }
  const { productId, quantityChange, reason, notes } = validation.data;

  if (quantityChange === 0) {
    return { success: false, error: "數量變更不能為零。" };
  }

  const db = await getDb();
  const productObjectId = new ObjectId(productId);
  //@ts-expect-error _id is not in Product model but might be added dynamically
  const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: productObjectId });

  if (!product) {
    return { success: false, error: '找不到商品。' };
  }

  const stockBefore = product.stock;
  const stockAfter = stockBefore + quantityChange;

  if (stockAfter < 0) {
    return { success: false, error: `調整會導致庫存為負 (${stockAfter})。目前庫存: ${stockBefore}。變更: ${quantityChange}` };
  }

  try {
    const productUpdateResult = await db.collection(PRODUCTS_COLLECTION).updateOne(
      { _id: productObjectId },
      { $set: { stock: stockAfter, updatedAt: new Date() } }
    );

    if (productUpdateResult.modifiedCount === 0 && productUpdateResult.matchedCount === 0) {
      return { success: false, error: '更新庫存失敗。商品可能不存在。' };
    }

    const movementType = quantityChange > 0 ? 'adjustment-add' : 'adjustment-remove';

    const movementData: Omit<InventoryMovement, '_id'> = {
      //@ts-expect-error _id is not in Product model but might be added dynamically
      productId: product._id.toString(),
      productName: product.name,
      type: movementType,
      quantity: quantityChange,
      movementDate: new Date(),
      userId: currentUser._id,
      userName: currentUser.name,
      notes: `${reason}${notes ? ` - ${notes}` : ''}`,
      stockBefore,
      stockAfter,
      batchExpiryDate: null,
    };

    const movementResult = await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne(movementData);
    if (!movementResult.insertedId) {
      console.error(`Critical: 無法記錄庫存調整。商品: ${productId} 庫存更新後。`);
      return { success: false, error: '更新庫存後記錄庫存調整失敗。資料不一致可能發生。' };
    }

    const insertedMovement = InventoryMovementSchema.parse({
      ...movementData,
      _id: movementResult.insertedId.toString(),
    }) as InventoryMovement;

    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/dashboard');
    return { success: true, movement: insertedMovement };

  } catch (error: any) {
    console.error('Failed to record stock adjustment:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "資料驗證錯誤。庫存調整過程中。", errors: error.errors };
    }
    return { success: false, error: error.message || '庫存調整過程中發生意外錯誤。' };
  }
}

