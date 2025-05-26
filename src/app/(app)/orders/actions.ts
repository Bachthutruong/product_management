
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { OrderSchema, type Order, type CreateOrderInput, CreateOrderInputSchema, OrderLineItemSchema, type OrderLineItem } from '@/models/Order';
import type { Product } from '@/models/Product';
import { InventoryMovementSchema, type InventoryMovement } from '@/models/InventoryMovement';
import type { AuthUser } from '@/models/User';
import { getProductById, updateProductStock } from '@/app/(app)/products/actions'; // Assuming this exists

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function generateOrderNumber(): Promise<string> {
  const db = await getDb();
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const prefix = `ORD-${year}${month}${day}-`;

  const lastOrder = await db.collection(ORDERS_COLLECTION)
    .find({ orderNumber: { $regex: `^${prefix}` } })
    .sort({ orderNumber: -1 })
    .limit(1)
    .project({ orderNumber: 1 })
    .toArray();

  let sequence = 1;
  if (lastOrder.length > 0 && lastOrder[0].orderNumber) {
    const lastSeq = parseInt(lastOrder[0].orderNumber.split('-').pop() || '0');
    sequence = lastSeq + 1;
  }
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}


export async function createOrder(
  data: CreateOrderInput,
  currentUser: AuthUser
): Promise<{ success: boolean; order?: Order; error?: string; errors?: z.ZodIssue[] }> {
  
  // Pre-process items to ensure unitPrice and quantity are numbers
  const processedItems = data.items.map(item => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    quantity: Number(item.quantity),
    cost: Number(item.cost || 0) // Ensure cost is a number
  }));

  const validation = CreateOrderInputSchema.extend({
     items: z.array(OrderLineItemSchema.extend({ 
      productId: z.string(),
      productName: z.string(),
      productSku: z.string().optional(),
      quantity: z.coerce.number().int().min(1),
      unitPrice: z.coerce.number().min(0),
      cost: z.coerce.number().min(0).optional().default(0),
      notes: z.string().optional().nullable(),
    })).min(1),
  }).safeParse({ ...data, items: processedItems });


  if (!validation.success) {
    console.error("Order validation errors:", validation.error.errors);
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { customerId, items, discountType, discountValue, shippingFee, notes } = validation.data;

  const db = await getDb();
  const session = (await clientPromise).startSession(); 

  try {
    let finalOrderResult: Order | undefined;

    await session.withTransaction(async () => {
      // 1. Fetch customer details
      const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId) }, { session });
      if (!customer) {
        throw new Error('Customer not found.');
      }

      // 2. Process Products and Inventory
      let subtotal = 0;
      let totalCostOfGoodsSold = 0;
      const orderLineItems: OrderLineItem[] = [];
      const inventoryMovements: Omit<InventoryMovement, '_id'>[] = [];

      for (const item of items) {
        const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(item.productId) }, { session });
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found.`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}.`);
        }

        const stockBefore = product.stock;
        const stockAfter = product.stock - item.quantity;
        
        const productUpdateResult = await db.collection(PRODUCTS_COLLECTION).updateOne(
          { _id: new ObjectId(item.productId) },
          { $set: { stock: stockAfter, updatedAt: new Date() } },
          { session }
        );
        if (productUpdateResult.modifiedCount === 0) {
          throw new Error(`Failed to update stock for product ${product.name}.`);
        }
        
        const lineItemTotal = item.unitPrice * item.quantity;
        subtotal += lineItemTotal;
        const lineItemCost = (product.cost || 0) * item.quantity; // Use product.cost from DB
        totalCostOfGoodsSold += lineItemCost;

        orderLineItems.push({
          productId: product._id.toString(),
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: product.cost || 0, // Store the actual cost per unit at time of sale
          notes: item.notes,
        });

        inventoryMovements.push(InventoryMovementSchema.omit({_id: true}).parse({
          productId: product._id.toString(),
          productName: product.name,
          type: 'sale',
          quantity: -item.quantity, // Negative for stock out
          movementDate: new Date(),
          userId: currentUser._id,
          userName: currentUser.name,
          notes: `Sale for order.`, 
          stockBefore,
          stockAfter,
        }));
      }

      // 3. Calculate totals
      let discountAmountCalculated = 0;
      if (discountType && discountValue !== undefined && discountValue !== null) {
        if (discountType === 'percentage') {
          discountAmountCalculated = (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
          discountAmountCalculated = discountValue;
        }
        discountAmountCalculated = Math.max(0, Math.min(discountAmountCalculated, subtotal));
      }
      
      const finalShippingFee = shippingFee !== undefined && shippingFee !== null ? shippingFee : 0;
      const totalAmount = subtotal - discountAmountCalculated + finalShippingFee;
      const profit = totalAmount - totalCostOfGoodsSold;

      // 4. Create Order
      const orderNumber = await generateOrderNumber();
      const newOrderData: Omit<Order, '_id' | 'createdAt' | 'updatedAt'> = {
        orderNumber,
        customerId: customer._id.toString(),
        customerName: customer.name,
        items: orderLineItems,
        subtotal,
        discountType: discountType || undefined,
        discountValue: discountValue || undefined,
        discountAmount: discountAmountCalculated,
        shippingFee: finalShippingFee,
        totalAmount,
        status: 'pending', 
        orderDate: new Date(),
        notes: notes || undefined,
        createdByUserId: currentUser._id,
        createdByName: currentUser.name,
        costOfGoodsSold: totalCostOfGoodsSold,
        profit: profit,
      };

      const result = await db.collection(ORDERS_COLLECTION).insertOne({ ...newOrderData, createdAt: new Date(), updatedAt: new Date() }, { session });
      if (!result.insertedId) {
        throw new Error('Failed to insert order into database.');
      }
      const insertedOrderId = result.insertedId.toString();

      for (const movement of inventoryMovements) {
        movement.relatedOrderId = insertedOrderId;
        movement.notes = `Sale for order ${orderNumber}.`;
      }
      await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertMany(inventoryMovements, { session });
      
      finalOrderResult = OrderSchema.parse({
        ...newOrderData,
        _id: insertedOrderId,
        createdAt: newOrderData.orderDate, 
        updatedAt: newOrderData.orderDate,
      }) as Order;
    });
    
    if (finalOrderResult) {
        revalidatePath('/orders');
        revalidatePath('/products'); 
        revalidatePath('/inventory'); 
        revalidatePath(`/customers/${customerId}/orders`); // Revalidate specific customer orders page
        return { success: true, order: finalOrderResult };
    } else {
        // This case should ideally not be reached if transaction completes without error
        return { success: false, error: "Order creation completed but failed to retrieve final order details." };
    }

  } catch (error: any) {
    console.error('Failed to create order:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  } finally {
    await session.endSession();
  }
}


