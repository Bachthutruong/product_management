
import { z } from 'zod';

export const ProductImageSchema = z.object({
  url: z.string().url({ message: "Invalid image URL" }),
  publicId: z.string(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const PriceHistoryEntrySchema = z.object({
  price: z.number(),
  changedAt: z.date(),
  changedBy: z.string(), // User ID
});
export type PriceHistoryEntry = z.infer<typeof PriceHistoryEntrySchema>;

export const ProductSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Product name is required" }),
  sku: z.string().min(1, { message: "SKU is required" }).optional(),
  category: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  price: z.coerce.number().min(0, { message: "Price must be a positive number" }),
  cost: z.coerce.number().min(0, { message: "Cost must be a non-negative number" }).optional().default(0), // Cost of the product
  stock: z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" }),
  description: z.string().optional(),
  images: z.array(ProductImageSchema).optional().default([]),
  expiryDate: z.date().optional().nullable(),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  priceHistory: z.array(PriceHistoryEntrySchema).optional().default([]),
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
});
export type ProductFormInput = z.infer<typeof ProductFormInputSchema>;

// Type for useForm in the component, includes FileList for images
// This type is primarily for the AddProductForm. EditProductForm might manage FileList slightly differently.
export type AddProductFormValues = Omit<ProductFormInput, 'expiryDate' | 'lowStockThreshold' | 'price' | 'cost' | 'stock'> & {
  images?: FileList | null; // For new image uploads
  expiryDate?: Date | null; 
  lowStockThreshold?: number | string; 
  price?: number | string; 
  cost?: number | string; 
  stock?: number | string;
};

// Note: For EditProductForm, form values will align with EditProductFormValuesSchema in EditProductForm.tsx
// to handle potential string inputs for numeric fields.
