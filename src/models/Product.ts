
import { z } from 'zod';

export const ProductImageSchema = z.object({
  url: z.string().url({ message: "Invalid image URL" }),
  publicId: z.string(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const ProductSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Product name is required" }),
  sku: z.string().min(1, { message: "SKU is required" }).optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0, { message: "Price must be a positive number" }),
  stock: z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" }),
  description: z.string().optional(),
  images: z.array(ProductImageSchema).optional().default([]),
  // Add other fields from user request like unitOfMeasure, expiryDate later
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Product = z.infer<typeof ProductSchema> & { _id: string };

// Schema for validating form input (non-file fields)
export const ProductFormInputSchema = ProductSchema.omit({ _id: true, createdAt: true, updatedAt: true, images: true });
export type ProductFormInput = z.infer<typeof ProductFormInputSchema>;

// Type for useForm in the component, includes FileList for images
export type AddProductFormValues = ProductFormInput & {
  images?: FileList | null;
};
