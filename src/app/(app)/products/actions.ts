
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductFormInputSchema, PriceHistoryEntrySchema } from '@/models/Product';
import type { UserRole, AuthUser } from '@/models/User';
import { uploadImageToCloudinary, deleteImageFromCloudinary } from '@/lib/cloudinary';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const CLOUDINARY_PRODUCT_IMAGE_FOLDER = process.env.CLOUDINARY_FOLDER || 'stockpilot_products';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getProducts(filters?: { category?: string; searchTerm?: string; stockStatus?: 'low' | 'inStock' | 'outOfStock' }): Promise<Product[]> {
  try {
    const db = await getDb();
    const query: any = {};

    if (filters?.category) {
      query.category = filters.category;
    }
    if (filters?.searchTerm) {
      query.$or = [
        { name: { $regex: filters.searchTerm, $options: 'i' } },
        { sku: { $regex: filters.searchTerm, $options: 'i' } },
        { description: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }
    if (filters?.stockStatus) {
      if (filters.stockStatus === 'low') {
        query.$expr = { $lt: [ "$stock", "$lowStockThreshold" ] };
      } else if (filters.stockStatus === 'inStock') {
        query.stock = { $gt: 0 };
      } else if (filters.stockStatus === 'outOfStock') {
        query.stock = { $lte: 0 };
      }
    }

    const productsFromDb = await db.collection(PRODUCTS_COLLECTION).find(query).sort({ createdAt: -1 }).toArray();
    
    return productsFromDb.map(productDoc => {
      const parsedProduct = ProductSchema.parse({
        ...productDoc,
        _id: productDoc._id.toString(),
        images: productDoc.images || [],
        priceHistory: productDoc.priceHistory || [],
        expiryDate: productDoc.expiryDate ? new Date(productDoc.expiryDate) : null,
        createdAt: productDoc.createdAt ? new Date(productDoc.createdAt) : undefined,
        updatedAt: productDoc.updatedAt ? new Date(productDoc.updatedAt) : undefined,
        lowStockThreshold: productDoc.lowStockThreshold ?? 0, 
        cost: productDoc.cost ?? 0, 
      });
      return parsedProduct as Product; 
    });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  try {
    const db = await getDb();
    const productDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!productDoc) {
      return null;
    }
    return ProductSchema.parse({
      ...productDoc,
      _id: productDoc._id.toString(),
      images: productDoc.images || [],
      priceHistory: productDoc.priceHistory || [],
      expiryDate: productDoc.expiryDate ? new Date(productDoc.expiryDate) : null,
      createdAt: productDoc.createdAt ? new Date(productDoc.createdAt) : undefined,
      updatedAt: productDoc.updatedAt ? new Date(productDoc.updatedAt) : undefined,
      lowStockThreshold: productDoc.lowStockThreshold ?? 0,
      cost: productDoc.cost ?? 0,
    }) as Product;
  } catch (error) {
    console.error(`Failed to fetch product ${id}:`, error);
    return null;
  }
}

// Schema for validating form data including changedByUserId and ensuring cost is handled.
// ProductFormInputSchema already includes cost handling via ProductSchema.
const AddProductFormDataSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
  // cost is already defined in ProductFormInputSchema (derived from ProductSchema)
  // as: cost: z.coerce.number().min(0).optional().default(0)
  // So no need to redefine it here unless we want to make it non-optional for this specific action.
  // For consistency, we rely on ProductFormInputSchema's definition.
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key === 'price' || key === 'stock' || key === 'lowStockThreshold' || key === 'cost') {
      const numValue = parseFloat(value as string);
      rawFormData[key] = isNaN(numValue) ? undefined : numValue; // Let Zod handle default for cost/lowStockThreshold if undefined
    } else if (key === 'expiryDate') {
      rawFormData[key] = value && (value as string).trim() !== '' ? new Date(value as string) : null;
    } else if (key === 'images') {
      // Handled separately
    }
     else {
      rawFormData[key] = value;
    }
  });
  
  // changedByUserId is expected to be in rawFormData from the client
  if (!formData.has('changedByUserId')) {
     return { success: false, error: "changedByUserId is missing from form data." };
  }
  rawFormData['changedByUserId'] = formData.get('changedByUserId');
  
  const { images: imageFiles, ...productDataFields } = rawFormData;

  const validation = AddProductFormDataSchema.safeParse(productDataFields);

  if (!validation.success) {
    console.log("Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { changedByUserId, ...validatedData } = validation.data; // validatedData now contains coerced numeric fields
  const uploadedImages: { url: string; publicId: string }[] = [];

  try {
    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.size > 0) { 
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          uploadedImages.push(result);
        }
      }
    }

    const db = await getDb();
    
    const initialPriceHistoryEntry = PriceHistoryEntrySchema.parse({
      price: validatedData.price, // Use coerced price from validatedData
      changedAt: new Date(),
      changedBy: changedByUserId,
    });

    const newProductData = {
      ...validatedData, // Contains already coerced numeric fields like price, cost, stock, lowStockThreshold
      sku: validatedData.sku || '', 
      category: validatedData.category || '',
      unitOfMeasure: validatedData.unitOfMeasure || '',
      description: validatedData.description || '',
      images: uploadedImages,
      priceHistory: [initialPriceHistoryEntry],
      // No need for Number() conversions here as validatedData should have them as numbers due to z.coerce
      // price: validatedData.price,
      // cost: validatedData.cost, // Zod handles default(0) if undefined
      // stock: validatedData.stock,
      // lowStockThreshold: validatedData.lowStockThreshold, // Zod handles default(0) if undefined
      expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await db.collection(PRODUCTS_COLLECTION).insertOne(newProductData);

    if (!result.insertedId) {
      for (const img of uploadedImages) { await deleteImageFromCloudinary(img.publicId); }
      return { success: false, error: 'Failed to insert product into database.' };
    }
    
    const insertedProduct = ProductSchema.parse({
        ...newProductData,
        _id: result.insertedId.toString(),
    }) as Product;

    revalidatePath('/products');
    revalidatePath('/dashboard'); // Revalidate dashboard as total products might change
    return { success: true, product: insertedProduct };
  } catch (error: any) {
    console.error('Failed to add product:', error);
    for (const img of uploadedImages) {
        try { await deleteImageFromCloudinary(img.publicId); } catch (deleteError) { console.error('Failed to delete uploaded image after error:', deleteError); }
    }
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error after processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function deleteProduct(id: string, userRole: UserRole): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'admin') {
    return { success: false, error: 'Permission denied. Only admins can delete products.' };
  }
  if (!ObjectId.isValid(id)) {
    return { success: false, error: 'Invalid product ID format.' };
  }
  try {
    const db = await getDb();
    const productToDelete = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(id) });

    if (!productToDelete) { return { success: false, error: 'Product not found.' }; }

    if (productToDelete.images && productToDelete.images.length > 0) {
      for (const image of productToDelete.images) {
        if (image.publicId) {
          try { await deleteImageFromCloudinary(image.publicId); } catch (cloudinaryError) { console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, cloudinaryError); }
        }
      }
    }

    const result = await db.collection(PRODUCTS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) { return { success: false, error: 'Product not found or already deleted.' }; }
    revalidatePath('/products');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete product:', error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

