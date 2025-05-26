
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
  
  // Pre-process items to ensure unitPrice is a number
  const processedItems = data.items.map(item => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    quantity: Number(item.quantity)
  }));

  const validation = CreateOrderInputSchema.extend({
     items: z.array(OrderLineItemSchema.extend({ // Use OrderLineItemSchema for validation here
      productId: z.string(),
      productName: z.string(),
      productSku: z.string().optional(),
      quantity: z.coerce.number().int().min(1),
      unitPrice: z.coerce.number().min(0),
      notes: z.string().optional().nullable(),
    })).min(1),
  }).safeParse({ ...data, items: processedItems });


  if (!validation.success) {
    console.error("Order validation errors:", validation.error.errors);
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { customerId, items, discountType, discountValue, shippingFee, notes } = validation.data;

  const db = await getDb();
  const session = (await clientPromise).startSession(); // Use clientPromise to get the client

  try {
    await session.withTransaction(async () => {
      // 1. Fetch customer details (for denormalization)
      const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId) }, { session });
      if (!customer) {
        throw new Error('Customer not found.');
      }

      // 2. Process Products and Inventory
      let subtotal = 0;
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

        // TODO: Implement FEFO (First-Expired, First-Out) logic here.
        // This requires a more granular inventory model (e.g., batches with expiry dates).
        // For now, we directly update the product's total stock.
        
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

        orderLineItems.push({
          productId: product._id.toString(),
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
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
          // relatedOrderId will be set after order is inserted
          notes: `Sale for order.`, // Placeholder, will update with order number
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
        discountAmountCalculated = Math.max(0, Math.min(discountAmountCalculated, subtotal)); // Ensure discount is not negative or more than subtotal
      }
      
      const finalShippingFee = shippingFee !== undefined && shippingFee !== null ? shippingFee : 0;
      const totalAmount = subtotal - discountAmountCalculated + finalShippingFee;

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
        status: 'pending', // Or 'completed' if payment is integrated
        orderDate: new Date(),
        notes: notes || undefined,
        createdByUserId: currentUser._id,
        createdByName: currentUser.name,
      };

      const result = await db.collection(ORDERS_COLLECTION).insertOne({ ...newOrderData, createdAt: new Date(), updatedAt: new Date() }, { session });
      if (!result.insertedId) {
        throw new Error('Failed to insert order into database.');
      }
      const insertedOrderId = result.insertedId.toString();

      // Update inventory movements with order ID and notes
      for (const movement of inventoryMovements) {
        movement.relatedOrderId = insertedOrderId;
        movement.notes = `Sale for order ${orderNumber}.`;
      }
      await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertMany(inventoryMovements, { session });
      
      // The transaction will commit here if all successful
      const finalOrder = OrderSchema.parse({
        ...newOrderData,
        _id: insertedOrderId,
        createdAt: newOrderData.orderDate, // Assuming orderDate is createdAt for new orders
        updatedAt: newOrderData.orderDate,
      }) as Order;

      revalidatePath('/orders');
      revalidatePath('/products'); // Stock levels changed
      revalidatePath('/inventory'); // New movements
      
      // This return won't be directly used due to transaction, but structure for non-transactional if needed
      return { success: true, order: finalOrder }; 
    });
    // If execution reaches here, the transaction was successful.
    // We need to fetch the order again if we want to return it, as variables inside transaction are scoped.
    // For simplicity, we'll just return success. The client can re-fetch.
    return { success: true };

  } catch (error: any) {
    console.error('Failed to create order:', error);
    // Session will be automatically aborted on error by withTransaction
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  } finally {
    await session.endSession();
  }
}


export async function getOrders(searchTerm?: string): Promise<Order[]> {
  try {
    const db = await getDb();
    const query: any = {};
    if (searchTerm) {
      // Example: Search by order number or customer name
      query.$or = [
        { orderNumber: { $regex: searchTerm, $options: 'i' } },
        { customerName: { $regex: searchTerm, $options: 'i' } },
      ];
    }
    const ordersFromDb = await db.collection(ORDERS_COLLECTION)
      .find(query)
      .sort({ orderDate: -1 }) // Show newest first
      .limit(100) // Basic pagination
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

// Placeholder for updateOrder
export async function updateOrder(
  orderId: string,
  data: Partial<CreateOrderInput>, // Use a more specific update schema later
  currentUser: AuthUser
): Promise<{ success: boolean; order?: Order; error?: string; errors?: z.ZodIssue[] }> {
  // TODO: Implement update logic
  // - Consider stock adjustments if items/quantities change. This is complex.
  // - Re-calculate totals.
  // - Log changes.
  console.log('updateOrder called with:', orderId, data, currentUser);
  return { success: false, error: "Order update not yet implemented." };
}

// Placeholder for deleteOrder
export async function deleteOrder(orderId: string, userRole: string): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'admin') {
    return { success: false, error: 'Permission denied. Only admins can delete orders.' };
  }
  // TODO: Implement delete logic
  // - Consider if stock should be returned to inventory.
  // - Or, mark order as "cancelled" instead of hard delete.
  console.log('deleteOrder called with:', orderId, userRole);
  return { success: false, error: "Order deletion not yet implemented." };
}
