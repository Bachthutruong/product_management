'use server';

import { revalidatePath } from 'next/cache';
import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product, type ProductFormInput, ProductImageSchema, type ProductImage, PriceHistoryEntrySchema, ProductFormInputSchema as ProductFormInputSchemaValidation } from '@/models/Product';
import type { UserRole, AuthUser } from '@/models/User';
import { uploadImageToCloudinary, deleteImageFromCloudinary } from '@/lib/cloudinary';
import { ObjectId, WithId, Document } from 'mongodb';
import { z } from 'zod';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const CLOUDINARY_PRODUCT_IMAGE_FOLDER = process.env.CLOUDINARY_FOLDER || 'stockpilot_products';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getProducts(filters: {
  categoryId?: string;
  searchTerm?: string;
  stockStatus?: 'low' | 'inStock' | 'outOfStock' | 'all';
  page?: number;
  limit?: number;
} = {}): Promise<{ products: Product[]; totalCount: number; totalPages: number; currentPage: number }> {
  try {
    const db = await getDb();
    const query: any = {};
    const {
      categoryId,
      searchTerm,
      stockStatus,
      page = 1,
      limit = 10, // Default items per page
    } = filters;

    if (categoryId) {
      query.categoryId = categoryId;
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
        query.$expr = { $lt: ["$stock", "$lowStockThreshold"] };
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
      // Handle legacy products that might have null expiryDate
      const expiryDate = productDoc.expiryDate 
        ? new Date(productDoc.expiryDate) 
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

      // Clean up batches data to handle null values
      const cleanedBatches = (productDoc.batches || []).map((batch: any) => ({
        ...batch,
        supplier: batch.supplier || undefined, // Convert null to undefined
        notes: batch.notes || undefined, // Convert null to undefined
        expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
        createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
      }));

      return ProductSchema.parse({
        ...productDoc,
        _id: productDoc._id.toString(),
        images: productDoc.images || [],
        priceHistory: productDoc.priceHistory || [],
        batches: cleanedBatches,
        expiryDate: expiryDate,
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

    // Handle legacy products that might have null expiryDate
    const expiryDate = productDoc.expiryDate 
      ? new Date(productDoc.expiryDate) 
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

    // Clean up batches data to handle null values
    const cleanedBatches = (productDoc.batches || []).map((batch: any) => ({
      ...batch,
      supplier: batch.supplier || undefined, // Convert null to undefined
      notes: batch.notes || undefined, // Convert null to undefined
      expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
      createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
    }));

    return ProductSchema.parse({
      ...productDoc,
      _id: productDoc._id.toString(),
      images: productDoc.images || [],
      priceHistory: productDoc.priceHistory || [],
      batches: cleanedBatches,
      expiryDate: expiryDate,
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

const AddProductServerSchema = ProductFormInputSchemaValidation.omit({ expiryDate: true }).extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0, "Price must be a positive number"),
  cost: z.coerce.number().min(0, "Cost must be non-negative").optional().default(0),
  stock: z.coerce.number().int("Stock must be an integer").min(0, "Stock must be non-negative"),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.coerce.date({ message: "Expiry date is required" }),
});


export async function addProduct(
  formData: FormData
): Promise<{ success: boolean; product?: Product; error?: string; errors?: z.ZodIssue[] }> {

  const rawFormData: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (key !== 'images') {
      if ((key === 'sku' || key === 'unitOfMeasure' || key === 'description' || key === 'categoryId' || key === 'categoryName') && value === '') {
        rawFormData[key] = undefined;
      } else if ((key === 'cost' || key === 'lowStockThreshold') && value === '') {
        rawFormData[key] = undefined; // Will be default(0)
      } else if (key === 'expiryDate' && value === '') {
        rawFormData[key] = undefined; // Will be nullable()
      } else if (key === 'category') {
        // ignore old category field if present
      } else {
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
    console.log("Raw form data submitted to addProduct server action:", rawFormData);
    return { success: false, error: "Validation failed on server", errors: validation.error.errors };
  }

  const { changedByUserId, ...validatedData } = validation.data;
  const uploadedImages: ProductImage[] = [];

  try {
    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} files for upload.`);
      for (const file of files) {
        if (file && typeof file === 'object' && 'size' in file && 'arrayBuffer' in file && file.size > 0) {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const cloudinaryUploadResult = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);

          console.log("Cloudinary upload result:", cloudinaryUploadResult);

          try {
            // Linter suggests cloudinaryUploadResult is already { url: string; publicId: string; }
            // Assuming ProductImageSchema expects { publicId: string, url: string }
            // If ProductImageSchema definition is different, this parse will fail.
            const parsedImage = ProductImageSchema.parse(cloudinaryUploadResult);
            console.log("Parsed image for uploadedImages:", parsedImage);
            uploadedImages.push(parsedImage);
          } catch (imageParseError) {
            console.error("Failed to parse image data from Cloudinary response:", imageParseError);
            console.error("Original Cloudinary data that failed parsing:", cloudinaryUploadResult);
          }
        } else {
          console.log("Skipping file as it's not a valid File object or is empty:", file);
        }
      }
    }

    console.log("Final uploadedImages array before DB save:", uploadedImages); // Log before saving

    const db = await getDb();

    const initialPriceHistoryEntry = PriceHistoryEntrySchema.parse({
      price: validatedData.price,
      changedAt: new Date(),
      changedBy: changedByUserId,
    });

    // Create initial batch if stock > 0
    const initialBatches = [];
    if (validatedData.stock > 0) {
      const initialBatch = {
        batchId: `BATCH-${Date.now()}`, // Generate unique batch ID
        expiryDate: new Date(validatedData.expiryDate), // Required expiry date
        initialQuantity: validatedData.stock,
        remainingQuantity: validatedData.stock,
        costPerUnit: validatedData.cost || 0,
        createdAt: new Date(),
        supplier: undefined,
        notes: 'Initial stock entry',
      };
      initialBatches.push(initialBatch);
    }

    const newProductDataForDb = {
      ...validatedData,
      images: uploadedImages,
      priceHistory: [initialPriceHistoryEntry],
      batches: initialBatches, // Add initial batch
      expiryDate: new Date(validatedData.expiryDate), // Ensure it's a Date object
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

    const productToDelete = ProductSchema.parse({ ...productToDeleteDoc, _id: productToDeleteDoc._id.toString() }) as Product;

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
): Promise<{ success: boolean, error?: string }> {
  if (!ObjectId.isValid(productId)) {
    return { success: false, error: 'Invalid product ID.' };
  }
  const db = await getDb();
  const productDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) }, { session });

  if (!productDoc) {
    return { success: false, error: 'Product not found for stock update.' };
  }
  const product = ProductSchema.parse({ ...productDoc, _id: productDoc._id.toString() }) as Product;

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

export async function updateProductStockWithBatches(
  productId: string,
  quantityToReduce: number,
  session?: any
): Promise<{ success: boolean; error?: string; usedBatches?: Array<{ batchId: string; expiryDate: Date; quantityUsed: number }> }> {
  if (!ObjectId.isValid(productId)) {
    return { success: false, error: 'Invalid product ID.' };
  }
  
  const db = await getDb();
  const productDoc = await db.collection(PRODUCTS_COLLECTION).findOne({ _id: new ObjectId(productId) }, { session });

  if (!productDoc) {
    return { success: false, error: 'Product not found for stock update.' };
  }

  // Clean up batches data to handle null values
  const cleanedBatches = (productDoc.batches || []).map((batch: any) => ({
    ...batch,
    supplier: batch.supplier || undefined, // Convert null to undefined
    notes: batch.notes || undefined, // Convert null to undefined
    expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
    createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
  }));

  const product = ProductSchema.parse({ 
    ...productDoc, 
    _id: productDoc._id.toString(),
    batches: cleanedBatches,
    images: productDoc.images || [],
    priceHistory: productDoc.priceHistory || [],
    expiryDate: productDoc.expiryDate ? new Date(productDoc.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: productDoc.createdAt ? new Date(productDoc.createdAt) : undefined,
    updatedAt: productDoc.updatedAt ? new Date(productDoc.updatedAt) : undefined,
    lowStockThreshold: productDoc.lowStockThreshold ?? 0,
    cost: productDoc.cost ?? 0,
  }) as Product;

  // Check if we have enough total stock
  const totalAvailableStock = product.batches?.reduce((sum, batch) => sum + batch.remainingQuantity, 0) || 0;
  if (totalAvailableStock < quantityToReduce) {
    return { 
      success: false, 
      error: `Insufficient stock. Available: ${totalAvailableStock}, Requested: ${quantityToReduce}` 
    };
  }

  // Sort batches by expiry date (FIFO - First to expire, first out)
  const sortedBatches = [...(product.batches || [])].sort((a, b) => 
    new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  );

  const usedBatches: Array<{ batchId: string; expiryDate: Date; quantityUsed: number }> = [];
  let remainingToReduce = quantityToReduce;
  const updatedBatches = [...sortedBatches];

  // Reduce stock from batches using FIFO
  for (let i = 0; i < updatedBatches.length && remainingToReduce > 0; i++) {
    const batch = updatedBatches[i];
    if (batch.remainingQuantity > 0) {
      const quantityFromThisBatch = Math.min(batch.remainingQuantity, remainingToReduce);
      
      usedBatches.push({
        batchId: batch.batchId,
        expiryDate: batch.expiryDate,
        quantityUsed: quantityFromThisBatch
      });

      batch.remainingQuantity -= quantityFromThisBatch;
      remainingToReduce -= quantityFromThisBatch;
    }
  }

  // Update the product with new batch quantities and total stock
  const newTotalStock = product.stock - quantityToReduce;
  
  const result = await db.collection(PRODUCTS_COLLECTION).updateOne(
    { _id: new ObjectId(productId) },
    { 
      $set: { 
        stock: newTotalStock, 
        batches: updatedBatches,
        updatedAt: new Date() 
      } 
    },
    { session }
  );

  if (result.modifiedCount === 0) {
    return { success: false, error: 'Failed to update product stock.' };
  }

  return { success: true, usedBatches };
}

const UpdateProductServerSchema = ProductFormInputSchemaValidation.omit({ expiryDate: true }).extend({
  changedByUserId: z.string().min(1),
  price: z.coerce.number().min(0, "Price must be a positive number"),
  cost: z.coerce.number().min(0, "Cost must be non-negative").optional().default(0),
  stock: z.coerce.number().int("Stock must be an integer").min(0, "Stock must be non-negative"),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  expiryDate: z.coerce.date({ message: "Expiry date is required" }),
  imagesToDelete: z.array(z.string()).optional(), // Array of public_ids for images to delete
});


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
  
  // Handle legacy products that might have null expiryDate
  const expiryDate = existingProductDoc.expiryDate 
    ? new Date(existingProductDoc.expiryDate) 
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

  // Clean up batches data to handle null values
  const cleanedBatches = (existingProductDoc.batches || []).map((batch: any) => ({
    ...batch,
    supplier: batch.supplier || undefined, // Convert null to undefined
    notes: batch.notes || undefined, // Convert null to undefined
    expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
    createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
  }));

  const existingProduct = ProductSchema.parse({ 
    ...existingProductDoc, 
    _id: existingProductDoc._id.toString(),
    images: existingProductDoc.images || [],
    priceHistory: existingProductDoc.priceHistory || [],
    batches: cleanedBatches,
    expiryDate: expiryDate,
    createdAt: existingProductDoc.createdAt ? new Date(existingProductDoc.createdAt) : undefined,
    updatedAt: existingProductDoc.updatedAt ? new Date(existingProductDoc.updatedAt) : undefined,
    lowStockThreshold: existingProductDoc.lowStockThreshold ?? 0,
    cost: existingProductDoc.cost ?? 0,
  }) as Product;


  const rawFormData: Record<string, any> = { changedByUserId: currentUser._id };
  const imagesToDeletePublicIds: string[] = [];

  formData.forEach((value, key) => {
    if (key === 'imagesToDelete[]') {
      imagesToDeletePublicIds.push(value as string);
    } else if (key !== 'images' && key !== 'changedByUserId') {
      if ((key === 'sku' || key === 'unitOfMeasure' || key === 'description' || key === 'categoryId' || key === 'categoryName') && value === '') {
        rawFormData[key] = undefined;
      } else if ((key === 'cost' || key === 'lowStockThreshold') && value === '') {
        rawFormData[key] = undefined;
      } else if (key === 'expiryDate' && value === '') {
        rawFormData[key] = undefined;
      } else if (key === 'category') {
        // ignore old category field
      } else {
        rawFormData[key] = value;
      }
    }
  });
  if (imagesToDeletePublicIds.length > 0) {
    rawFormData.imagesToDelete = imagesToDeletePublicIds;
  }

  const validation = UpdateProductServerSchema.safeParse(rawFormData);

  if (!validation.success) {
    console.log("Update Product - Server Validation errors:", validation.error.flatten().fieldErrors);
    console.log("Raw form data submitted to updateProduct server action:", rawFormData);
    return { success: false, error: "Validation failed on server for update", errors: validation.error.errors };
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
        try {
          await deleteImageFromCloudinary(publicId);
        } catch (deleteError) {
          console.error(`Failed to delete image ${publicId} from Cloudinary during update:`, deleteError);
        }
      }
      finalUpdateOps.$pull = { images: { publicId: { $in: imagesToDeletePublicIds } } };
      hasMeaningfulChanges = true;
    }

    const files = formData.getAll('images') as File[];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file && typeof file === 'object' && 'size' in file && 'arrayBuffer' in file && file.size > 0) {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const result = await uploadImageToCloudinary(buffer, CLOUDINARY_PRODUCT_IMAGE_FOLDER);
          // Assuming ProductImageSchema expects { publicId: string, url: string }
          // And cloudinaryUploadResult (named `result` here) has that shape.
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

    // Use a type for what's in the DB, where _id is ObjectId for query purposes
    type ProductInDb = Omit<Product, '_id'> & { _id: ObjectId };

    const updateResult = await db.collection<ProductInDb>(PRODUCTS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(productId) } as any, // Filter using ObjectId. `as any` to bypass strict _id type for query.
      finalUpdateOps as any, // `as any` for the update ops to simplify complex MongoDB update types.
      { returnDocument: 'after' }
    );

    if (!updateResult) { // findOneAndUpdate returns null if not found
      for (const img of newUploadedImages) {
        try { await deleteImageFromCloudinary(img.publicId); } catch (e) { console.error("Cleanup failed for", img.publicId, e); }
      }
      return { success: false, error: 'Failed to update product in database or product not found.' };
    }

    // updateResult is the updated document from the DB, _id is ObjectId
    const updatedProductFromDb: WithId<Document> = updateResult;

    // Handle legacy products that might have null expiryDate
    const updatedExpiryDate = updatedProductFromDb.expiryDate 
      ? new Date(updatedProductFromDb.expiryDate) 
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year from now

    // Clean up batches data to handle null values
    const cleanedUpdatedBatches = (updatedProductFromDb.batches || []).map((batch: any) => ({
      ...batch,
      supplier: batch.supplier || undefined, // Convert null to undefined
      notes: batch.notes || undefined, // Convert null to undefined
      expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : new Date(),
      createdAt: batch.createdAt ? new Date(batch.createdAt) : new Date(),
    }));

    const updatedProduct = ProductSchema.parse({
      ...updatedProductFromDb,
      _id: updatedProductFromDb._id.toString(), // Now _id is ObjectId, so toString() is valid
      images: updatedProductFromDb.images || [],
      priceHistory: updatedProductFromDb.priceHistory || [],
      batches: cleanedUpdatedBatches,
      expiryDate: updatedExpiryDate,
      createdAt: updatedProductFromDb.createdAt ? new Date(updatedProductFromDb.createdAt) : undefined,
      updatedAt: updatedProductFromDb.updatedAt ? new Date(updatedProductFromDb.updatedAt) : undefined,
      lowStockThreshold: updatedProductFromDb.lowStockThreshold ?? 0,
      cost: updatedProductFromDb.cost ?? 0,
    }) as Product;

    revalidatePath('/products');
    revalidatePath(`/products/${productId}`);
    revalidatePath('/dashboard');

    // If categoryId is present and valid, try to fetch categoryName
    // This is important if only categoryId is sent from client, or to ensure categoryName is up-to-date
    if (updateDataFromZod.categoryId && ObjectId.isValid(updateDataFromZod.categoryId)) {
      const categoryDoc = await db.collection('categories').findOne({ _id: new ObjectId(updateDataFromZod.categoryId as string) });
      if (categoryDoc) {
        updatedProduct.categoryName = categoryDoc.name;
      } else {
        // Category ID provided but not found, maybe clear it or handle as error?
        // For now, let's assume if categoryId is given, it should exist. 
        // Or, the form should always provide both categoryId and categoryName from a select.
        // If only ID is passed and it's invalid, it might be better to reject or clear.
        console.warn(`Category ID ${updateDataFromZod.categoryId} not found during product update. Category name might be stale if not provided directly.`);
        // If categoryName wasn't in validatedData, this might leave it undefined or as the old value.
        // A robust solution would involve ensuring form sends both or has a clear strategy.
      }
    }

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

