import { z } from 'zod';

export const CustomerCategorySchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId
  name: z.string().min(1, "分類名稱是必需的"),
  code: z.string().min(1, "分類代碼是必需的").regex(/^[A-Z_]+$/, "分類代碼只能包含大寫字母和底線"),
  description: z.string().optional().nullable(), // Allow null values
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type CustomerCategory = z.infer<typeof CustomerCategorySchema> & { _id: string };

// Schema for form input validation - code is optional, will be auto-generated
export const CreateCustomerCategoryInputSchema = CustomerCategorySchema.omit({ _id: true, createdAt: true, updatedAt: true, code: true })
  .extend({
    description: z.string().optional().nullable().or(z.literal('')),
    code: z.string().optional(), // Make code optional for input
  });
export type CreateCustomerCategoryInput = z.infer<typeof CreateCustomerCategoryInputSchema>;

// Schema for update validation
export const UpdateCustomerCategoryInputSchema = CreateCustomerCategoryInputSchema.partial(); 