
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

// Schema for validating form input (non-file fields)
export const ProductFormInputSchema = ProductSchema.omit({ 
  _id: true, 
  createdAt: true, 
  updatedAt: true, 
  images: true,
  priceHistory: true, // priceHistory is managed by actions
});
export type ProductFormInput = z.infer<typeof ProductFormInputSchema>;

// Type for useForm in the component, includes FileList for images
export type AddProductFormValues = Omit<ProductFormInput, 'expiryDate' | 'lowStockThreshold' | 'price' | 'cost'> & {
  images?: FileList | null;
  expiryDate?: Date | null; // DatePicker might return Date or null
  lowStockThreshold?: number | string; // Input might be string initially
  price?: number | string; // Input might be string initially
  cost?: number | string; // Input might be string initially
};
