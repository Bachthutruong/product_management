
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { CustomerSchema, type Customer, type CreateCustomerInput, CreateCustomerInputSchema } from '@/models/Customer';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const CUSTOMERS_COLLECTION = 'customers';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getCustomers(params: {
  page?: number;
  limit?: number;
  searchTerm?: string;
  categoryId?: string;
} = {}): Promise<{ customers: Customer[], totalCount: number, totalPages: number }> {
  const { page = 1, limit = 10, searchTerm, categoryId } = params;
  try {
    const db = await getDb();
    const query: any = {};

    if (searchTerm) {
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { customerCode: searchRegex },
        { notes: searchRegex },
        { address: searchRegex },
      ];
    }
    if (categoryId && categoryId !== 'all') {
        query.categoryId = categoryId;
    }

    const totalCount = await db.collection(CUSTOMERS_COLLECTION).countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const customersFromDb = await db.collection(CUSTOMERS_COLLECTION)
      .find(query)
      // .sort({ createdAt: -1 }) // Removed sorting to keep insertion order
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();
    
    const validCustomers: Customer[] = [];
    
    for (const customerDoc of customersFromDb) {
      try {
        const customerData = {
          ...customerDoc,
          _id: customerDoc._id.toString(),
          createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt) : undefined,
          updatedAt: customerDoc.updatedAt ? new Date(customerDoc.updatedAt) : undefined,
        };
        
        const parseResult = CustomerSchema.safeParse(customerData);
        
        if (parseResult.success) {
          validCustomers.push(parseResult.data as Customer);
        } else {
          console.warn(`Skipping invalid customer with ID ${customerDoc._id}:`, parseResult.error.errors);
        }
      } catch (error) {
        console.error(`Error processing customer with ID ${customerDoc._id}:`, error);
      }
    }
    
    return { customers: validCustomers, totalCount, totalPages };
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    return { customers: [], totalCount: 0, totalPages: 0 };
  }
}

export async function addCustomer(data: CreateCustomerInput): Promise<{ success: boolean; customer?: Customer; error?: string; errors?: z.ZodIssue[] }> {
  const validation = CreateCustomerInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { name, email, phone, address, categoryId } = validation.data;

  try {
    const db = await getDb();
    
    // Get category name for display
    const category = await db.collection('customer_categories').findOne({ _id: new ObjectId(categoryId) });
    const categoryName = category?.name || '';

    const newCustomerDbData = {
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      categoryId,
      categoryName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomerDbData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert customer into database.' };
    }
    
    const customerData = {
        ...newCustomerDbData,
        _id: result.insertedId.toString(),
    };
    
    const parseResult = CustomerSchema.safeParse(customerData);
    if (!parseResult.success) {
      console.error('Failed to parse inserted customer:', parseResult.error.errors);
      return { success: false, error: 'Failed to validate inserted customer data.' };
    }
    
    const insertedCustomer = parseResult.data as Customer;

    revalidatePath('/customers');
    revalidatePath('/orders'); 
    return { success: true, customer: insertedCustomer };
  } catch (error) {
    console.error('Failed to add customer:', error);
    return { success: false, error: 'An unexpected error occurred while adding the customer.' };
  }
}

export async function deleteCustomer(id: string, userRole: string): Promise<{ success: boolean; error?: string }> {
   if (userRole !== 'admin') {
    return { success: false, error: 'Permission denied. Only admins can delete customers.' };
  }
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid customer ID format.' };
  }
  try {
    const db = await getDb();
    const result = await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return { success: false, error: 'Customer not found or already deleted.' };
    }
    revalidatePath('/customers');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete customer:', error);
    return { success: false, error: 'An unexpected error occurred while deleting the customer.' };
  }
}


