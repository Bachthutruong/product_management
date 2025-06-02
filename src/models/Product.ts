import { z } from 'zod';

export const ProductImageSchema = z.object({
  url: z.string().url({ message: "Invalid image URL" }),
  publicId: z.string(),
  isPrimary: z.boolean().optional().default(false),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const PriceHistoryEntrySchema = z.object({
  price: z.number(),
  changedAt: z.date(),
  changedBy: z.string(), // User ID
});
export type PriceHistoryEntry = z.infer<typeof PriceHistoryEntrySchema>;

// Schema for Stock-In History entries
export const StockInEntrySchema = z.object({
  quantityAdded: z.number().int().positive(),
  batchExpiryDate: z.date().optional().nullable(),
  stockedAt: z.date(),
  stockedByUserId: z.string(), // User ID of who stocked it
  supplier: z.string().optional(),
  costAtTime: z.number().optional(), // Cost per unit at the time of stock-in
});
export type StockInEntry = z.infer<typeof StockInEntrySchema>;

// Schema for Batch tracking - each batch has its own expiry date and remaining stock
export const ProductBatchSchema = z.object({
  batchId: z.string(), // Unique identifier for this batch
  expiryDate: z.date(), // Required for new batches
  initialQuantity: z.number().int().positive(), // Original quantity when batch was created
  remainingQuantity: z.number().int().min(0), // Current remaining quantity
  costPerUnit: z.number().min(0).optional(),
  createdAt: z.date(),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});
export type ProductBatch = z.infer<typeof ProductBatchSchema>;

export const ProductSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Product name is required" }),
  sku: z.string().min(1, { message: "SKU is required" }).optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  price: z.coerce.number().min(0, { message: "Price must be a positive number" }),
  cost: z.coerce.number().min(0, { message: "Cost must be a non-negative number" }).optional().default(0), // Cost of the product
  stock: z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" }),
  description: z.string().optional(),
  images: z.array(ProductImageSchema).optional().default([]),
  expiryDate: z.date({ message: "Expiry date is required" }), // Make expiry date required
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  priceHistory: z.array(PriceHistoryEntrySchema).optional().default([]),
  stockInHistory: z.array(StockInEntrySchema).optional().default([]),
  batches: z.array(ProductBatchSchema).optional().default([]), // Track individual batches
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Product = z.infer<typeof ProductSchema> & { _id: string };

// Schema for validating form input (non-file fields) for both add and edit.
// The actual FileList for 'images' is handled by FormData processing.
export const ProductFormInputSchema = ProductSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  images: true, // images field in schema is for stored image data, not FileList
  priceHistory: true,
  stockInHistory: true,
  batches: true, // batches managed separately
});
export type ProductFormInput = z.infer<typeof ProductFormInputSchema>;

// Type for useForm in the component, includes FileList for images
// This type is primarily for the AddProductForm. EditProductForm might manage FileList slightly differently.
export type AddProductFormValues = Omit<ProductFormInput, 'expiryDate' | 'lowStockThreshold' | 'price' | 'cost' | 'stock'> & {
  images?: FileList | null; // For new image uploads
  expiryDate?: Date | null; // Still optional in form but will be required by validation
  lowStockThreshold?: number | string;
  price?: number | string;
  cost?: number | string;
  stock?: number | string;
};

// Note: For EditProductForm, form values will align with EditProductFormValuesSchema in EditProductForm.tsx
// to handle potential string inputs for numeric fields.
