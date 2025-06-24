import { z } from 'zod';

export const CustomerSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId
  name: z.string().min(1, "客戶名稱是必需的"),
  email: z.string().email("無效的電子郵件地址").nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  categoryId: z.string().min(1, "客戶分類是必需的"),
  categoryName: z.string().optional(), // For display purposes
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Customer = z.infer<typeof CustomerSchema> & { _id: string };

// Schema for form input validation
export const CreateCustomerInputSchema = CustomerSchema.omit({ _id: true, createdAt: true, updatedAt: true, categoryName: true })
  .extend({
    // Ensure that empty strings from the form are also considered valid for optional fields
    // and will be converted to null by the server action before DB insertion.
    email: z.string().email("無效的電子郵件地址").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    categoryId: z.string().min(1, "請選擇客戶分類"),
  });
export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;