export async function updateCustomer(
  customerId: string,
  data: Partial<CreateCustomerInput>
): Promise<{ success: boolean; customer?: Customer; error?: string; errors?: z.ZodIssue[] }> {
   if (!ObjectId.isValid(customerId)) {
    return { success: false, error: 'Invalid customer ID format.' };
  }

  const partialSchema = CreateCustomerInputSchema.partial();
  const validation = partialSchema.safeParse(data);

  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }
  
  // Ensure no empty strings are passed for fields that should be unset/null if empty
  const updatePayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(validation.data)) {
    if (value === '' && (key === 'email' || key === 'phone' || key === 'address')) {
      updatePayload[key] = null;
    } else if (value !== undefined) { // only include defined values
      updatePayload[key] = value;
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    // No actual data to update, maybe just return success or the original customer
     const existingCustomer = await getCustomerById(customerId);
     if (existingCustomer) {
        return { success: true, customer: existingCustomer };
     }
     return { success: false, error: 'No data provided for update and customer not found.' };
  }

  try {
    const db = await getDb();
    
    // If categoryId is being updated, also update categoryName
    if (updatePayload.categoryId) {
      const category = await db.collection('customer_categories').findOne({ _id: new ObjectId(updatePayload.categoryId) });
      updatePayload.categoryName = category?.name || '';
    }
    
    const updateDataWithTimestamp = { ...updatePayload, updatedAt: new Date() };

    const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(customerId) },
      { $set: updateDataWithTimestamp },
      { returnDocument: 'after' }
    );

    if (!result) { 
      return { success: false, error: 'Customer not found or failed to update.' };
    }
    
    const customerData = {
        ...result,
        _id: result._id.toString(),
    };
    
    const parseResult = CustomerSchema.safeParse(customerData);
    if (!parseResult.success) {
      console.error('Failed to parse updated customer:', parseResult.error.errors);
      return { success: false, error: 'Failed to validate updated customer data.' };
    }
    
    const updatedCustomer = parseResult.data as Customer;

    revalidatePath('/customers');
    revalidatePath(`/customers/${customerId}`); 
    revalidatePath('/orders'); 

    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
    console.error('Failed to update customer:', error);
     if (error instanceof z.ZodError) {
      return { success: false, error: "Data validation error during update processing.", errors: error.errors };
    }
    return { success: false, error: 'An unexpected error occurred while updating the customer.' };
  }
}

