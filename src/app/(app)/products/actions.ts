
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductFormInputSchema, PriceHistoryEntrySchema, ProductImageSchema } from '@/models/Product';
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

const AddProductServerSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional().default(0),
  stock: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.coerce.date().optional().nullable(),
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    // Don't process 'images' here, handle files separately
    if (key !== 'images') {
        rawFormData[key] = value;
    }
  });
  
  if (!formData.has('changedByUserId')) {
     return { success: false, error: "changedByUserId is missing from form data." };
  }
  // changedByUserId is already in rawFormData
  
  const validation = AddProductServerSchema.safeParse(rawFormData);

  if (!validation.success) {
    console.log("Add Product - Server Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed on server", errors: validation.error.errors };
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
      images: uploadedImages, // Save all uploaded images
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
    
    // Re-fetch the product to ensure consistency and correct parsing of all fields, including images
    const insertedProduct = await getProductById(result.insertedId.toString());
    if (!insertedProduct) {
      // This case should be rare if insertion succeeded
      for (const img of uploadedImages) { await deleteImageFromCloudinary(img.publicId); } // Clean up uploaded images
      return { success: false, error: 'Product added but failed to retrieve from database.' };
    }

    revalidatePath('/products');
    revalidatePath('/dashboard');
    return { success: true, product: insertedProduct };
  } catch (error: any) {
    console.error('Failed to add product:', error);
    for (const img of uploadedImages) { // Attempt to clean up any uploaded images on error
        try { await deleteImageFromCloudinary(img.publicId); } catch (deleteError) { console.error('Failed to delete uploaded image after error:', deleteError); }
    }
    if (error instanceof z.ZodError) { // This can happen if Zod parsing within the try block fails
        return { success: false, error: "Data validation error after processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while adding the product.' };
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
    // This can happen if the stock was already the target value, which is fine.
    // console.warn(`Product ${productId} stock was matched but not modified. Current stock might already be ${newStock}.`);
  }

  return { success: true };
}


const UpdateProductServerSchema = ProductFormInputSchema.extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  expiryDate: z.coerce.date().optional().nullable(),
}).partial(); // .partial() allows any field to be optional


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
  const existingProduct = ProductSchema.parse({ ...existingProductDoc, _id: existingProductDoc._id.toString()}) as Product;


  const rawFormData: Record<string, any> = { changedByUserId: currentUser._id };
  const imagesToDeletePublicIds: string[] = [];
  let hasNewImages = false;

  formData.forEach((value, key) => {
    if (key.startsWith('imagesToDelete[')) { 
      imagesToDeletePublicIds.push(value as string);
    } else if (key === 'images') {
      // Check if the 'images' field actually contains a File object.
      // FormData can have multiple 'images' entries if multiple files were selected.
      // We just need to know if *any* new files were added.
      if (value instanceof File && value.size > 0) {
        hasNewImages = true;
      }
      // Don't add File objects to rawFormData for Zod parsing
    } else {
      rawFormData[key] = value;
    }
  });
  
  // Ensure changedByUserId is set, even if not explicitly in Zod schema for client-side form
  if (!rawFormData.changedByUserId && currentUser?._id) {
    rawFormData.changedByUserId = currentUser._id;
  }
  
  const validation = UpdateProductServerSchema.safeParse(rawFormData);
  if (!validation.success) {
    console.log("Update Product - Server Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed during update.", errors: validation.error.errors };
  }

  const { changedByUserId, ...updateDataFromZod } = validation.data; 
  
  const finalUpdateOps: { $set: Partial<Product>, $push?: any, $pull?: any } = { $set: {} };
  let hasMeaningfulChanges = false;
  
  for (const key in updateDataFromZod) {
    const typedKey = key as keyof typeof updateDataFromZod;
    const newValue = updateDataFromZod[typedKey];
    const oldValue = (existingProduct as any)[typedKey];

    // Special handling for dates to compare properly
    if (typedKey === 'expiryDate') {
        const newDate = newValue ? new Date(newValue).toISOString() : null;
        const oldDate = oldValue ? new Date(oldValue).toISOString() : null;
        if (newDate !== oldDate) {
            (finalUpdateOps.$set as any)[typedKey] = newValue ? new Date(newValue) : null;
            hasMeaningfulChanges = true;
        }
    } else if (newValue !== undefined && newValue !== oldValue) {
      (finalUpdateOps.$set as any)[typedKey] = newValue;
      hasMeaningfulChanges = true;
    }
  }
  

  const newUploadedImages: ProductImage[] = [];

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
            // Ensure we only process actual files, not empty strings or other placeholders
            if (file instanceof File && file.size > 0) { 
              const arrayBuffer = await file.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
              newUploadedImages.push(ProductImageSchema.parse(result)); // Parse to ensure correct type
            }
        }
      if (newUploadedImages.length > 0) {
        if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
        finalUpdateOps.$push.images = { $each: newUploadedImages };
        hasMeaningfulChanges = true;
      }
    }
    
    if (updateDataFromZod.price !== undefined && updateDataFromZod.price !== existingProduct.price) {
      const priceHistoryEntry = PriceHistoryEntrySchema.parse({
        price: updateDataFromZod.price, // price is now definitely a number
        changedAt: new Date(),
        changedBy: changedByUserId!, 
      });
      if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
      // Ensure priceHistory isn't pushed multiple times if other $push ops exist
      if (finalUpdateOps.$push.images) {
          finalUpdateOps.$push.priceHistory = priceHistoryEntry;
      } else {
          finalUpdateOps.$push.priceHistory = { $each: [priceHistoryEntry] };
      }
      // Price change itself is already a meaningful change
    }
    
    if (!hasMeaningfulChanges && Object.keys(finalUpdateOps.$set).length === 0 && !finalUpdateOps.$pull && !finalUpdateOps.$push && !hasNewImages) {
        const currentProduct = await getProductById(productId); // Re-fetch to be sure
        return { success: true, product: currentProduct || existingProduct, error: "No changes detected." };
    }
    
    if (Object.keys(finalUpdateOps.$set).length > 0 || finalUpdateOps.$pull || finalUpdateOps.$push) {
        finalUpdateOps.$set.updatedAt = new Date();
    } else if (hasNewImages) { // If only new images were added but no other $set ops
        finalUpdateOps.$set.updatedAt = new Date();
    } else { // No meaningful textual changes, no image changes
        const currentProduct = await getProductById(productId);
        return { success: true, product: currentProduct || existingProduct, error: "No changes detected." };
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
    revalidatePath(`/products/${productId}`); // Assuming a detail page might exist later
    revalidatePath('/dashboard');
    return { success: true, product: updatedProduct };

  } catch (error: any) {
    console.error('Failed to update product:', error);
    for (const img of newUploadedImages) { // Attempt to clean up any uploaded images on error
        try { await deleteImageFromCloudinary(img.publicId); } catch (deleteError) { console.error('Failed to delete newly uploaded image after update error:', deleteError); }
    }
    if (error instanceof z.ZodError) { // This can happen from ProductImageSchema.parse or PriceHistoryEntrySchema.parse
        return { success: false, error: "Data validation error during product update internal processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while updating the product.' };
  }
}

    