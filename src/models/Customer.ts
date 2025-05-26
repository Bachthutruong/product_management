
import { z } from 'zod';

export const CustomerSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId
  name: z.string().min(1, "Customer name is required"),
  email: z.string().email("Invalid email address").nullable().optional(), // Allows string, null, or undefined
  phone: z.string().nullable().optional(), // Allows string, null, or undefined
  address: z.string().nullable().optional(), // Allows string, null, or undefined
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Customer = z.infer<typeof CustomerSchema> & { _id: string };

// Schema for form input validation
export const CreateCustomerInputSchema = CustomerSchema.omit({ _id: true, createdAt: true, updatedAt: true })
  .extend({
    // Ensure that empty strings from the form are also considered valid for optional fields
    // and will be converted to null by the server action before DB insertion.
    email: z.string().email("Invalid email address").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
  });
export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;

