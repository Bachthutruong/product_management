
import { z } from 'zod';

export const CustomerSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId
  name: z.string().min(1, "Customer name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Customer = z.infer<typeof CustomerSchema> & { _id: string };

export const CreateCustomerInputSchema = CustomerSchema.omit({ _id: true, createdAt: true, updatedAt: true });
export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;
