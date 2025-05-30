
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { OrderSchema, type Order, type CreateOrderInput, CreateOrderInputSchema, OrderLineItemSchema, type OrderLineItem, OrderStatusSchema, type OrderStatus } from '@/models/Order';
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
  
  const processedItems = data.items.map(item => ({
    ...item,
    unitPrice: Number(item.unitPrice),
    quantity: Number(item.quantity),
    cost: Number(item.cost || 0) 
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
      const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId) }, { session });
      if (!customer) {
        throw new Error('Customer not found.');
      }

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
        const lineItemCost = (product.cost || 0) * item.quantity; 
        totalCostOfGoodsSold += lineItemCost;

        orderLineItems.push({
          productId: product._id.toString(),
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: product.cost || 0, 
          notes: item.notes,
        });

        inventoryMovements.push(InventoryMovementSchema.omit({_id: true}).parse({
          productId: product._id.toString(),
          productName: product.name,
          type: 'sale',
          quantity: -item.quantity, 
          movementDate: new Date(),
          userId: currentUser._id,
          userName: currentUser.name,
          notes: `Sale for order.`, 
          stockBefore,
          stockAfter,
        }));
      }

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
        revalidatePath(`/customers/${customerId}/orders`); 
        revalidatePath('/dashboard');
        return { success: true, order: finalOrderResult };
    } else {
        return { success: false, error: "Order creation completed but failed to retrieve final order details." };
    }

  } catch (error: any) {
    console.error('Failed to create order:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  } finally {
    await session.endSession();
  }
}


export async function getOrders(filters: { 
  searchTerm?: string; 
  customerId?: string;
  status?: OrderStatus | 'all'; 
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  limit?: number;
} = {}): Promise<{ orders: Order[]; totalCount: number; totalPages: number; currentPage: number }> {
  try {
    const db = await getDb();
    const query: any = {};
    const { 
      searchTerm, 
      customerId, 
      status, 
      dateFrom, 
      dateTo,
      page = 1,
      limit = 10 // Default items per page
    } = filters;


    if (searchTerm) {
      const regex = { $regex: searchTerm, $options: 'i' };
      query.$or = [
        { orderNumber: regex },
        { customerName: regex },
      ];
    }
    if (customerId && ObjectId.isValid(customerId)) {
      query.customerId = customerId;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom) query.orderDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the whole end day
        query.orderDate.$lte = endDate;
      }
    }

    const skip = (page - 1) * limit;
    const totalCount = await db.collection(ORDERS_COLLECTION).countDocuments(query);
    
    const ordersFromDb = await db.collection(ORDERS_COLLECTION)
      .find(query)
      .sort({ orderDate: -1 }) 
      .skip(skip)
      .limit(limit) 
      .toArray();
    
    const parsedOrders = ordersFromDb.map(orderDoc => OrderSchema.parse({
      ...orderDoc,
      _id: orderDoc._id.toString(),
      orderDate: new Date(orderDoc.orderDate),
      createdAt: orderDoc.createdAt ? new Date(orderDoc.createdAt) : undefined,
      updatedAt: orderDoc.updatedAt ? new Date(orderDoc.updatedAt) : undefined,
    }) as Order);

    return {
      orders: parsedOrders,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };

  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return { orders: [], totalCount: 0, totalPages: 0, currentPage: 1 };
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<{ success: boolean; order?: Order; error?: string }> {
  if (!ObjectId.isValid(orderId)) {
    return { success: false, error: 'Invalid order ID format.' };
  }
  
  try {
    OrderStatusSchema.parse(newStatus); 
  } catch (error) {
    return { success: false, error: 'Invalid status value provided.' };
  }

  const db = await getDb();
  try {
    const order = await db.collection<Order>(ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    if (newStatus === 'shipped' && !['pending', 'processing'].includes(order.status)) {
        return { success: false, error: `Order cannot be marked as shipped from '${order.status}' status.`};
    }
    if (newStatus === 'delivered' && order.status !== 'shipped') {
        return { success: false, error: `Order cannot be marked as delivered if not yet shipped.`};
    }
     if (newStatus === 'completed' && order.status !== 'delivered') { 
        return { success: false, error: `Order cannot be marked as completed if not yet delivered.`};
    }


    const result = await db.collection(ORDERS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(orderId) },
      { $set: { status: newStatus, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return { success: false, error: 'Failed to update order status or order not found.' };
    }
    
    const updatedOrder = OrderSchema.parse({
        ...result,
        _id: result._id.toString(),
    }) as Order;

    revalidatePath('/orders');
    if (order.customerId) {
        revalidatePath(`/customers/${order.customerId}/orders`);
    }
    revalidatePath('/dashboard');
    return { success: true, order: updatedOrder };
  } catch (error: any) {
    console.error(`Failed to update status for order ${orderId}:`, error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Data validation error during status update." }; // Removed errors: error.errors
    }
    return { success: false, error: 'An unexpected error occurred while updating order status.' };
  }
}


export async function updateOrder(
  orderId: string,
  data: Partial<CreateOrderInput>, 
  currentUser: AuthUser
): Promise<{ success: boolean; order?: Order; error?: string; errors?: z.ZodIssue[] }> {
  console.log('updateOrder called with:', orderId, data, currentUser);
  return { success: false, error: "Order update not yet implemented. This is a complex feature requiring careful stock and financial reconciliation." };
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

      console.warn(`Order ${orderId} deleted. Stock reversal for items not yet implemented.`);

      const result = await db.collection(ORDERS_COLLECTION).deleteOne({ _id: new ObjectId(orderId) }, { session });
      if (result.deletedCount === 0) {
        throw new Error('Order not found during delete operation or already deleted.');
      }
    });

    revalidatePath('/orders');
    if (customerIdForRevalidation) {
        revalidatePath(`/customers/${customerIdForRevalidation}/orders`);
    }
    revalidatePath('/dashboard');
    return { success: true };

  } catch (error: any) {
    console.error(`Failed to delete order ${orderId}:`, error);
    return { success: false, error: error.message || 'An unexpected error occurred while deleting the order.' };
  } finally {
    await session.endSession();
  }
}

