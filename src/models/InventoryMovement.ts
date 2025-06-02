import { z } from 'zod';

export const InventoryMovementTypeSchema = z.enum(['stock-in', 'stock-out', 'adjustment-add', 'adjustment-remove', 'sale']);
export type InventoryMovementType = z.infer<typeof InventoryMovementTypeSchema>;

export const InventoryMovementSchema = z.object({
  _id: z.any().optional(),
  productId: z.string(), // Reference to Product._id
  productName: z.string(), // Denormalized for easier display in history
  type: InventoryMovementTypeSchema,
  quantity: z.number().int(), // Can be positive (stock-in, adjustment-add) or negative (stock-out, adjustment-remove, sale)
  movementDate: z.date(),
  userId: z.string(), // Reference to User._id
  userName: z.string(), // Denormalized for easier display
  batchExpiryDate: z.date().optional().nullable(), // Expiry date of the specific batch being moved
  relatedOrderId: z.string().optional().nullable(), // For sales or order-related adjustments
  notes: z.string().optional().nullable(),
  stockBefore: z.number().int(),
  stockAfter: z.number().int(),
});

export type InventoryMovement = z.infer<typeof InventoryMovementSchema> & { _id: string };

export const RecordStockInInputSchema = z.object({
  productId: z.string().min(1, "Product selection is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  batchExpiryDate: z.date({ message: "Batch expiry date is required" }),
  userId: z.string(), // Will be passed from the authenticated user session
});
export type RecordStockInInput = z.infer<typeof RecordStockInInputSchema>;

export const RecordStockAdjustmentInputSchema = z.object({
  productId: z.string().min(1, "Product selection is required"),
  quantityChange: z.coerce.number().int().refine(val => val !== 0, "Quantity change cannot be zero"),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional().nullable(),
});
export type RecordStockAdjustmentInput = z.infer<typeof RecordStockAdjustmentInputSchema>;
