
'use server';

import clientPromise from '@/lib/mongodb';
import { LoginUserInputSchema, type LoginUserInput, type User, type AuthUser } from '@/models/User';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const USERS_COLLECTION = 'users';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function loginUser(
  data: LoginUserInput
): Promise<{ success: boolean; user?: AuthUser; error?: string; errors?: z.ZodIssue[] }> {
  const validation = LoginUserInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: 'Validation failed', errors: validation.error.errors };
  }

  const { email, password } = validation.data;

  try {
    const db = await getDb();
    const user = await db.collection<User>(USERS_COLLECTION).findOne({ email });

    if (!user || !user.password) {
      return { success: false, error: 'Invalid email or password.' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'Invalid email or password.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    const authUser: AuthUser = {
      ...userWithoutPassword,
      //@ts-expect-error _id is not in User model but might be added dynamically
      _id: user._id.toString(), // Ensure _id is a string
      createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : undefined,
    };

    return { success: true, user: authUser };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'An unexpected error occurred during login.' };
  }
}
