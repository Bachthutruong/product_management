"use server";

import clientPromise from '@/lib/mongodb';
import { CustomerCategorySchema, type CustomerCategory, type CreateCustomerCategoryInput, CreateCustomerCategoryInputSchema } from '@/models/CustomerCategory';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const CUSTOMER_CATEGORIES_COLLECTION = 'customer_categories';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getCustomerCategories(): Promise<CustomerCategory[]> {
  try {
    const db = await getDb();
    const categoriesFromDb = await db.collection(CUSTOMER_CATEGORIES_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    const validCategories: CustomerCategory[] = [];
    
    for (const categoryDoc of categoriesFromDb) {
      try {
        // Prepare the category data
        const categoryData = {
          ...categoryDoc,
          _id: categoryDoc._id.toString(),
          createdAt: categoryDoc.createdAt ? new Date(categoryDoc.createdAt) : undefined,
          updatedAt: categoryDoc.updatedAt ? new Date(categoryDoc.updatedAt) : undefined,
        };
        
        // Use safeParse to avoid throwing errors
        const parseResult = CustomerCategorySchema.safeParse(categoryData);
        
        if (parseResult.success) {
          validCategories.push(parseResult.data as CustomerCategory);
        } else {
          console.warn(`Skipping invalid customer category with ID ${categoryDoc._id}:`, parseResult.error.errors);
          
          // Try to fix the code and update in database
          if (categoryDoc.code && typeof categoryDoc.code === 'string') {
            const originalCode = categoryDoc.code;
            // Fix the code by converting to uppercase and removing invalid characters
            const fixedCode = originalCode
              .toUpperCase()
              .replace(/[^A-Z_]/g, '') // Remove anything that's not A-Z or underscore
              .replace(/^_+/, '') // Remove leading underscores
              .replace(/_+$/, '') // Remove trailing underscores
              .replace(/_+/g, '_'); // Replace multiple underscores with single
            
            if (fixedCode && fixedCode.length > 0) {
              try {
                // Check if fixed code already exists
                const existingWithFixedCode = await db.collection(CUSTOMER_CATEGORIES_COLLECTION)
                  .findOne({ code: fixedCode, _id: { $ne: categoryDoc._id } });
                
                let finalFixedCode = fixedCode;
                if (existingWithFixedCode) {
                  // Generate unique code if fixed code already exists
                  finalFixedCode = await generateUniqueCode(db, categoryDoc.name || 'CATEGORY');
                }
                
                // Update the category in database with fixed code
                await db.collection(CUSTOMER_CATEGORIES_COLLECTION).updateOne(
                  { _id: categoryDoc._id },
                  { $set: { code: finalFixedCode, updatedAt: new Date() } }
                );
                
                console.log(`Fixed category code from "${originalCode}" to "${finalFixedCode}" for category ID ${categoryDoc._id}`);
                
                // Try parsing again with fixed data
                const fixedCategoryData = {
                  ...categoryData,
                  code: finalFixedCode,
                };
                
                const fixedParseResult = CustomerCategorySchema.safeParse(fixedCategoryData);
                if (fixedParseResult.success) {
                  validCategories.push(fixedParseResult.data as CustomerCategory);
                } else {
                  console.error(`Still invalid after fixing code for category ID ${categoryDoc._id}:`, fixedParseResult.error.errors);
                }
              } catch (fixError) {
                console.error(`Failed to fix category code for ID ${categoryDoc._id}:`, fixError);
              }
            } else {
              console.error(`Cannot fix empty code for category ID ${categoryDoc._id}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing category with ID ${categoryDoc._id}:`, error);
      }
    }
    
    return validCategories;
  } catch (error) {
    console.error('Failed to fetch customer categories:', error);
    return [];
  }
}

// Helper function to generate code from name
function generateCodeFromName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'CATEGORY';
  }
  
  // Convert to uppercase and keep only letters and spaces
  let code = name
    .toUpperCase()
    .replace(/[^A-Za-z\s]/g, '') // Keep only letters and spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 20); // Limit length
  
  // Remove any remaining non A-Z, underscore characters (safety check)
  code = code.replace(/[^A-Z_]/g, '');
  
  // If the result is empty or too short, use fallback
  if (!code || code.length === 0) {
    code = 'CATEGORY';
  }
  
  // Ensure it starts with a letter (not underscore)
  if (code.startsWith('_')) {
    code = 'CATEGORY' + code;
  }
  
  // Final safety check - ensure it matches the required pattern
  if (!/^[A-Z_]+$/.test(code)) {
    code = 'CATEGORY';
  }
  
  return code;
}

// Helper function to ensure unique code
async function generateUniqueCode(db: any, baseName: string): Promise<string> {
  let baseCode = generateCodeFromName(baseName);
  let code = baseCode;
  let counter = 0;
  
  // Array of letters to use as suffixes instead of numbers
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  while (await db.collection(CUSTOMER_CATEGORIES_COLLECTION).findOne({ code })) {
    if (counter < letters.length) {
      code = `${baseCode}_${letters[counter]}`;
    } else {
      // If we run out of single letters, use double letters: AA, AB, AC, etc.
      const firstLetter = Math.floor(counter / letters.length) - 1;
      const secondLetter = counter % letters.length;
      code = `${baseCode}_${letters[firstLetter]}${letters[secondLetter]}`;
    }
    counter++;
    
    // Safety check - if counter gets too high, just use random letters
    if (counter > 999) {
      const randomSuffix = Array.from({length: 4}, () => letters[Math.floor(Math.random() * letters.length)]).join('');
      code = `${baseCode}_${randomSuffix}`;
      break;
    }
  }
  
  // Final validation before returning
  if (!/^[A-Z_]+$/.test(code)) {
    console.error(`Generated unique code "${code}" is invalid. Using fallback.`);
    const randomSuffix = Array.from({length: 4}, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    code = 'CATEGORY_' + randomSuffix;
  }
  
  
  
  return code;
}

export async function createCustomerCategory(data: CreateCustomerCategoryInput): Promise<{ success: boolean; category?: CustomerCategory; error?: string; errors?: z.ZodIssue[] }> {
  const validation = CreateCustomerCategoryInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { name, code: inputCode, description, isActive } = validation.data;

  try {
    const db = await getDb();
    
    // Generate code from name if not provided
    let finalCode = inputCode;
    if (!finalCode) {
      finalCode = await generateUniqueCode(db, name);
    } else {
      // Check if manually provided code already exists
      const existingCategory = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).findOne({ code: finalCode });
      if (existingCategory) {
        return { success: false, error: '分類代碼已存在' };
      }
    }

    // Final validation of the code before saving
    if (!finalCode || !/^[A-Z_]+$/.test(finalCode)) {
      console.error(`Invalid final code generated: "${finalCode}" for name: "${name}"`);
      // Create a safe fallback using only letters
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const randomSuffix = Array.from({length: 4}, () => letters[Math.floor(Math.random() * letters.length)]).join('');
      finalCode = 'CATEGORY_' + randomSuffix;
    }



    const newCategoryDbData = {
      name,
      code: finalCode,
      description: description || null,
      isActive: isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).insertOne(newCategoryDbData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert category into database.' };
    }
    
    const insertedCategory = CustomerCategorySchema.parse({
      ...newCategoryDbData,
      _id: result.insertedId.toString(),
    }) as CustomerCategory;

    revalidatePath('/customer-categories');
    return { success: true, category: insertedCategory };
  } catch (error) {
    console.error('Failed to create customer category:', error);
    return { success: false, error: 'An unexpected error occurred while creating the category.' };
  }
}

export async function updateCustomerCategory(
  categoryId: string,
  data: Partial<CreateCustomerCategoryInput>
): Promise<{ success: boolean; category?: CustomerCategory; error?: string; errors?: z.ZodIssue[] }> {
  if (!ObjectId.isValid(categoryId)) {
    return { success: false, error: 'Invalid category ID format.' };
  }

  const partialSchema = CreateCustomerCategoryInputSchema.partial();
  const validation = partialSchema.safeParse(data);

  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  try {
    const db = await getDb();
    
    // If updating code, check if it already exists for other categories
    if (data.code) {
      const existingCategory = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).findOne({ 
        code: data.code, 
        _id: { $ne: new ObjectId(categoryId) } 
      });
      if (existingCategory) {
        return { success: false, error: '分類代碼已存在' };
      }
    }

    const updatePayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(validation.data)) {
      if (value === '' && key === 'description') {
        updatePayload[key] = null;
      } else if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      const existingCategory = await getCustomerCategoryById(categoryId);
      if (existingCategory) {
        return { success: true, category: existingCategory };
      }
      return { success: false, error: 'No data provided for update and category not found.' };
    }

    const updateDataWithTimestamp = { ...updatePayload, updatedAt: new Date() };

    const result = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(categoryId) },
      { $set: updateDataWithTimestamp },
      { returnDocument: 'after' }
    );

    if (!result) {
      return { success: false, error: 'Category not found or failed to update.' };
    }
    
    const updatedCategory = CustomerCategorySchema.parse({
      ...result,
      _id: result._id.toString(),
    }) as CustomerCategory;

    revalidatePath('/customer-categories');
    return { success: true, category: updatedCategory };
  } catch (error: any) {
    console.error('Failed to update customer category:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: "Data validation error during update processing.", errors: error.errors };
    }
    return { success: false, error: 'An unexpected error occurred while updating the category.' };
  }
}