// Helper function to update product stock, could be expanded for batch tracking
export async function updateProductStock(
  productId: string, 
  quantityChange: number, // positive for increase, negative for decrease
  session?: any // For MongoDB transactions
): Promise<{success: boolean, error?: string}> {
  if (!ObjectId.isValid(productId)) {
    return { success: false, error: 'Invalid product ID.' };
  }
  const db = await getDb();
  const product = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) }, { session });

  if (!product) {
    return { success: false, error: 'Product not found for stock update.' };
  }

  const newStock = product.stock + quantityChange;
  if (newStock < 0) {
    return { success: false, error: `Stock cannot be negative. Current: ${product.stock}, Change: ${quantityChange}` };
  }

  const result = await db.collection(PRODUCTS_COLLECTION).updateOne(
    { _id: new ObjectId(productId) },
    { $set: { stock: newStock, updatedAt: new Date() } },
    { session }
  );

  if (result.modifiedCount === 0 && result.matchedCount === 0) {
     return { success: false, error: 'Product not found during stock update operation.' };
  }
   if (result.modifiedCount === 0 && result.matchedCount > 0) {
    console.warn(`Product ${productId} stock was matched but not modified. Current stock might already be ${newStock}.`);
  }

  return { success: true };
}


const UpdateProductFormDataSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
  // imagesToDelete is not part of ProductFormInputSchema and handled directly from FormData
}).partial(); // All fields are optional for update. Price, stock, etc. still use z.coerce from ProductSchema.


