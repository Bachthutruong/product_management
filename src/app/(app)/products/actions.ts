
'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductImageSchema, PriceHistoryEntrySchema, ProductFormInputSchema as ProductFormInputSchemaValidation } from '@/models/Product';
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

export async function getProducts(filters: { 
  category?: string; 
  searchTerm?: string; 
  stockStatus?: 'low' | 'inStock' | 'outOfStock' | 'all';
  page?: number;
  limit?: number;
} = {}): Promise<{ products: Product[]; totalCount: number; totalPages: number; currentPage: number }> {
  try {
    const db = await getDb();
    const query: any = {};
    const { 
      category, 
      searchTerm, 
      stockStatus,
      page = 1,
      limit = 10, // Default items per page
    } = filters;

    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }
    if (searchTerm) {
      const regex = { $regex: searchTerm, $options: 'i' };
      query.$or = [
        { name: regex },
        { sku: regex },
        { description: regex },
      ];
    }
    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'low') {
        query.$expr = { $lt: [ "$stock", "$lowStockThreshold" ] };
        query.stock = { $gt: 0 }; // Ensure low stock means stock is > 0 but below threshold
      } else if (stockStatus === 'inStock') {
        query.stock = { $gt: 0 };
      } else if (stockStatus === 'outOfStock') {
        query.stock = { $lte: 0 };
      }
    }

    const skip = (page - 1) * limit;
    const totalCount = await db.collection(PRODUCTS_COLLECTION).countDocuments(query);
    
    const productsFromDb = await db.collection(PRODUCTS_COLLECTION)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    const parsedProducts = productsFromDb.map(productDoc => {
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
    });

    return {
      products: parsedProducts,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };

  } catch (error) {
    console.error('Failed to fetch products:', error);
    return { products: [], totalCount: 0, totalPages: 0, currentPage: 1 };
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

const AddProductServerSchema = ProductFormInputSchemaValidation.extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0, "Price must be a positive number"),
  cost: z.coerce.number().min(0, "Cost must be non-negative").optional().default(0),
  stock: z.coerce.number().int("Stock must be an integer").min(0, "Stock must be non-negative"),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.coerce.date().optional().nullable(),
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {
  
  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key !== 'images') { 
        if ((key === 'sku' || key === 'category' || key === 'unitOfMeasure' || key === 'description') && value === '') {
            rawFormData[key] = undefined; // Let Zod .optional() handle it
        } else if ((key === 'cost' || key === 'lowStockThreshold') && value === '') {
            rawFormData[key] = undefined; // Will be handled by .default(0) in Zod
        } else if (key === 'expiryDate' && value === '') {
            rawFormData[key] = undefined; // Will be handled by .nullable() in Zod
        }
         else {
            rawFormData[key] = value;
        }
    }
  });
  
  const changedByUserIdFromForm = formData.get('changedByUserId');
  if (!changedByUserIdFromForm) { 
     return { success: false, error: "changedByUserId is missing from form data." };
  }
  rawFormData.changedByUserId = changedByUserIdFromForm;
  
  const validation = AddProductServerSchema.safeParse(rawFormData);

  if (!validation.success) {
    console.log("Add Product - Server Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed on server", errors: validation.error.errors };
  }

  const { changedByUserId, ...validatedData } = validation.data;
  const uploadedImages: ProductImage[] = [];

  try {
    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file instanceof File && file.size > 0) { 
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          uploadedImages.push(ProductImageSchema.parse(result)); 
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
    
    const productForReturn = {
      ...newProductDataForDb,
      _id: result.insertedId.toString(),
    };

    try {
      const parsedProduct = ProductSchema.parse(productForReturn);
      revalidatePath('/products');
      revalidatePath('/dashboard');
      return { success: true, product: parsedProduct as Product };
    } catch (parseError: any) {
      console.error('Critical Error: Product inserted into DB, but failed to parse for return. Data structure mismatch with ProductSchema.', parseError);
      console.error('Data that failed parsing:', productForReturn);
      revalidatePath('/products');
      revalidatePath('/dashboard');
      return { success: true, error: "Product added, but there was an issue preparing its data for immediate display. Please refresh to see the new product." };
    }

  } catch (error: any) {
    console.error('Failed to add product:', error);
    for (const img of uploadedImages) { 
        try { await deleteImageFromCloudinary(img.publicId); } catch (deleteError) { console.error('Failed to delete uploaded image after error:', deleteError); }
    }
    if (error instanceof z.ZodError) { 
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
    const productToDeleteDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(id) });

    if (!productToDeleteDoc) { return { success: false, error: 'Product not found.' }; }
    
    const productToDelete = ProductSchema.parse({...productToDeleteDoc, _id: productToDeleteDoc._id.toString()}) as Product;

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
  const productDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) }, { session });

  if (!productDoc) {
    return { success: false, error: 'Product not found for stock update.' };
  }
  const product = ProductSchema.parse({...productDoc, _id: productDoc._id.toString()}) as Product;

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

  return { success: true };
}