// Bulk import customers from CSV/Excel data
export async function importCustomers(
  customersData: Array<{
    name: string;
    customerCode?: string;
    email?: string;
    phone?: string;
    address?: string;
    categoryName?: string;
    notes?: string;
  }>,
  options: {
    skipDuplicates: boolean;
    updateExisting: boolean;
  } = { skipDuplicates: true, updateExisting: false }
): Promise<{ 
  success: boolean; 
  imported: number; 
  failed: number; 
  errors: string[];
  duplicates: number;
  updated: number;
}> {
  try {
    const db = await getDb();
    
    // Helper function to process field values, treating "N/A" as null
    const processFieldValue = (value?: string): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      return (trimmed === '' || trimmed.toUpperCase() === 'N/A') ? null : trimmed;
    };

    // Get all customer categories for mapping
    const categories = await db.collection('customer_categories').find({ isActive: true }).toArray();
    const categoryMap = new Map<string, { id: string; name: string }>();
    categories.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase(), { id: cat._id.toString(), name: cat.name });
      if (cat.code) {
        categoryMap.set(cat.code.toLowerCase(), { id: cat._id.toString(), name: cat.name });
      }
    });
    
    const defaultCategory = categories[0];
    if (!defaultCategory) {
      return { success: false, imported: 0, failed: customersData.length, errors: ['沒有找到可用的客戶分類。請先創建至少一個客戶分類。'], duplicates: 0, updated: 0 };
    }
    
    let imported = 0, failed = 0, duplicates = 0, updated = 0;
    const errors: string[] = [];
    
    // Get all existing customers to check for duplicates
    const existingCustomers = await db.collection(CUSTOMERS_COLLECTION).find({}).toArray();
    const existingCustomerMap = new Map(existingCustomers.map(c => [c.name.toLowerCase(), c]));

    for (let i = 0; i < customersData.length; i++) {
      const row = customersData[i];
      const rowNumber = i + 2;

      try {
        if (!row.name || row.name.trim() === '') {
          errors.push(`第 ${rowNumber} 行：客戶名稱不能為空`);
          failed++;
          continue;
        }

        const cleanRow = {
          name: processFieldValue(row.name),
          customerCode: processFieldValue(row.customerCode),
          email: processFieldValue(row.email),
          phone: processFieldValue(row.phone),
          address: processFieldValue(row.address),
          categoryName: processFieldValue(row.categoryName),
          notes: processFieldValue(row.notes),
        };

        // Strict duplicate check: all fields must match
        const findDuplicate = (existing: any) => {
            return existing.name === cleanRow.name &&
                   (existing.customerCode || null) === cleanRow.customerCode &&
                   (existing.email || null) === cleanRow.email &&
                   (existing.phone || null) === cleanRow.phone &&
                   (existing.address || null) === cleanRow.address &&
                   (existing.notes || null) === cleanRow.notes;
        };

        const existingCustomer = existingCustomers.find(findDuplicate);

        // Determine category
        let categoryId = defaultCategory._id.toString();
        let categoryName = defaultCategory.name;
        if (cleanRow.categoryName) {
            const foundCategory = categoryMap.get(cleanRow.categoryName.toLowerCase());
            if (foundCategory) {
                categoryId = foundCategory.id;
                categoryName = foundCategory.name;
            }
        }
        
        const customerPayload = {
            name: cleanRow.name!,
            customerCode: cleanRow.customerCode || undefined,
            email: cleanRow.email || undefined,
            phone: cleanRow.phone || undefined,
            address: cleanRow.address || undefined,
            notes: cleanRow.notes || undefined,
            categoryId: categoryId,
        };
        // We don't pass categoryName to updateCustomer, it's derived there.

        if (existingCustomer) {
            if (options.updateExisting) {
                const updateResult = await updateCustomer(existingCustomer._id.toString(), customerPayload);
                if (updateResult.success) updated++;
                else {
                    failed++;
                    errors.push(`第 ${rowNumber} 行：更新失敗 - ${updateResult.error}`);
                }
            } else {
                duplicates++;
                errors.push(`第 ${rowNumber} 行：客戶資料完全重複 (${row.name})`);
            }
            continue;
        }

        // Validate with schema before inserting new customer
        const validation = CreateCustomerInputSchema.safeParse(customerPayload);
        if (!validation.success) {
            const errorMessages = validation.error.errors.map(e => e.message).join(', ');
            errors.push(`第 ${rowNumber} 行：驗證失敗 - ${errorMessages}`);
            failed++;
            continue;
        }
        
        const finalPayload = {
            ...customerPayload,
            categoryName: categoryName, // Add categoryName for insert
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Insert new customer
        await db.collection(CUSTOMERS_COLLECTION).insertOne(finalPayload);
        imported++;
        
      } catch (error) {
        console.error(`Error importing customer at row ${rowNumber}:`, error);
        errors.push(`第 ${rowNumber} 行：處理錯誤 - ${error instanceof Error ? error.message : '未知錯誤'}`);
        failed++;
      }
    }
    
    if (imported > 0 || updated > 0) {
      revalidatePath('/customers');
      revalidatePath('/orders');
    }
    
    return { success: (imported + updated) > 0, imported, failed, errors, duplicates, updated };
    
  } catch (error) {
    console.error('Failed to import customers:', error);
    return { success: false, imported: 0, failed: customersData.length, errors: ['導入過程中發生意外錯誤'], duplicates: 0, updated: 0 };
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  if (!ObjectId.isValid(id)) {
    console.error('Invalid customer ID format for getCustomerById:', id);
    return null;
  }
  try {
    const db = await getDb();
    const customerDoc = await db.collection(CUSTOMERS_COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!customerDoc) {
      return null;
    }
    
    const customerData = {
      ...customerDoc,
      _id: customerDoc._id.toString(),
      createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt) : undefined,
      updatedAt: customerDoc.updatedAt ? new Date(customerDoc.updatedAt) : undefined,
    };
    
    // Use safeParse to avoid throwing errors
    const parseResult = CustomerSchema.safeParse(customerData);
    
    if (parseResult.success) {
      return parseResult.data as Customer;
    } else {
      console.warn(`Invalid customer with ID ${id}:`, parseResult.error.errors);
      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch customer ${id}:`, error);
    return null;
  }
}