export async function updateProduct(
  productId: string,
  formData: FormData,
  currentUser: AuthUser 
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  if (!ObjectId.isValid(productId)) {
    return { success: false, error: 'Invalid product ID.' };
  }

  const db = await getDb();
  const existingProduct = await db.collection<Product>(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) });
  if (!existingProduct) {
    return { success: false, error: 'Product not found.' };
  }

  const rawFormData: Record<string, any> = { changedByUserId: currentUser._id };
  const imagesToDeletePublicIds: string[] = [];

  formData.forEach((value, key) => {
    if (key.startsWith('imagesToDelete[')) { 
      imagesToDeletePublicIds.push(value as string);
    } else if (key === 'price' || key === 'stock' || key === 'lowStockThreshold' || key === 'cost') {
      const numValue = parseFloat(value as string);
      // Let Zod handle coercion for undefined; pass NaN as undefined for Zod to process.
      rawFormData[key] = isNaN(numValue) ? undefined : numValue; 
    } else if (key === 'expiryDate') {
      rawFormData[key] = value && (value as string).trim() !== '' ? new Date(value as string) : null;
    } else if (key === 'images') {
      // New images are handled separately by iterating formData.getAll('images')
    } else {
      rawFormData[key] = value;
    }
  });
  
  // Ensure changedByUserId is set from currentUser if not already in formData (it should be added by client)
  if (!rawFormData.changedByUserId && currentUser?._id) {
    rawFormData.changedByUserId = currentUser._id;
  }
  
  const { images: newImageFilesFromRaw, ...productDataFields } = rawFormData; // Exclude 'images' key if it accidentally got here

  const validation = UpdateProductFormDataSchema.safeParse(productDataFields);
  if (!validation.success) {
    console.log("Update validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed during update.", errors: validation.error.errors };
  }

  const { changedByUserId, ...updateDataFromZod } = validation.data; // These are coerced values
  
  const finalUpdateOps: { $set: Partial<Product>, $push?: any, $pull?: any } = { $set: {} };
  
  // Apply validated Zod data to $set
  // Ensure only defined values from Zod output are set to avoid overwriting with undefined
  for (const key in updateDataFromZod) {
    if (updateDataFromZod[key as keyof typeof updateDataFromZod] !== undefined) {
      (finalUpdateOps.$set as any)[key] = updateDataFromZod[key as keyof typeof updateDataFromZod];
    }
  }
  finalUpdateOps.$set.updatedAt = new Date();


  const newUploadedImages: { url: string; publicId: string }[] = [];

  try {
    // Handle image deletions
    if (imagesToDeletePublicIds && imagesToDeletePublicIds.length > 0) {
      for (const publicId of imagesToDeletePublicIds) {
        await deleteImageFromCloudinary(publicId);
      }
      finalUpdateOps.$pull = { images: { publicId: { $in: imagesToDeletePublicIds } } };
    }

    // Handle new image uploads
    const files = formData.getAll('images') as File[]; // Get all files associated with 'images' key
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.size > 0) {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          newUploadedImages.push(result);
        }
      }
      if (newUploadedImages.length > 0) {
        finalUpdateOps.$push = { ...finalUpdateOps.$push, images: { $each: newUploadedImages } };
      }
    }
    
    // Handle price change history
    if (updateDataFromZod.price !== undefined && updateDataFromZod.price !== existingProduct.price) {
      const priceHistoryEntry = PriceHistoryEntrySchema.parse({
        price: updateDataFromZod.price,
        changedAt: new Date(),
        changedBy: changedByUserId, 
      });
      if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
      finalUpdateOps.$push.priceHistory = priceHistoryEntry;
    }
    
    if (Object.keys(finalUpdateOps.$set).length === 1 && finalUpdateOps.$set.updatedAt && !finalUpdateOps.$pull && !finalUpdateOps.$push) {
        if (newUploadedImages.length === 0 && (!imagesToDeletePublicIds || imagesToDeletePublicIds.length === 0)) {
             // No actual data change, only timestamp, and no image operations
             const currentProduct = await getProductById(productId); // Fetch potentially unchanged product
             return { success: true, product: currentProduct || existingProduct };
        }
    }

    const result = await db.collection<Product>(PRODUCTS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(productId) },
      finalUpdateOps,
      { returnDocument: 'after' }
    );

    if (!result) {
      for (const img of newUploadedImages) { await deleteImageFromCloudinary(img.publicId); }
      return { success: false, error: 'Failed to update product in database or product not found.' };
    }
    
    const updatedProduct = ProductSchema.parse({
      ...result,
       _id: result._id.toString() // Ensure _id is string for the type
    }) as Product;

    revalidatePath('/products');
    revalidatePath(`/products/${productId}`); 
    revalidatePath('/dashboard');
    return { success: true, product: updatedProduct };

  } catch (error: any) {
    console.error('Failed to update product:', error);
    for (const img of newUploadedImages) {
        try { await deleteImageFromCloudinary(img.publicId); } catch (deleteError) { console.error('Failed to delete newly uploaded image after update error:', deleteError); }
    }
    if (error instanceof z.ZodError) {
        return { success: false, error: "Data validation error during product update.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while updating the product.' };
  }
}