const UpdateProductServerSchema = ProductFormInputSchemaValidation.extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0).optional(),
  cost: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  expiryDate: z.coerce.date().optional().nullable(),
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
  const existingProduct = ProductSchema.parse({ ...existingProductDoc, _id: existingProductDoc._id.toString()}) as Product;


  const rawFormData: Record<string, any> = { changedByUserId: currentUser._id };
  const imagesToDeletePublicIds: string[] = [];
  
  formData.forEach((value, key) => {
    if (key.startsWith('imagesToDelete[')) { 
      imagesToDeletePublicIds.push(value as string);
    } else if (key === 'images') {
      // New files handled separately below
    } else if (key === 'changedByUserId') {
      // Already set above
    }
    else {
        if ((key === 'sku' || key === 'category' || key === 'unitOfMeasure' || key === 'description' || key === 'cost' || key === 'lowStockThreshold' || key === 'expiryDate') && value === '') {
            rawFormData[key] = undefined;
        } else {
            rawFormData[key] = value;
        }
    }
  });
  
  const validation = UpdateProductServerSchema.safeParse(rawFormData);
  if (!validation.success) {
    console.log("Update Product - Server Validation errors:", validation.error.flatten().fieldErrors);
    return { success: false, error: "Validation failed during update.", errors: validation.error.errors };
  }

  const { changedByUserId, ...updateDataFromZod } = validation.data; 
  
  const finalUpdateOps: { $set: Partial<Omit<Product, '_id' | 'createdAt' | 'images' | 'priceHistory'>>, $push?: any, $pull?: any } = { $set: {} };
  let hasMeaningfulChanges = false;
  
  for (const key in updateDataFromZod) {
    if (Object.prototype.hasOwnProperty.call(updateDataFromZod, key)) {
        const typedKey = key as keyof typeof updateDataFromZod;
        let newValue = updateDataFromZod[typedKey];
        const oldValue = (existingProduct as any)[typedKey];

        if (typedKey === 'expiryDate') {
            if (newValue === null && oldValue !== null) { 
                 (finalUpdateOps.$set as any)[typedKey] = null;
                 hasMeaningfulChanges = true;
            } else if (newValue instanceof Date && (!oldValue || new Date(newValue).toISOString() !== new Date(oldValue).toISOString())) {
                (finalUpdateOps.$set as any)[typedKey] = new Date(newValue);
                hasMeaningfulChanges = true;
            }
        } else if (newValue !== undefined && newValue !== oldValue) {
            (finalUpdateOps.$set as any)[typedKey] = newValue;
            hasMeaningfulChanges = true;
        }
    }
  }
  
  const newUploadedImages: ProductImage[] = [];

  try {
    if (imagesToDeletePublicIds && imagesToDeletePublicIds.length > 0) {
      for (const publicId of imagesToDeletePublicIds) {
        await deleteImageFromCloudinary(publicId);
      }
      finalUpdateOps.$pull = { images: { publicId: { $in: imagesToDeletePublicIds } } };
      hasMeaningfulChanges = true;
    }

    const files = formData.getAll('images') as File[]; 
    if (files && files.length > 0) {
        for (const file of files) {
            if (file instanceof File && file.size > 0) { 
              const arrayBuffer = await file.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
              newUploadedImages.push(ProductImageSchema.parse(result));
            }
        }
      if (newUploadedImages.length > 0) {
        if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
        finalUpdateOps.$push.images = { $each: newUploadedImages };
        hasMeaningfulChanges = true;
      }
    }
    
    if (finalUpdateOps.$set.price !== undefined && finalUpdateOps.$set.price !== existingProduct.price) {
      const priceHistoryEntry = PriceHistoryEntrySchema.parse({
        price: finalUpdateOps.$set.price,
        changedAt: new Date(),
        changedBy: changedByUserId!, 
      });
      if (!finalUpdateOps.$push) finalUpdateOps.$push = {};
      
      if (finalUpdateOps.$push && finalUpdateOps.$push.images) {
          finalUpdateOps.$push.priceHistory = priceHistoryEntry;
      } else {
          finalUpdateOps.$push = { ...finalUpdateOps.$push, priceHistory: priceHistoryEntry };
      }
      hasMeaningfulChanges = true; 
    }
    
    if (!hasMeaningfulChanges && Object.keys(finalUpdateOps.$set).length === 0 && !finalUpdateOps.$pull && !(finalUpdateOps.$push && (finalUpdateOps.$push.images || finalUpdateOps.$push.priceHistory))) {
        return { success: true, product: existingProduct, error: "No changes detected." };
    }
    
    finalUpdateOps.$set.updatedAt = new Date();

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
        return { success: false, error: "Data validation error during product update internal processing.", errors: error.errors };
    }
    return { success: false, error: error.message || 'An unexpected error occurred while updating the product.' };
  }
}
    
