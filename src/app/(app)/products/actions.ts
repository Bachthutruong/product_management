
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

const AddProductFormDataSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key === 'price' || key === 'cost' || key === 'stock' || key === 'lowStockThreshold') {
      const strValue = value as string;
      // Ensure empty strings or invalid numbers become undefined for Zod to handle defaults or coerce
      const numValue = strValue.trim() === '' ? undefined : parseFloat(strValue);
      rawFormData[key] = isNaN(numValue!) ? undefined : numValue;
    } else if (key === 'expiryDate') {
      rawFormData[key] = value && (value as string).trim() !== '' ? new Date(value as string) : null;
    } else if (key === 'images') {
      // Image files are handled separately by iterating formData.getAll('images')
    } else {
      rawFormData[key] = value;
    }
  });
  
  if (!formData.has('changedByUserId')) {
     return { success: false, error: "changedByUserId is missing from form data." };
  }
  rawFormData['changedByUserId'] = formData.get('changedByUserId');
  
  const { images: imageFilesFromRawData, ...productDataFields } = rawFormData;

  const validation = AddProductFormDataSchema.safeParse(productDataFields);

  if (!validation.success) {
    console.log("Add Product - Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed", errors: validation.error.errors };
  }

  const { changedByUserId, ...validatedData } = validation.data;
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
      price: validatedData.price,
      changedAt: new Date(),
      changedBy: changedByUserId,
    });

    const newProductDataForDb = {
      ...validatedData, 
      sku: validatedData.sku || '', 
      category: validatedData.category || '',
      unitOfMeasure: validatedData.unitOfMeasure || '',
      description: validatedData.description || '',
      images: uploadedImages,
      priceHistory: [initialPriceHistoryEntry],
      expiryDate: validatedData.expiryDate ? new Date(validatedData.expiryDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await db.collection(PRODUCTS_COLLECTION).insertOne(newProductDataForDb);

    if (!result.insertedId) {
      for (const img of uploadedImages) { await deleteImageFromCloudinary(img.publicId); }
      return { success: false, error: 'Failed to insert product into database.' };
    }
    
    // Re-fetch the product to ensure consistency
    const insertedProduct = await getProductById(result.insertedId.toString());
    if (!insertedProduct) {
      // This case should be rare if insertion succeeded
      return { success: false, error: 'Product added but failed to retrieve from database.' };
    }


    revalidatePath('/products');
    revalidatePath('/dashboard');
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

export async function updateProductStock(
  productId: string, 
  quantityChange: number, 
  session?: any 
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
}).partial();


export async function updateProduct(
  productId: string,
  formData: FormData,
  currentUser: AuthUser 
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  if (!ObjectId.isValid(productId)) {
    return { success: false, error: 'Invalid product ID.' };
  }

  const db = await getDb();
  const existingProductDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) });
  if (!existingProductDoc) {
    return { success: false, error: 'Product not found.' };
  }
  // Parse existing product to ensure we're comparing against a typed object
  const existingProduct = ProductSchema.parse({ ...existingProductDoc, _id: existingProductDoc._id.toString()}) as Product;


  const rawFormData: Record<string, any> = { changedByUserId: currentUser._id };
  const imagesToDeletePublicIds: string[] = [];

  formData.forEach((value, key) => {
    if (key.startsWith('imagesToDelete[')) { 
      imagesToDeletePublicIds.push(value as string);
    } else if (key === 'price' || key === 'stock' || key === 'lowStockThreshold' || key === 'cost') {
      const strValue = value as string;
      const numValue = strValue.trim() === '' ? undefined : parseFloat(strValue);
      rawFormData[key] = isNaN(numValue!) ? undefined : numValue; 
    } else if (key === 'expiryDate') {
      rawFormData[key] = value && (value as string).trim() !== '' ? new Date(value as string) : null;
    } else if (key === 'images') {
      // New images are handled by iterating formData.getAll('images')
    } else {
      rawFormData[key] = value;
    }
  });
  
  if (!rawFormData.changedByUserId && currentUser?._id) {
    rawFormData.changedByUserId = currentUser._id;
  }
  
  const { images: newImageFilesFromRaw, ...productDataFields } = rawFormData; 

  const validation = UpdateProductFormDataSchema.safeParse(productDataFields);
  if (!validation.success) {
    console.log("Update validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed during update.", errors: validation.error.errors };
  }

  const { changedByUserId, ...updateDataFromZod } = validation.data; 
  
  const finalUpdateOps: { $set: Partial<Product>, $push?: any, $pull?: any } = { $set: {} };
  let hasMeaningfulChanges = false;
  
  for (const key in updateDataFromZod) {
    const typedKey = key as keyof typeof updateDataFromZod;
    if (updateDataFromZod[typedKey] !== undefined && updateDataFromZod[typedKey] !== (existingProduct as any)[typedKey]) {
      (finalUpdateOps.$set as any)[typedKey] = updateDataFromZod[typedKey];
      hasMeaningfulChanges = true;
    } else if (updateDataFromZod[typedKey] === null && (existingProduct as any)[typedKey] !== null) {
      // Handle case where a field is explicitly set to null (e.g. expiryDate)
       (finalUpdateOps.$set as any)[typedKey] = null;
       hasMeaningfulChanges = true;
    }
  }
  

  const newUploadedImages: { url: string; publicId: string }[] = [];

  try {
    // Handle image deletions
    if (imagesToDeletePublicIds && imagesToDeletePublicIds.length > 0) {
      for (const publicId of imagesToDeletePublicIds) {
        await deleteImageFromCloudinary(publicId);
      }
      finalUpdateOps.$pull = { images: { publicId: { $in: imagesToDeletePublicIds } } };
      hasMeaningfulChanges = true;
    }

    // Handle new image uploads
    const files = formData.getAll('images') as File[]; 
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
        hasMeaningfulChanges = true;
      }
    }
    
    if (updateDataFromZod.price !== undefined && updateDataFromZod.price !== existingProduct.price) {
      const priceHistoryEntry = PriceHistoryEntrySchema.parse({
        price: updateDataFromZod.price,
        changedAt: new Date(),
        changedBy: changedByUserId!, 
      });
      if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
      finalUpdateOps.$push.priceHistory = priceHistoryEntry;
      // Price change itself is already a meaningful change
    }
    
    if (!hasMeaningfulChanges && Object.keys(finalUpdateOps.$set).length === 0 && !finalUpdateOps.$pull && !finalUpdateOps.$push) {
        // No actual data change detected, only potentially timestamp if that was the only thing
        // However, if only image operations occurred, $set might be empty.
        // Return current product if truly no changes, or if only updatedAt was to be set.
        const currentProduct = await getProductById(productId);
        return { success: true, product: currentProduct || existingProduct };
    }
    
    // Always set updatedAt if there are any changes.
    if (hasMeaningfulChanges || finalUpdateOps.$pull || finalUpdateOps.$push || Object.keys(finalUpdateOps.$set).length > 0) {
        finalUpdateOps.$set.updatedAt = new Date();
    }


    const updateResult = await db.collection<Product>(PRODUCTS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(productId) },
      finalUpdateOps,
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      for (const img of newUploadedImages) { await deleteImageFromCloudinary(img.publicId); }
      return { success: false, error: 'Failed to update product in database or product not found.' };
    }
    
    const updatedProduct = ProductSchema.parse({
      ...updateResult,
       _id: updateResult._id.toString() 
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
