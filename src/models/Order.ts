
import { z } from 'zod';
import { ProductSchema } from './Product'; // Assuming ProductSchema is defined
import { CustomerSchema } from './Customer'; // Assuming CustomerSchema is defined

export const OrderLineItemSchema = z.object({
  _id: z.any().optional(), // Not stored as a separate doc usually, but useful if expanding
  productId: z.string(), // ObjectId as string
  productName: z.string(), // Denormalized
  productSku: z.string().optional(), // Denormalized
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0), // Price at the time of sale
  notes: z.string().optional().nullable(),
});
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

export const DiscountTypeSchema = z.enum(['percentage', 'fixed']);
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const OrderStatusSchema = z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId
  orderNumber: z.string().min(1, "Order number is required").optional(), // Can be auto-generated
  customerId: z.string(), // ObjectId as string
  customerName: z.string(), // Denormalized
  items: z.array(OrderLineItemSchema).min(1, "Order must have at least one item"),
  subtotal: z.coerce.number().min(0), // Sum of (item.unitPrice * item.quantity)
  discountType: DiscountTypeSchema.optional().nullable(),
  discountValue: z.coerce.number().min(0).optional().nullable(),
  discountAmount: z.coerce.number().min(0).optional().nullable().default(0), // Calculated discount
  shippingFee: z.coerce.number().min(0).optional().nullable().default(0),
  totalAmount: z.coerce.number().min(0), // subtotal - discountAmount + shippingFee
  status: OrderStatusSchema.default('pending'),
  orderDate: z.date().default(() => new Date()),
  notes: z.string().optional().nullable(),
  createdByUserId: z.string(), // User who created the order
  createdByName: z.string(), // Denormalized user name
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  // For admin view later
  costOfGoodsSold: z.coerce.number().min(0).optional().nullable(), // To calculate profit
  profit: z.coerce.number().optional().nullable(), // To calculate profit
});

export type Order = z.infer<typeof OrderSchema> & { _id: string };

// Schema for the Create Order Form
export const CreateOrderFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    unitPrice: z.coerce.number(), // Will be fetched, non-editable by user directly in line item
    productName: z.string(), // For display and reference
    productSku: z.string().optional(),
    notes: z.string().optional().nullable(),
  })).min(1, "Order must have at least one item."),
  discountType: DiscountTypeSchema.optional().nullable(),
  discountValueInput: z.string().optional().nullable(), // Input for discount value, will be coerced
  shippingFeeInput: z.string().optional().nullable(), // Input for shipping, will be coerced
  notes: z.string().optional().nullable(),
});

export type CreateOrderFormValues = z.infer<typeof CreateOrderFormSchema>;

// Schema for the data sent to the createOrder server action
export const CreateOrderInputSchema = OrderSchema.pick({
  customerId: true,
  items: true, // Will use OrderLineItemSchema for items
  discountType: true,
  notes: true,
}).extend({
  // raw inputs that will be processed into final amounts
  discountValue: z.coerce.number().min(0).optional().nullable(), 
  shippingFee: z.coerce.number().min(0).optional().nullable(),
  // userId and userName will be added server-side from auth context
});

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
