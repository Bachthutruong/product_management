
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

export async function getCustomers(searchTerm?: string): Promise<Customer[]> {
  try {
    const db = await getDb();
    const query: any = {};
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }
    const customersFromDb = await db.collection(CUSTOMERS_COLLECTION)
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    
    return customersFromDb.map(customerDoc => CustomerSchema.parse({
      ...customerDoc,
      _id: customerDoc._id.toString(),
      createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt) : undefined,
      updatedAt: customerDoc.updatedAt ? new Date(customerDoc.updatedAt) : undefined,
    }) as Customer);
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    return [];
  }
}

export async function addCustomer(data: CreateCustomerInput): Promise<{ success: boolean; customer?: Customer; error?: string; errors?: z.ZodIssue[] }> {
  const validation = CreateCustomerInputSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { name, email, phone, address } = validation.data;

  try {
    const db = await getDb();
    const newCustomerDbData = {
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomerDbData);

    if (!result.insertedId) {
      return { success: false, error: 'Failed to insert customer into database.' };
    }
    
    const insertedCustomer = CustomerSchema.parse({
        ...newCustomerDbData,
        _id: result.insertedId.toString(),
    }) as Customer;

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
    const updateDataWithTimestamp = { ...updatePayload, updatedAt: new Date() };

    const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(customerId) },
      { $set: updateDataWithTimestamp },
      { returnDocument: 'after' }
    );

    if (!result) { 
      return { success: false, error: 'Customer not found or failed to update.' };
    }
    
    const updatedCustomer = CustomerSchema.parse({
        ...result,
        _id: result._id.toString(),
    }) as Customer;

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
    return CustomerSchema.parse({
      ...customerDoc,
      _id: customerDoc._id.toString(),
      createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt) : undefined,
      updatedAt: customerDoc.updatedAt ? new Date(customerDoc.updatedAt) : undefined,
    }) as Customer;
  } catch (error) {
    console.error(`Failed to fetch customer ${id}:`, error);
    return null;
  }
}
