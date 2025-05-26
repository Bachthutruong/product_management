
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { UserSchema, type User, type CreateUserInput, CreateUserSchema } from '@/models/User';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const USERS_COLLECTION = 'users';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getUsers(): Promise<User[]> {
  try {
    const db = await getDb();
    const users = await db.collection<User>(USERS_COLLECTION).find({}).sort({ createdAt: -1 }).toArray();
    
    return users.map(user => ({
      ...user,
      _id: user._id.toString(),
      createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch users:', error);
    // In a real app, handle this error more gracefully
    return [];
  }
}

export async function addUser(data: CreateUserInput): Promise<{ success: boolean; user?: User; error?: string; errors?: z.ZodIssue[] }> {
  const validation = CreateUserSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  try {
    const db = await getDb();
    // Check if user with email already exists
    const existingUser = await db.collection(USERS_COLLECTION).findOne({ email: validation.data.email });
    if (existingUser) {
      return { success: false, error: 'User with this email already exists.' };
    }

    const newUserDbData = {
      ...validation.data,
      // In a real app, password should be hashed here.
      // For this prototype, we are not handling passwords in user creation by admin.
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(USERS_COLLECTION).insertOne(newUserDbData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert user into database.' };
    }
    
    const insertedUser: User = {
        ...(newUserDbData as Omit<typeof newUserDbData, 'createdAt' | 'updatedAt'> & { createdAt: Date, updatedAt: Date}), // Type assertion
        _id: result.insertedId.toString(),
    };

    revalidatePath('/admin/users');
    return { success: true, user: insertedUser };
  } catch (error) {
    console.error('Failed to add user:', error);
    // Provide a more generic error message to the client
    return { success: false, error: 'An unexpected error occurred while adding the user.' };
  }
}

export async function deleteUser(id: string): Promise<{ success: boolean; error?: string }> {
  // IMPORTANT: In a real app, ensure the calling user is an admin before allowing deletion.
  // This mock doesn't pass authenticated user to server actions, so this check is missing here.
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

// Placeholder for updateUser - to be implemented later
// export async function updateUser(id: string, data: Partial<CreateUserInput>): Promise<{ success: boolean; user?: User; error?: string, errors?: z.ZodIssue[] }> {
//   // ... implementation
//   revalidatePath('/admin/users');
//   return { success: true };
// }
