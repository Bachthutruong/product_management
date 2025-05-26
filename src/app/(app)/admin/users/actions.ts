
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { UserSchema, type User, type CreateUserInput, CreateUserSchema, type AuthUser } from '@/models/User';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const USERS_COLLECTION = 'users';
const SALT_ROUNDS = 10;

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getUsers(): Promise<AuthUser[]> {
  try {
    const db = await getDb();
    // Projection to exclude the password field
    const usersFromDb = await db.collection<Omit<User, 'password'>>(USERS_COLLECTION)
      .find({})
      .project({ password: 0 }) // Exclude password
      .sort({ createdAt: -1 })
      .toArray();
    
    return usersFromDb.map(user => ({
      ...user,
      _id: user._id.toString(),
      createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return [];
  }
}

export async function addUser(data: CreateUserInput): Promise<{ success: boolean; user?: AuthUser; error?: string; errors?: z.ZodIssue[] }> {
  const validation = CreateUserSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { name, email, password, role } = validation.data;

  try {
    const db = await getDb();
    const existingUser = await db.collection(USERS_COLLECTION).findOne({ email });
    if (existingUser) {
      return { success: false, error: 'User with this email already exists.' };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUserDbData = {
      name,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(USERS_COLLECTION).insertOne(newUserDbData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert user into database.' };
    }
    
    const insertedUser: AuthUser = {
        name: newUserDbData.name,
        email: newUserDbData.email,
        role: newUserDbData.role,
        createdAt: newUserDbData.createdAt,
        updatedAt: newUserDbData.updatedAt,
        _id: result.insertedId.toString(),
    };

    revalidatePath('/admin/users');
    return { success: true, user: insertedUser };
  } catch (error) {
    console.error('Failed to add user:', error);
    return { success: false, error: 'An unexpected error occurred while adding the user.' };
  }
}

export async function deleteUser(id: string): Promise<{ success: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid user ID format.' };
  }
  try {
    const db = await getDb();
    const result = await db.collection(USERS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return { success: false, error: 'User not found or already deleted.' };
    }
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete user:', error);
    return { success: false, error: 'An unexpected error occurred while deleting the user.' };
  }
}
