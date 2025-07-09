'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { OrderSchema, type Order, type CreateOrderInput, CreateOrderInputSchema, OrderLineItemSchema, type OrderLineItem, OrderStatusSchema, type OrderStatus } from '@/models/Order';
import type { Product } from '@/models/Product';
import { InventoryMovementSchema, type InventoryMovement } from '@/models/InventoryMovement';
import type { AuthUser } from '@/models/User';
import { getProductById, updateProductStockWithBatches, createProductDuringImport } from '@/app/(app)/products/actions';

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
        //@ts-expect-error _id is not in Product model but might be added dynamically
        const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(item.productId) }, { session });
        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found.`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}.`);
        }

        const stockBefore = product.stock;

        // Use new batch-aware stock update function
        const stockUpdateResult = await updateProductStockWithBatches(
          item.productId,
          item.quantity,
          session
        );

        if (!stockUpdateResult.success) {
          throw new Error(`Failed to update stock for product ${product.name}: ${stockUpdateResult.error}`);
        }

        const stockAfter = product.stock - item.quantity;
        const lineItemTotal = item.unitPrice * item.quantity;
        subtotal += lineItemTotal;
        const lineItemCost = (product.cost || 0) * item.quantity;
        totalCostOfGoodsSold += lineItemCost;

        // Convert used batches to the format expected by OrderLineItem
        const batchesUsed = stockUpdateResult.usedBatches?.map(batch => ({
          batchId: batch.batchId,
          expiryDate: batch.expiryDate,
          quantityUsed: batch.quantityUsed
        })) || [];

        orderLineItems.push({
          //@ts-expect-error _id is not in Product model but might be added dynamically
          productId: product._id.toString(),
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: product.cost || 0,
          notes: item.notes,
          batchesUsed: batchesUsed, // Add batch information
        });

        inventoryMovements.push(InventoryMovementSchema.omit({ _id: true }).parse({
          //@ts-expect-error _id is not in Product model but might be added dynamically
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
        // Initialize soft delete fields
        isDeleted: false,
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: null,
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
    const query: any = {
      // Exclude deleted orders
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false }
      ]
    };
    const {
      searchTerm,
      customerId,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10 // Default items per page
    } = filters;

    console.log('[getOrders] Filters received:', { searchTerm, customerId, status, dateFrom, dateTo, page, limit });


    if (searchTerm) {
      const regex = { $regex: searchTerm, $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { orderNumber: regex },
          { customerName: regex },
        ]
      });
    }
    if (customerId) {
      // For customer ID filtering, we need to match the string representation
      // since customerId in orders is stored as string (customer._id.toString())
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
    
    console.log('[getOrders] Final query:', JSON.stringify(query, null, 2));
    
    const totalCount = await db.collection(ORDERS_COLLECTION).countDocuments(query);
    console.log('[getOrders] Total count found:', totalCount);

    const ordersFromDb = await db.collection(ORDERS_COLLECTION)
      .find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    console.log('[getOrders] Orders fetched:', ordersFromDb.length);

    const parsedOrders = ordersFromDb.map(orderDoc => OrderSchema.parse({
      ...orderDoc,
      _id: orderDoc._id.toString(),
      orderDate: new Date(orderDoc.orderDate),
      createdAt: orderDoc.createdAt ? new Date(orderDoc.createdAt) : undefined,
      updatedAt: orderDoc.updatedAt ? new Date(orderDoc.updatedAt) : undefined,
      deletedAt: orderDoc.deletedAt ? new Date(orderDoc.deletedAt) : undefined,
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

export async function getOrderById(orderId: string): Promise<{ success: boolean; order?: Order; error?: string }> {
  try {
    const db = await getDb();
    
    if (!ObjectId.isValid(orderId)) {
      return { success: false, error: 'Invalid order ID format' };
    }

    const order = await db.collection(ORDERS_COLLECTION)
      .findOne({ 
        _id: new ObjectId(orderId),
        isDeleted: { $ne: true }
      });

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Parse the order to ensure type safety
    const validatedOrder = OrderSchema.parse({ 
      ...order, 
      _id: order._id.toString(),
      orderDate: new Date(order.orderDate),
      createdAt: order.createdAt ? new Date(order.createdAt) : undefined,
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : undefined,
      deletedAt: order.deletedAt ? new Date(order.deletedAt) : null,
    });

    return { success: true, order: validatedOrder as Order };
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    return { success: false, error: 'Failed to fetch order' };
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
    //@ts-expect-error _id is not in Order model but might be added dynamically
    const order = await db.collection<Order>(ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) });
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    if (newStatus === 'shipped' && !['pending', 'processing'].includes(order.status)) {
      return { success: false, error: `Order cannot be marked as shipped from '${order.status}' status.` };
    }
    if (newStatus === 'delivered' && order.status !== 'shipped') {
      return { success: false, error: `Order cannot be marked as delivered if not yet shipped.` };
    }
    if (newStatus === 'completed' && !['shipped', 'delivered'].includes(order.status)) {
      return { success: false, error: `Order cannot be marked as completed from '${order.status}' status.` };
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
  if (!ObjectId.isValid(orderId)) {
    return { success: false, error: 'Invalid order ID format.' };
  }

  // Validate input data
  const validation = CreateOrderInputSchema.partial().safeParse(data);
  if (!validation.success) {
    console.error("Order update validation errors:", validation.error.errors);
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const db = await getDb();
  const session = (await clientPromise).startSession();

  try {
    let updatedOrder: Order | undefined;

    await session.withTransaction(async () => {
      // Get the existing order
      const existingOrder = await db.collection(ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) }, { session });
      if (!existingOrder) {
        throw new Error('Order not found.');
      }

      // Only allow editing of pending and processing orders
      if (!['pending', 'processing'].includes(existingOrder.status)) {
        throw new Error(`Cannot edit order in '${existingOrder.status}' status. Only pending and processing orders can be edited.`);
      }

      // If customer is being changed, validate new customer exists
      let customer = null;
      if (data.customerId && data.customerId !== existingOrder.customerId) {
        customer = await db.collection('customers').findOne({ _id: new ObjectId(data.customerId) }, { session });
        if (!customer) {
          throw new Error('New customer not found.');
        }
      } else {
        customer = await db.collection('customers').findOne({ _id: new ObjectId(existingOrder.customerId) }, { session });
      }

      // If items are being changed, we need to handle stock reconciliation
      if (data.items) {
        // First, reverse stock for existing items
        for (const existingItem of existingOrder.items) {
          const product = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(existingItem.productId) }, { session });
          if (product) {
            // Add stock back using simple addition for now
            await db.collection(PRODUCTS_COLLECTION).updateOne(
              { _id: new ObjectId(existingItem.productId) },
              { $inc: { stock: existingItem.quantity } },
              { session }
            );

            // Record inventory movement for stock reversal
            const reversalMovement: Omit<InventoryMovement, '_id'> = {
              productId: existingItem.productId,
              productName: existingItem.productName,
              type: 'adjustment-add',
              quantity: existingItem.quantity,
              movementDate: new Date(),
              userId: currentUser._id,
              userName: currentUser.name,
              notes: `Stock reversal for order ${existingOrder.orderNumber} edit`,
              stockBefore: product.stock,
              stockAfter: product.stock + existingItem.quantity,
            };

            await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne({
              ...reversalMovement,
              createdAt: new Date(),
              updatedAt: new Date()
            }, { session });
          }
        }

        // Then, apply new items with batch-aware stock reduction
        let subtotal = 0;
        let totalCostOfGoodsSold = 0;
        const newOrderLineItems: OrderLineItem[] = [];

        for (const item of data.items) {
          //@ts-expect-error _id is not in Product model but might be added dynamically
          const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(item.productId) }, { session });
          if (!product) {
            throw new Error(`Product with ID ${item.productId} not found.`);
          }
          if (product.stock < item.quantity) {
            throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}.`);
          }

          // Use batch-aware stock update
          const stockUpdateResult = await updateProductStockWithBatches(
            item.productId,
            item.quantity,
            session
          );

          if (!stockUpdateResult.success) {
            throw new Error(`Failed to update stock for product ${product.name}: ${stockUpdateResult.error}`);
          }

          const lineItemTotal = item.unitPrice * item.quantity;
          subtotal += lineItemTotal;
          const lineItemCost = (product.cost || 0) * item.quantity;
          totalCostOfGoodsSold += lineItemCost;

          // Convert used batches to the format expected by OrderLineItem
          const batchesUsed = stockUpdateResult.usedBatches?.map(batch => ({
            batchId: batch.batchId,
            expiryDate: batch.expiryDate,
            quantityUsed: batch.quantityUsed
          })) || [];

          newOrderLineItems.push({
            //@ts-expect-error _id is not in Product model but might be added dynamically
            productId: product._id.toString(),
            productName: product.name,
            productSku: product.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            cost: product.cost || 0,
            notes: item.notes,
            batchesUsed: batchesUsed,
          });

          // Record inventory movement for new sale
          const stockBefore = product.stock + item.quantity; // Before the reduction
          const stockAfter = product.stock; // After the reduction

          const saleMovement: Omit<InventoryMovement, '_id'> = {
            //@ts-expect-error _id is not in Product model but might be added dynamically
            productId: product._id.toString(),
            productName: product.name,
            type: 'sale',
            quantity: -item.quantity,
            movementDate: new Date(),
            userId: currentUser._id,
            userName: currentUser.name,
            notes: `Sale for order ${existingOrder.orderNumber} (edited)`,
            stockBefore,
            stockAfter,
          };

          await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne({
            ...saleMovement,
            createdAt: new Date(),
            updatedAt: new Date()
          }, { session });
        }

        // Calculate discount and totals
        let discountAmountCalculated = 0;
        const discountType = data.discountType ?? existingOrder.discountType;
        const discountValue = data.discountValue ?? existingOrder.discountValue;

        if (discountType && discountValue !== undefined && discountValue !== null) {
          if (discountType === 'percentage') {
            discountAmountCalculated = (subtotal * discountValue) / 100;
          } else if (discountType === 'fixed') {
            discountAmountCalculated = discountValue;
          }
          discountAmountCalculated = Math.max(0, Math.min(discountAmountCalculated, subtotal));
        }

        const finalShippingFee = data.shippingFee !== undefined ? data.shippingFee : (existingOrder.shippingFee || 0);
        const totalAmount = subtotal - discountAmountCalculated + finalShippingFee;
        const profit = totalAmount - totalCostOfGoodsSold;

        // Update the order
        const updateData = {
          customerId: data.customerId || existingOrder.customerId,
          customerName: customer?.name || existingOrder.customerName,
          items: newOrderLineItems,
          subtotal,
          discountType: discountType || undefined,
          discountValue: discountValue || undefined,
          discountAmount: discountAmountCalculated,
          shippingFee: finalShippingFee,
          totalAmount,
          notes: data.notes !== undefined ? data.notes : existingOrder.notes,
          costOfGoodsSold: totalCostOfGoodsSold,
          profit: profit,
          updatedAt: new Date(),
        };

        const result = await db.collection(ORDERS_COLLECTION).findOneAndUpdate(
          { _id: new ObjectId(orderId) },
          { $set: updateData },
          { returnDocument: 'after', session }
        );

        if (!result) {
          throw new Error('Failed to update order.');
        }

        updatedOrder = OrderSchema.parse({
          ...result,
          _id: result._id.toString(),
        }) as Order;

      } else {
        // If only updating non-item fields (customer, notes, discount, shipping)
        const updateData: any = { updatedAt: new Date() };
        
        if (data.customerId && customer) {
          updateData.customerId = data.customerId;
          updateData.customerName = customer.name;
        }
        if (data.notes !== undefined) {
          updateData.notes = data.notes;
        }
        if (data.discountType !== undefined) {
          updateData.discountType = data.discountType;
        }
        if (data.discountValue !== undefined) {
          updateData.discountValue = data.discountValue;
        }
        if (data.shippingFee !== undefined) {
          updateData.shippingFee = data.shippingFee;
        }

        // Recalculate totals if discount or shipping changed
        if (data.discountType !== undefined || data.discountValue !== undefined || data.shippingFee !== undefined) {
          const subtotal = existingOrder.subtotal;
          let discountAmountCalculated = 0;
          const finalDiscountType = data.discountType ?? existingOrder.discountType;
          const finalDiscountValue = data.discountValue ?? existingOrder.discountValue;

          if (finalDiscountType && finalDiscountValue !== undefined && finalDiscountValue !== null) {
            if (finalDiscountType === 'percentage') {
              discountAmountCalculated = (subtotal * finalDiscountValue) / 100;
            } else if (finalDiscountType === 'fixed') {
              discountAmountCalculated = finalDiscountValue;
            }
            discountAmountCalculated = Math.max(0, Math.min(discountAmountCalculated, subtotal));
          }

          const finalShippingFee = data.shippingFee !== undefined ? data.shippingFee : (existingOrder.shippingFee || 0);
          const totalAmount = subtotal - discountAmountCalculated + finalShippingFee;
          const profit = totalAmount - (existingOrder.costOfGoodsSold || 0);

          updateData.discountAmount = discountAmountCalculated;
          updateData.totalAmount = totalAmount;
          updateData.profit = profit;
        }

        const result = await db.collection(ORDERS_COLLECTION).findOneAndUpdate(
          { _id: new ObjectId(orderId) },
          { $set: updateData },
          { returnDocument: 'after', session }
        );

        if (!result) {
          throw new Error('Failed to update order.');
        }

        updatedOrder = OrderSchema.parse({
          ...result,
          _id: result._id.toString(),
        }) as Order;
      }
    });

    revalidatePath('/orders');
    if (updatedOrder?.customerId) {
      revalidatePath(`/customers/${updatedOrder.customerId}/orders`);
    }
    revalidatePath('/dashboard');

    return { success: true, order: updatedOrder };

  } catch (error: any) {
    console.error(`Failed to update order ${orderId}:`, error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Data validation error during order update.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while updating the order.' };
  } finally {
    await session.endSession();
  }
}


export async function deleteOrder(orderId: string, userRole: string, currentUser?: { _id: string; name: string }): Promise<{ success: boolean; error?: string }> {
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
      //@ts-expect-error _id is not in Order model but might be added dynamically
      const orderToDelete = await db.collection<Order>(ORDERS_COLLECTION).findOne({ _id: new ObjectId(orderId) }, { session });
      if (!orderToDelete) {
        throw new Error('Order not found or already deleted.');
      }
      
      // Check if already soft deleted
      if (orderToDelete.isDeleted) {
        throw new Error('Order is already deleted.');
      }
      
      customerIdForRevalidation = orderToDelete.customerId;

      // Restore stock for incomplete orders (pending, processing)
      if (['pending', 'processing'].includes(orderToDelete.status)) {
        console.log(`Restoring stock for incomplete order ${orderToDelete.orderNumber} with status: ${orderToDelete.status}`);
        
        for (const item of orderToDelete.items) {
          const product = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(item.productId) }, { session });
          if (product) {
            // Restore stock using simple addition
            await db.collection(PRODUCTS_COLLECTION).updateOne(
              { _id: new ObjectId(item.productId) },
              { 
                $inc: { stock: item.quantity },
                $set: { updatedAt: new Date() }
              },
              { session }
            );

            // Record inventory movement for stock restoration
            const restorationMovement: Omit<InventoryMovement, '_id'> = {
              productId: item.productId,
              productName: item.productName,
              type: 'adjustment-add',
              quantity: item.quantity,
              movementDate: new Date(),
              userId: currentUser?._id || 'system',
              userName: currentUser?.name || 'System',
              relatedOrderId: orderId,
              notes: `Stock restoration from deleted order ${orderToDelete.orderNumber}`,
              stockBefore: product.stock,
              stockAfter: product.stock + item.quantity,
            };

            await db.collection(INVENTORY_MOVEMENTS_COLLECTION).insertOne({
              ...restorationMovement,
              createdAt: new Date(),
              updatedAt: new Date()
            }, { session });

            console.log(`Restored ${item.quantity} units of ${item.productName} to stock`);
          }
        }
      } else {
        console.log(`Order ${orderToDelete.orderNumber} has status ${orderToDelete.status} - stock will not be restored as order was already processed`);
      }

      // Soft delete the order
      const result = await db.collection(ORDERS_COLLECTION).updateOne(
        { _id: new ObjectId(orderId) }, 
        { 
          $set: { 
            isDeleted: true,
            deletedAt: new Date(),
            deletedByUserId: currentUser?._id || null,
            deletedByName: currentUser?.name || null,
            updatedAt: new Date()
          }
        }, 
        { session }
      );
      
      if (result.matchedCount === 0) {
        throw new Error('Order not found during delete operation or already deleted.');
      }
    });

    revalidatePath('/orders');
    revalidatePath('/products');
    revalidatePath('/inventory');
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

// New function to get deleted orders for admin
export async function getDeletedOrders(filters: {
  searchTerm?: string;
  customerId?: string;
  status?: OrderStatus | 'all';
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  limit?: number;
  userRole?: string;
} = {}): Promise<{ orders: Order[]; totalCount: number; totalPages: number; currentPage: number }> {
  // Only admin can access deleted orders
  if (filters.userRole !== 'admin') {
    return { orders: [], totalCount: 0, totalPages: 0, currentPage: 1 };
  }

  try {
    const db = await getDb();
    const query: any = {
      // Only include deleted orders
      isDeleted: true
    };
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
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { orderNumber: regex },
          { customerName: regex },
        ]
      });
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
      .sort({ deletedAt: -1 }) // Sort by deletion date
      .skip(skip)
      .limit(limit)
      .toArray();

    const parsedOrders = ordersFromDb.map(orderDoc => OrderSchema.parse({
      ...orderDoc,
      _id: orderDoc._id.toString(),
      orderDate: new Date(orderDoc.orderDate),
      createdAt: orderDoc.createdAt ? new Date(orderDoc.createdAt) : undefined,
      updatedAt: orderDoc.updatedAt ? new Date(orderDoc.updatedAt) : undefined,
      deletedAt: orderDoc.deletedAt ? new Date(orderDoc.deletedAt) : undefined,
    }) as Order);

    return {
      orders: parsedOrders,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };

  } catch (error) {
    console.error('Failed to fetch deleted orders:', error);
    return { orders: [], totalCount: 0, totalPages: 0, currentPage: 1 };
  }
}

/**
 * Imports orders from structured data, typically from two separate files:
 * one for order headers and one for order line items.
 * @param ordersData Array of order header information.
 * @param itemsData Array of order line item information.
 * @returns An object with the import results.
 */
export async function importOrders(
  ordersData: Array<{
    'ma don hang'?: string;
    'ngay tao don hang'?: string | number;
    'ma khach hang'?: string;
    'tong tien don hang'?: number;
    'note don hang'?: string;
  }>,
  itemsData: Array<{
    'ma don hang'?: string;
    'ma san pham'?: string;
    'so luong'?: number;
    'don gia'?: number;
    'thanh tien'?: number;
  }>,
  userId: string,
  userName: string,
): Promise<{ 
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}> {

  const db = await getDb();
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  
  // 1. Pre-fetch and map existing data for efficiency
  const customers = await db.collection('customers').find({}, { projection: { _id: 1, customerCode: 1, name: 1 } }).toArray();
  const customerMap = new Map(customers.map(c => [c.customerCode, { id: c._id.toString(), name: c.name }]));
  
  const products = await db.collection('products').find({}, { projection: { _id: 1, sku: 1, name: 1, costPrice: 1 } }).toArray();
  const productMap = new Map(products.map(p => [p.sku, { id: p._id.toString(), name: p.name, cost: p.costPrice || 0 }]));
  
  const existingOrders = await db.collection('orders').find({}, { projection: { orderNumber: 1 } }).toArray();
  const existingOrderNumbers = new Set(existingOrders.map(o => o.orderNumber));

  // 2. Group items by order number for easy lookup
  const itemsByOrder = new Map<string, any[]>();
  for (const item of itemsData) {
    const orderNumber = item['ma don hang']?.trim();
    if (orderNumber) {
      if (!itemsByOrder.has(orderNumber)) {
        itemsByOrder.set(orderNumber, []);
      }
      itemsByOrder.get(orderNumber)!.push(item);
    }
  }

  // 3. Process each order from the main orders file
  for (let i = 0; i < ordersData.length; i++) {
    const orderRow = ordersData[i];
    const rowNumber = i + 2;
    const orderNumber = orderRow['ma don hang']?.trim();

    // Skip return orders (identified by '退' prefix)
    if (orderNumber && orderNumber.startsWith('退')) {
        try {
            const returnedTotal = Number(orderRow['tong tien don hang']) || 0;
            const orderDateExcel = orderRow['ngay tao don hang'];
            let orderDate;
            if(typeof orderDateExcel === 'number' && orderDateExcel > 1) {
                orderDate = new Date(Date.UTC(1899, 11, 30 + orderDateExcel));
            } else if (typeof orderDateExcel === 'string') {
                orderDate = new Date(orderDateExcel);
            } else {
                orderDate = new Date();
            }

            const customer = customerMap.get(orderRow['ma khach hang']?.trim());
            if (!customer) {
                throw new Error(`找不到客戶代碼 ${orderRow['ma khach hang']}`);
            }

            const returnOrder: Omit<Order, '_id'> = {
                orderNumber: orderNumber,
                customerId: customer.id,
                customerName: customer.name,
                items: [{
                    productId: 'RETURN_PLACEHOLDER',
                    productName: '退貨商品',
                    quantity: 1,
                    unitPrice: returnedTotal,
                    cost: 0,
                    batchesUsed: [],
                }],
                subtotal: returnedTotal,
                totalAmount: returnedTotal,
                status: 'returned',
                orderDate: orderDate,
                notes: orderRow['note don hang']?.trim() || '退貨訂單',
                createdByUserId: userId,
                createdByName: userName,
                isDeleted: false,
                // Add missing fields with default values
                discountAmount: 0,
                shippingFee: 0,
                discountType: null,
                discountValue: null,
                costOfGoodsSold: 0,
                profit: returnedTotal, // Profit on returns is typically negative
            };
            
            // We don't need to validate with the full schema here, as some fields are intentionally simplified
            await db.collection('orders').insertOne(returnOrder);
            imported++;

        } catch (error) {
            errors.push(`第 ${rowNumber} 行 (${orderNumber}) 處理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
            failed++;
        }
        continue;
    }

    // Basic validation
    if (!orderNumber) {
      errors.push(`第 ${rowNumber} 行：訂單號碼不能為空`);
      failed++;
      continue;
    }
    if (existingOrderNumbers.has(orderNumber)) {
        errors.push(`第 ${rowNumber} 行：訂單號碼 ${orderNumber} 已存在`);
        failed++;
        continue;
    }
    const customerCode = orderRow['ma khach hang']?.trim();
    if (!customerCode) {
        errors.push(`第 ${rowNumber} 行 (${orderNumber})：客戶代碼不能為空`);
        failed++;
        continue;
    }
    const customer = customerMap.get(customerCode);
    if (!customer) {
        errors.push(`第 ${rowNumber} 行 (${orderNumber})：找不到客戶代碼 ${customerCode}`);
        failed++;
        continue;
    }
    const orderItems = itemsByOrder.get(orderNumber);
    if (!orderItems || orderItems.length === 0) {
      errors.push(`第 ${rowNumber} 行 (${orderNumber})：在詳情檔案中找不到此訂單的商品`);
      failed++;
      continue;
    }

    try {
      // Build order items
      const processedItems: OrderLineItem[] = [];
      let calculatedSubtotal = 0;

      for (const itemRow of orderItems) {
        const productSku = itemRow['ma san pham']?.trim();
        if (!productSku) {
          throw new Error(`ma san pham is missing in items file for order ${orderNumber}`);
        }
        
        let product = productMap.get(productSku);

        if (!product) {
          const productName = itemRow['ten san pham']?.trim();
          if (!productName) {
            throw new Error(`ten san pham is missing for new product with SKU ${productSku}`);
          }

          const newProduct = await createProductDuringImport({
              name: productName,
              sku: productSku,
              // Ensure the base price of the product is always non-negative
              price: Math.max(0, Number(itemRow['don gia']) || 0),
              stock: Number(itemRow['so luong']) || 0,
          }, userId);

          if (!newProduct) {
              throw new Error(`Could not auto-create product with SKU ${productSku}`);
          }
          
          const newProductForMap = {
              id: newProduct._id,
              name: newProduct.name,
              cost: newProduct.cost || 0
          };
          productMap.set(productSku, newProductForMap);
          product = newProductForMap;
        }
        
        const quantity = Number(itemRow['so luong']);
        const unitPrice = Number(itemRow['don gia']);
        
        if (isNaN(quantity) || quantity <= 0) throw new Error(`商品 ${product.name} 的數量無效`);
        if (isNaN(unitPrice)) throw new Error(`商品 ${product.name} 的單價無效`);
        
        const lineItem: OrderLineItem = {
          productId: product.id,
          productName: product.name,
          productSku: productSku,
          quantity: quantity,
          unitPrice: unitPrice,
          cost: product.cost,
          notes: null,
          batchesUsed: [], // Assume no specific batch for imported orders
        };
        processedItems.push(lineItem);
        calculatedSubtotal += quantity * unitPrice;
      }

      // Final order object
      const finalTotal = Number(orderRow['tong tien don hang']) || calculatedSubtotal;
      const discountAmount = Math.max(0, calculatedSubtotal - finalTotal);
      
      const orderDateExcel = orderRow['ngay tao don hang'];
      let orderDate;
      if(typeof orderDateExcel === 'number' && orderDateExcel > 1) {
         // Excel date serial number (Windows)
         orderDate = new Date(Date.UTC(1899, 11, 30 + orderDateExcel));
      } else if (typeof orderDateExcel === 'string') {
          orderDate = new Date(orderDateExcel);
      } else {
          orderDate = new Date(); // Fallback
      }

      const newOrder: Omit<Order, '_id'> = {
        orderNumber: orderNumber,
        customerId: customer.id,
        customerName: customer.name,
        items: processedItems,
        subtotal: calculatedSubtotal,
        totalAmount: finalTotal,
        discountAmount: discountAmount,
        discountType: discountAmount > 0 ? 'fixed' : null,
        discountValue: discountAmount > 0 ? discountAmount : null,
        shippingFee: 0,
        status: 'completed', // Assume imported orders are completed
        orderDate: orderDate,
        notes: orderRow['note don hang']?.trim() || null,
        createdByUserId: userId,
        createdByName: userName,
        isDeleted: false,
      };

      const validation = OrderSchema.omit({ _id: true, profit: true, costOfGoodsSold: true }).safeParse(newOrder);
      if(!validation.success) {
          const errorMessages = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          throw new Error(`數據驗證失敗: ${errorMessages}`);
      }

      await db.collection('orders').insertOne(validation.data);
      imported++;
      existingOrderNumbers.add(orderNumber);

    } catch (error) {
      errors.push(`第 ${rowNumber} 行 (${orderNumber}) 處理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
      failed++;
    }
  }

  if(imported > 0) {
      revalidatePath('/orders');
  }

  return {
    success: imported > 0 && failed === 0,
    imported,
    failed,
    errors,
  };
}