export async function getOrders(filters?: { searchTerm?: string, customerId?: string }): Promise<Order[]> {
  try {
    const db = await getDb();
    const query: any = {};
    if (filters?.searchTerm) {
      query.$or = [
        { orderNumber: { $regex: filters.searchTerm, $options: 'i' } },
        { customerName: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }
    if (filters?.customerId) {
      if (!ObjectId.isValid(filters.customerId)) {
        console.error('Invalid customerId provided to getOrders:', filters.customerId);
        return []; // Or throw an error
      }
      query.customerId = filters.customerId; // No need to wrap in new ObjectId() if schema stores as string
    }

    const ordersFromDb = await db.collection(ORDERS_COLLECTION)
      .find(query)
      .sort({ orderDate: -1 }) 
      .limit(100) 
      .toArray();
    
    return ordersFromDb.map(orderDoc => OrderSchema.parse({
      ...orderDoc,
      _id: orderDoc._id.toString(),
      orderDate: new Date(orderDoc.orderDate),
      createdAt: orderDoc.createdAt ? new Date(orderDoc.createdAt) : undefined,
      updatedAt: orderDoc.updatedAt ? new Date(orderDoc.updatedAt) : undefined,
    }) as Order);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return [];
  }
}


export async function updateOrder(
  orderId: string,
  data: Partial<CreateOrderInput>, 
  currentUser: AuthUser
): Promise<{ success: boolean; order?: Order; error?: string; errors?: z.ZodIssue[] }> {
  // TODO: Implement update logic
  // - Consider stock adjustments if items/quantities change. This is complex.
  // - Re-calculate totals, COGS, profit.
  // - Log changes.
  console.log('updateOrder called with:', orderId, data, currentUser);
  return { success: false, error: "Order update not yet implemented." };
}


export async function deleteOrder(orderId: string, userRole: string): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'admin') {
    return { success: false, error: 'Permission denied. Only admins can delete orders.' };
  }
  if (!ObjectId.isValid(orderId)) {
    return { success: false, error: 'Invalid order ID format.' };
  }

  const db = await getDb();
  const session = (await clientPromise).startSession();
  let customerIdForRevalidation: string | undefined;

  try {
    await session.withTransaction(async () => {
      const orderToDelete = await db.collection<Order>(ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) }, { session });
      if (!orderToDelete) {
        throw new Error('Order not found or already deleted.');
      }
      customerIdForRevalidation = orderToDelete.customerId;

      // TODO: Implement stock reversal. This is critical for inventory accuracy.
      // For each item in orderToDelete.items:
      //   1. Find the product.
      //   2. Increase product.stock by item.quantity.
      //   3. Create an InventoryMovement record (e.g., type 'order-cancellation-restock' or 'adjustment-add').
      // This needs to be done carefully, potentially within the transaction.
      // For now, we are simplifying and not reversing stock.
      console.warn(`Order ${orderId} deleted. Stock reversal for items not yet implemented.`);

      const result = await db.collection(ORDERS_COLLECTION).deleteOne({ _id: new ObjectId(orderId) }, { session });
      if (result.deletedCount === 0) {
        // Should have been caught by findOne, but good as a safeguard
        throw new Error('Order not found during delete operation or already deleted.');
      }
    });

    revalidatePath('/orders');
    if (customerIdForRevalidation) {
        revalidatePath(`/customers/${customerIdForRevalidation}/orders`);
    }
    // Potentially revalidate products and inventory if stock reversal was implemented
    // revalidatePath('/products');
    // revalidatePath('/inventory');
    return { success: true };

  } catch (error: any) {
    console.error(`Failed to delete order ${orderId}:`, error);
    return { success: false, error: error.message || 'An unexpected error occurred while deleting the order.' };
  } finally {
    await session.endSession();
  }
}