export async function deleteCustomerCategory(id: string): Promise<{ success: boolean; error?: string }> {
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid category ID format.' };
  }
  
  try {
    const db = await getDb();
    
    // TODO: Check if category is being used by customers
    // const customersUsingCategory = await db.collection('customers').countDocuments({ categoryId: new ObjectId(id) });
    // if (customersUsingCategory > 0) {
    //   return { success: false, error: '此分類正在被客戶使用，無法刪除' };
    // }

    const result = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return { success: false, error: 'Category not found or already deleted.' };
    }

    revalidatePath('/customer-categories');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete customer category:', error);
    return { success: false, error: 'An unexpected error occurred while deleting the category.' };
  }
}

export async function getCustomerCategoryById(id: string): Promise<CustomerCategory | null> {
  if (!ObjectId.isValid(id)) {
    console.error('Invalid category ID format for getCustomerCategoryById:', id);
    return null;
  }
  
  try {
    const db = await getDb();
    const categoryDoc = await db.collection(CUSTOMER_CATEGORIES_COLLECTION).findOne({ _id: new ObjectId(id) });
    
    if (!categoryDoc) {
      return null;
    }
    
    const categoryData = {
      ...categoryDoc,
      _id: categoryDoc._id.toString(),
      createdAt: categoryDoc.createdAt ? new Date(categoryDoc.createdAt) : undefined,
      updatedAt: categoryDoc.updatedAt ? new Date(categoryDoc.updatedAt) : undefined,
    };
    
    // Use safeParse to avoid throwing errors
    const parseResult = CustomerCategorySchema.safeParse(categoryData);
    
    if (parseResult.success) {
      return parseResult.data as CustomerCategory;
    } else {
      console.warn(`Invalid customer category with ID ${id}:`, parseResult.error.errors);
      
      // Try to fix the code if it's invalid
      if (categoryDoc.code && typeof categoryDoc.code === 'string') {
        const originalCode = categoryDoc.code;
        const fixedCode = originalCode
          .toUpperCase()
          .replace(/[^A-Z_]/g, '')
          .replace(/^_+/, '')
          .replace(/_+$/, '')
          .replace(/_+/g, '_');
        
        if (fixedCode && fixedCode.length > 0) {
          try {
            // Check if fixed code already exists
            const existingWithFixedCode = await db.collection(CUSTOMER_CATEGORIES_COLLECTION)
              .findOne({ code: fixedCode, _id: { $ne: categoryDoc._id } });
            
            let finalFixedCode = fixedCode;
            if (existingWithFixedCode) {
              finalFixedCode = await generateUniqueCode(db, categoryDoc.name || 'CATEGORY');
            }
            
            // Update the category in database with fixed code
            await db.collection(CUSTOMER_CATEGORIES_COLLECTION).updateOne(
              { _id: categoryDoc._id },
              { $set: { code: finalFixedCode, updatedAt: new Date() } }
            );
            
            console.log(`Fixed category code from "${originalCode}" to "${finalFixedCode}" for category ID ${id}`);
            
            // Try parsing again with fixed data
            const fixedCategoryData = {
              ...categoryData,
              code: finalFixedCode,
            };
            
            const fixedParseResult = CustomerCategorySchema.safeParse(fixedCategoryData);
            if (fixedParseResult.success) {
              return fixedParseResult.data as CustomerCategory;
            }
          } catch (fixError) {
            console.error(`Failed to fix category code for ID ${id}:`, fixError);
          }
        }
      }
      
      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch customer category ${id}:`, error);
    return null;
  }
} 