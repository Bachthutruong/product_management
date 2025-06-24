
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
    
    const validCustomers: Customer[] = [];
    
    for (const customerDoc of customersFromDb) {
      try {
        // Prepare the customer data
        const customerData = {
          ...customerDoc,
          _id: customerDoc._id.toString(),
          createdAt: customerDoc.createdAt ? new Date(customerDoc.createdAt) : undefined,
          updatedAt: customerDoc.updatedAt ? new Date(customerDoc.updatedAt) : undefined,
        };
        
        // Use safeParse to avoid throwing errors
        const parseResult = CustomerSchema.safeParse(customerData);
        
        if (parseResult.success) {
          validCustomers.push(parseResult.data as Customer);
        } else {
          console.warn(`Skipping invalid customer with ID ${customerDoc._id}:`, parseResult.error.errors);
          
          // Try to fix missing categoryId
          if (!customerDoc.categoryId) {
            try {
              // Get the first available customer category as default
              const defaultCategory = await db.collection('customer_categories')
                .findOne({ isActive: true }, { sort: { createdAt: 1 } });
              
              if (defaultCategory) {
                const defaultCategoryId = defaultCategory._id.toString();
                const defaultCategoryName = defaultCategory.name;
                
                // Update the customer in database with default category
                await db.collection(CUSTOMERS_COLLECTION).updateOne(
                  { _id: customerDoc._id },
                  { 
                    $set: { 
                      categoryId: defaultCategoryId,
                      categoryName: defaultCategoryName,
                      updatedAt: new Date() 
                    } 
                  }
                );
                
                console.log(`Added default category "${defaultCategoryName}" (${defaultCategoryId}) to customer ID ${customerDoc._id}`);
                
                // Try parsing again with fixed data
                const fixedCustomerData = {
                  ...customerData,
                  categoryId: defaultCategoryId,
                  categoryName: defaultCategoryName,
                };
                
                const fixedParseResult = CustomerSchema.safeParse(fixedCustomerData);
                if (fixedParseResult.success) {
                  validCustomers.push(fixedParseResult.data as Customer);
                } else {
                  console.error(`Still invalid after fixing categoryId for customer ID ${customerDoc._id}:`, fixedParseResult.error.errors);
                }
              } else {
                console.error(`No default category found for customer ID ${customerDoc._id}`);
              }
            } catch (fixError) {
              console.error(`Failed to fix categoryId for customer ID ${customerDoc._id}:`, fixError);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing customer with ID ${customerDoc._id}:`, error);
      }
    }
    
    return validCustomers;
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
      
      // Try to fix missing categoryId
      if (!customerDoc.categoryId) {
        try {
          // Get the first available customer category as default
          const defaultCategory = await db.collection('customer_categories')
            .findOne({ isActive: true }, { sort: { createdAt: 1 } });
          
          if (defaultCategory) {
            const defaultCategoryId = defaultCategory._id.toString();
            const defaultCategoryName = defaultCategory.name;
            
            // Update the customer in database with default category
            await db.collection(CUSTOMERS_COLLECTION).updateOne(
              { _id: customerDoc._id },
              { 
                $set: { 
                  categoryId: defaultCategoryId,
                  categoryName: defaultCategoryName,
                  updatedAt: new Date() 
                } 
              }
            );
            
            console.log(`Added default category "${defaultCategoryName}" (${defaultCategoryId}) to customer ID ${id}`);
            
            // Try parsing again with fixed data
            const fixedCustomerData = {
              ...customerData,
              categoryId: defaultCategoryId,
              categoryName: defaultCategoryName,
            };
            
            const fixedParseResult = CustomerSchema.safeParse(fixedCustomerData);
            if (fixedParseResult.success) {
              return fixedParseResult.data as Customer;
            } else {
              console.error(`Still invalid after fixing categoryId for customer ID ${id}:`, fixedParseResult.error.errors);
            }
          } else {
            console.error(`No default category found for customer ID ${id}`);
          }
        } catch (fixError) {
          console.error(`Failed to fix categoryId for customer ID ${id}:`, fixError);
        }
      }
      
      return null;
    }
  } catch (error) {
    console.error(`Failed to fetch customer ${id}:`, error);
    return null;
  }
}
