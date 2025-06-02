
'use server';

import clientPromise from '@/lib/mongodb';
import { type Product } from '@/models/Product';
import { getDashboardInventoryAlerts as getReportInventoryAlerts, type InventoryAlerts } from '@/app/(app)/dashboard/actions'; // Reuse dashboard alerts logic
import { addDays } from 'date-fns';


const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';


async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export interface SalesSummary {
  totalOrdersAllTime: number;
  totalRevenueAllTime: number;
}

export async function getOverallSalesSummary(): Promise<SalesSummary> {
  try {
    const db = await getDb();
    const totalOrdersAllTime = await db.collection(ORDERS_COLLECTION).countDocuments({ status: { $nin: ['cancelled'] }});

    const revenuePipeline = [
      { $match: { status: { $nin: ['cancelled'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
    ];
    const totalRevenueResult = await db.collection(ORDERS_COLLECTION).aggregate(revenuePipeline).toArray();
    const totalRevenueAllTime = totalRevenueResult.length > 0 ? totalRevenueResult[0].totalRevenue : 0;

    return {
      totalOrdersAllTime,
      totalRevenueAllTime,
    };
  } catch (error) {
    console.error('Error fetching overall sales summary:', error);
    return { totalOrdersAllTime: 0, totalRevenueAllTime: 0 };
  }
}

// Re-exporting for clarity or if we want to customize it for reports later
export async function getReportsPageInventoryAlerts(): Promise<InventoryAlerts> {
    // For now, it's identical to dashboard alerts.
    // We could add more specific filtering or different limits for reports if needed.
    try {
        const db = await getDb();
        const today = new Date();
        const thirtyDaysFromNow = addDays(today, 30);

        const lowStockProductsData = await db.collection<Product>(PRODUCTS_COLLECTION)
        .find({ 
            $expr: { $lt: ['$stock', '$lowStockThreshold'] },
            stock: { $gt: 0 } 
        })
        .project({ name: 1, stock: 1, lowStockThreshold: 1, _id: 1 })
        .limit(10) // Potentially show more on reports page
        .toArray();

        const expiringSoonProductsData = await db.collection<Product>(PRODUCTS_COLLECTION)
        .find({
            expiryDate: { $exists: true, $gte: today, $lte: thirtyDaysFromNow },
        })
        .project({ name: 1, expiryDate: 1, _id: 1 })
        .limit(10) // Potentially show more
        .toArray();

        const lowStockProducts = lowStockProductsData.map(p => ({
            ...p,
            _id: p._id.toString(),
        })) as Pick<Product, '_id' | 'name' | 'stock' | 'lowStockThreshold'>[];

        const expiringSoonProducts = expiringSoonProductsData.map(p => ({
            ...p,
            _id: p._id.toString(),
            expiryDate: p.expiryDate ? new Date(p.expiryDate) : undefined,
        })) as Pick<Product, '_id' | 'name' | 'expiryDate'>[];

        return { lowStockProducts, expiringSoonProducts };

    } catch (error) {
        console.error('Error fetching inventory alerts for reports page:', error);
        return { lowStockProducts: [], expiringSoonProducts: [] };
    }
}
