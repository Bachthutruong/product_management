
import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'employee']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().optional(), // Password will be hashed, optional for fetching (we don't always return it)
  role: UserRoleSchema.default('employee'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Schema for creating a new user (e.g., by an admin)
export const CreateUserSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters long" }),
  role: UserRoleSchema.default('employee'),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Schema for login
export const LoginUserInputSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
  // Role is not needed here for login, as it's determined from the database
});
export type LoginUserInput = z.infer<typeof LoginUserInputSchema>;

// Full User type including MongoDB _id as string
export type User = z.infer<typeof UserSchema> & { _id: string };

// User type for client-side context (omits password)
export type AuthUser = Omit<User, 'password'>;
