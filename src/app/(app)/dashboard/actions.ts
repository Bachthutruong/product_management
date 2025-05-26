
'use server';

import clientPromise from '@/lib/mongodb';
import { ProductSchema, type Product } from '@/models/Product';
import type { Order } from '@/models/Order';
import type { InventoryMovement } from '@/models/InventoryMovement';
import { startOfMonth, endOfMonth, addDays } from 'date-fns';

const DB_NAME = process.env.MONGODB_DB_NAME || 'stockpilot';
const PRODUCTS_COLLECTION = 'products';
const ORDERS_COLLECTION = 'orders';
const CUSTOMERS_COLLECTION = 'customers';
const INVENTORY_MOVEMENTS_COLLECTION = 'inventory_movements';

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export interface DashboardStats {
  totalProducts: number;
  activeOrders: number;
  totalCustomers: number;
  currentMonthRevenue: number;
}

export interface RecentActivity {
  recentOrders: Pick<Order, '_id' | 'orderNumber' | 'customerName' | 'totalAmount' | 'orderDate'>[];
  recentMovements: Pick<InventoryMovement, '_id' | 'productName' | 'type' | 'quantity' | 'movementDate'>[];
}

export interface InventoryAlerts {
  lowStockProducts: Pick<Product, '_id' | 'name' | 'stock' | 'lowStockThreshold'>[];
  expiringSoonProducts: Pick<Product, '_id' | 'name' | 'expiryDate'>[];
}

export async function getDashboardOverviewStats(): Promise<DashboardStats> {
  try {
    const db = await getDb();
    const today = new Date();
    const firstDayOfMonth = startOfMonth(today);
    const lastDayOfMonth = endOfMonth(today);

    const totalProducts = await db.collection(PRODUCTS_COLLECTION).countDocuments();
    const activeOrders = await db.collection(ORDERS_COLLECTION).countDocuments({
      status: { $in: ['pending', 'processing'] },
    });
    const totalCustomers = await db.collection(CUSTOMERS_COLLECTION).countDocuments();

    const revenuePipeline = [
      {
        $match: {
          orderDate: {
            $gte: firstDayOfMonth,
            $lte: lastDayOfMonth,
          },
           status: { $nin: ['cancelled'] } // Exclude cancelled orders from revenue
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
    ];
    const monthlyRevenueResult = await db.collection(ORDERS_COLLECTION).aggregate(revenuePipeline).toArray();
    const currentMonthRevenue = monthlyRevenueResult.length > 0 ? monthlyRevenueResult[0].totalRevenue : 0;

    return {
      totalProducts,
      activeOrders,
      totalCustomers,
      currentMonthRevenue,
    };
  } catch (error) {
    console.error('Error fetching dashboard overview stats:', error);
    // Return default/empty values in case of error to prevent page crash
    return { totalProducts: 0, activeOrders: 0, totalCustomers: 0, currentMonthRevenue: 0 };
  }
}

export async function getRecentActivity(): Promise<RecentActivity> {
  try {
    const db = await getDb();
    const recentOrdersData = await db.collection<Order>(ORDERS_COLLECTION)
      .find({})
      .sort({ orderDate: -1 })
      .limit(3)
      .project({ orderNumber: 1, customerName: 1, totalAmount: 1, orderDate: 1 })
      .toArray();
    
    const recentMovementsData = await db.collection<InventoryMovement>(INVENTORY_MOVEMENTS_COLLECTION)
      .find({})
      .sort({ movementDate: -1 })
      .limit(3)
      .project({ productName: 1, type: 1, quantity: 1, movementDate: 1})
      .toArray();

    // Ensure _id is string and dates are Date objects
     const recentOrders = recentOrdersData.map(o => ({
      ...o,
      _id: o._id.toString(),
      orderDate: new Date(o.orderDate),
    })) as Pick<Order, '_id' | 'orderNumber' | 'customerName' | 'totalAmount' | 'orderDate'>[];

    const recentMovements = recentMovementsData.map(m => ({
      ...m,
      _id: m._id.toString(),
      movementDate: new Date(m.movementDate),
    })) as Pick<InventoryMovement, '_id' | 'productName' | 'type' | 'quantity' | 'movementDate'>[];


    return { recentOrders, recentMovements };
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return { recentOrders: [], recentMovements: [] };
  }
}

export async function getDashboardInventoryAlerts(): Promise<InventoryAlerts> {
  try {
    const db = await getDb();
    const today = new Date();
    const thirtyDaysFromNow = addDays(today, 30);

    const lowStockProductsData = await db.collection<Product>(PRODUCTS_COLLECTION)
      .find({ 
        $expr: { $lt: ['$stock', '$lowStockThreshold'] },
        stock: { $gt: 0 } // Only alert if stock > 0 but below threshold
       })
      .limit(5)
      .project({ name: 1, stock: 1, lowStockThreshold: 1 })
      .toArray();

    const expiringSoonProductsData = await db.collection<Product>(PRODUCTS_COLLECTION)
      .find({
        expiryDate: { $ne: null, $gte: today, $lte: thirtyDaysFromNow },
      })
      .limit(5)
      .project({ name: 1, expiryDate: 1 })
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
    console.error('Error fetching inventory alerts:', error);
    return { lowStockProducts: [], expiringSoonProducts: [] };
  }
}
