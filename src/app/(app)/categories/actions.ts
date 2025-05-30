'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { CategorySchema, type Category, CategoryFormInputSchema, CategoryFormInput } from '@/models/Category';
import { ProductSchema } from '@/models/Product'; // To check for products using a category
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const CATEGORIES_COLLECTION = 'categories';
const PRODUCTS_COLLECTION = 'products'; // For checking product associations

async function getDb() {
    const client = await clientPromise;
    return client.db(DB_NAME);
}

// Create Category
export async function addCategory(
    formData: CategoryFormInput
): Promise<{ success: boolean; category?: Category; error?: string; errors?: z.ZodIssue[] }> {
    const validation = CategoryFormInputSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, error: "Validation failed", errors: validation.error.errors };
    }

    try {
        const db = await getDb();
        const existingCategory = await db.collection(CATEGORIES_COLLECTION).findOne({ name: validation.data.name });
        if (existingCategory) {
            return { success: false, error: `Category with name "${validation.data.name}" already exists.` };
        }

        const newCategoryData = {
            ...validation.data,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection(CATEGORIES_COLLECTION).insertOne(newCategoryData);
        if (!result.insertedId) {
            return { success: false, error: 'Failed to insert category into database.' };
        }

        const categoryForReturn = {
            ...newCategoryData,
            _id: result.insertedId.toString(),
        } as Category;

        revalidatePath('/categories');
        revalidatePath('/products'); // Products might use categories in filters/forms
        return { success: true, category: categoryForReturn };

    } catch (error: any) {
        console.error('Failed to add category:', error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

// Get All Categories
export async function getCategories(params?: { page?: number, limit?: number, searchTerm?: string }): Promise<{
    categories: Category[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
}> {
    const { page = 1, limit = 10, searchTerm } = params || {};
    try {
        const db = await getDb();
        const query: any = {};
        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }

        const skip = (page - 1) * limit;
        const totalCount = await db.collection(CATEGORIES_COLLECTION).countDocuments(query);
        const categoriesFromDb = await db.collection(CATEGORIES_COLLECTION)
            .find(query)
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const parsedCategories = categoriesFromDb.map(catDoc => {
            return CategorySchema.parse({
                ...catDoc,
                _id: catDoc._id.toString(),
                createdAt: catDoc.createdAt ? new Date(catDoc.createdAt) : undefined,
                updatedAt: catDoc.updatedAt ? new Date(catDoc.updatedAt) : undefined,
            }) as Category;
        });

        return {
            categories: parsedCategories,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
        };
    } catch (error) {
        console.error('Failed to fetch categories:', error);
        return { categories: [], totalCount: 0, totalPages: 1, currentPage: 1 };
    }
}

// Get Category by ID
export async function getCategoryById(id: string): Promise<Category | null> {
    if (!ObjectId.isValid(id)) return null;
    try {
        const db = await getDb();
        const catDoc = await db.collection(CATEGORIES_COLLECTION).findOne({ _id: new ObjectId(id) });
        if (!catDoc) return null;
        return CategorySchema.parse({
            ...catDoc,
            _id: catDoc._id.toString(),
            createdAt: catDoc.createdAt ? new Date(catDoc.createdAt) : undefined,
            updatedAt: catDoc.updatedAt ? new Date(catDoc.updatedAt) : undefined,
        }) as Category;
    } catch (error) {
        console.error(`Failed to fetch category ${id}:`, error);
        return null;
    }
}

// Update Category
export async function updateCategory(
    id: string,
    formData: CategoryFormInput
): Promise<{ success: boolean; category?: Category; error?: string; errors?: z.ZodIssue[] }> {
    if (!ObjectId.isValid(id)) {
        return { success: false, error: 'Invalid category ID.' };
    }

    const validation = CategoryFormInputSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, error: "Validation failed", errors: validation.error.errors };
    }

    try {
        const db = await getDb();
        const existingCategoryWithName = await db.collection(CATEGORIES_COLLECTION).findOne({
            name: validation.data.name,
            _id: { $ne: new ObjectId(id) } // Check for other categories with the same name
        });
        if (existingCategoryWithName) {
            return { success: false, error: `Another category with name "${validation.data.name}" already exists.` };
        }

        const updateData = {
            ...validation.data,
            updatedAt: new Date(),
        };

        const result = await db.collection(CATEGORIES_COLLECTION).findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!result) {
            return { success: false, error: 'Category not found or failed to update.' };
        }

        const updatedCategory = CategorySchema.parse({
            ...result,
            _id: result._id.toString(),
        }) as Category;

        // If category name changed, update associated products
        if (validation.data.name && validation.data.name !== (await getCategoryById(id))?.name) {
            await db.collection(PRODUCTS_COLLECTION).updateMany(
                { categoryId: id }, // Assuming products will store categoryId
                { $set: { categoryName: validation.data.name, updatedAt: new Date() } }
            );
        }

        revalidatePath('/categories');
        revalidatePath('/products');
        return { success: true, category: updatedCategory };

    } catch (error: any) {
        console.error(`Failed to update category ${id}:`, error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

// Delete Category
export async function deleteCategory(
    id: string
): Promise<{ success: boolean; error?: string }> {
    if (!ObjectId.isValid(id)) {
        return { success: false, error: 'Invalid category ID.' };
    }

    try {
        const db = await getDb();
        // Check if any product is using this category
        // This depends on how products store category info (e.g., categoryId or categoryName)
        // For now, let's assume products will have a `categoryId` field.
        const productCount = await db.collection(PRODUCTS_COLLECTION).countDocuments({ categoryId: id });
        if (productCount > 0) {
            return {
                success: false,
                error: `Cannot delete category. ${productCount} product(s) are currently assigned to it.`,
            };
        }

        const result = await db.collection(CATEGORIES_COLLECTION).deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return { success: false, error: 'Category not found or already deleted.' };
        }

        revalidatePath('/categories');
        revalidatePath('/products');
        return { success: true };

    } catch (error: any) {
        console.error(`Failed to delete category ${id}:`, error);
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
} 