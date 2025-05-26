
import { z } from 'zod';

export const ProductSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Product name is required" }),
  sku: z.string().min(1, { message: "SKU is required" }).optional(),
  category: z.string().optional(),
  price: z.coerce.number().min(0, { message: "Price must be a positive number" }),
  stock: z.coerce.number().int({ message: "Stock must be an integer" }).min(0, { message: "Stock must be non-negative" }),
  description: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Product = z.infer<typeof ProductSchema> & { _id: string }; // Ensure _id is string after fetch
export type ProductInput = Omit<Product, '_id' | 'createdAt' | 'updatedAt'>;
