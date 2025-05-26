
import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'employee']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  role: UserRoleSchema.default('employee'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Schema for creating a new user
export const CreateUserSchema = UserSchema.omit({ _id: true, createdAt: true, updatedAt: true });
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Full User type including MongoDB _id as string
export type User = z.infer<typeof UserSchema> & { _id: string };
