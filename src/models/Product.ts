import { z } from 'zod';

export const ProductImageSchema = z.object({
  url: z.string().url({ message: "無效的圖片 URL" }),
  publicId: z.string(),
  isPrimary: z.boolean().optional().default(false),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const PriceHistoryEntrySchema = z.object({
  price: z.number(),
  changedAt: z.date(),
  changedBy: z.string(), // User ID
});
export type PriceHistoryEntry = z.infer<typeof PriceHistoryEntrySchema>;

// 庫存入庫歷史記錄的 Schema
export const StockInEntrySchema = z.object({
  quantityAdded: z.number().int().positive(),
  batchExpiryDate: z.date().optional().nullable(),
  stockedAt: z.date(),
  stockedByUserId: z.string(), // User ID of who stocked it
  supplier: z.string().optional(),
  costAtTime: z.number().optional(), // Cost per unit at the time of stock-in
});
export type StockInEntry = z.infer<typeof StockInEntrySchema>;

// 批次追蹤的 Schema - 每個批次都有自己的到期日期和剩餘庫存
export const ProductBatchSchema = z.object({
  batchId: z.string(), // Unique identifier for this batch
  expiryDate: z.date(), // Required for new batches
  initialQuantity: z.number().int().positive(), // Original quantity when batch was created
  remainingQuantity: z.number().int().min(0), // Current remaining quantity
  costPerUnit: z.number().min(0).optional(),
  createdAt: z.date(),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});
export type ProductBatch = z.infer<typeof ProductBatchSchema>;

export const ProductSchema = z.object({
  _id: z.any().optional(), // MongoDB ObjectId will be here
  name: z.string().min(1, { message: "產品名稱是必需的" }),
  sku: z.string().min(1, { message: "SKU 是必需的" }).optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  price: z.coerce.number().min(0, { message: "價格必須是非負數" }),
  cost: z.coerce.number().min(0, { message: "成本必須是非負數" }).optional().default(0),
  stock: z.coerce.number().int({ message: "庫存必須是整數" }).min(0, { message: "庫存必須是非負數" }),
  description: z.string().optional(),
  images: z.array(ProductImageSchema).optional().default([]),
  expiryDate: z.date({ message: "到期日期是必需的" }),
  lowStockThreshold: z.coerce.number().int().min(0).optional().default(0),
  priceHistory: z.array(PriceHistoryEntrySchema).optional().default([]),
  stockInHistory: z.array(StockInEntrySchema).optional().default([]),
  batches: z.array(ProductBatchSchema).optional().default([]), // Track individual batches
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Product = z.infer<typeof ProductSchema> & { _id: string };

// 用於驗證表單輸入 (非檔案欄位) 的 Schema，適用於新增和編輯。
// 'images' 的實際 FileList 處理由 FormData 處理。
export const ProductFormInputSchema = ProductSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  images: true, // images 欄位在 schema 中是儲存的圖片資料，不是 FileList
  priceHistory: true,
  stockInHistory: true,
  batches: true, // 批次獨立管理
});
export type ProductFormInput = z.infer<typeof ProductFormInputSchema>;

// 元件中 useForm 使用的類型，包含 images 的 FileList
// 此類型主要用於 AddProductForm。EditProductForm 可能會略有不同地管理 FileList。
export type AddProductFormValues = Omit<ProductFormInput, 'expiryDate' | 'lowStockThreshold' | 'price' | 'cost' | 'stock'> & {
  images?: FileList | null; // 用於新的圖片上傳
  expiryDate?: Date | null; // 在表單中仍然是選填，但驗證時是必需的
  lowStockThreshold?: number | string;
  price?: number | string;
  cost?: number | string;
  stock?: number | string;
};

// 注意: 對於 EditProductForm，表單值將與 EditProductForm.tsx 中的 EditProductFormValuesSchema 對應，
// 以處理數字欄位的潛在字串輸入。
