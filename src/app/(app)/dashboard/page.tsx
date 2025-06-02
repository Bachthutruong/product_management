"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Package, Users, ShoppingCart, Loader2, AlertTriangle, History, ListChecks, CircleSlash } from "lucide-react";
import { 
  getDashboardOverviewStats, 
  getRecentActivity, 
  getDashboardInventoryAlerts,
  type DashboardStats,
  type RecentActivity,
  type InventoryAlerts
} from "./actions";
import { formatToYYYYMMDDWithTime, formatToYYYYMMDD } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}

function StatCard({ title, value, icon: Icon, color, loading }: StatCardProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-foreground" />
        ) : (
          <div className="text-2xl font-bold text-foreground">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlerts | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoadingStats(true);
      setLoadingActivity(true);
      setLoadingAlerts(true);

      try {
        const [statsData, activityData, alertsData] = await Promise.all([
          getDashboardOverviewStats(),
          getRecentActivity(),
          getDashboardInventoryAlerts()
        ]);
        setStats(statsData);
        setRecentActivity(activityData);
        setInventoryAlerts(alertsData);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
        // Optionally set an error state to show a message to the user
      } finally {
        setLoadingStats(false);
        setLoadingActivity(false);
        setLoadingAlerts(false);
      }
    }
    fetchData();
  }, []);

  const statCardsData = [
    { title: "Total Products", value: stats?.totalProducts ?? "N/A", icon: Package, color: "text-primary", loading: loadingStats },
    { title: "Active Orders", value: stats?.activeOrders ?? "N/A", icon: ShoppingCart, color: "text-accent", loading: loadingStats },
    { title: "Total Customers", value: stats?.totalCustomers ?? "N/A", icon: Users, color: "text-green-500", loading: loadingStats },
    { title: "Revenue (This Month)", value: formatCurrency(stats?.currentMonthRevenue ?? 0), icon: BarChart3, color: "text-blue-500", loading: loadingStats },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCardsData.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5 text-primary" />Recent Activity</CardTitle>
            <CardDescription>Overview of recent stock movements and orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Latest Orders</h4>
                  {recentActivity?.recentOrders && recentActivity.recentOrders.length > 0 ? (
                    <ul className="space-y-2">
                      {recentActivity.recentOrders.map(order => (
                        <li key={order._id} className="text-sm text-foreground border-b border-border pb-1 last:border-b-0">
                          Order{' '}
                          <Link 
                            href={`/orders/${order._id}`}
                            className="font-semibold text-primary hover:text-primary/80 hover:underline transition-colors"
                          >
                            {order.orderNumber}
                          </Link>
                          {' '}for {order.customerName} ({formatCurrency(order.totalAmount)})
                          <span className="text-xs text-muted-foreground ml-2">({formatToYYYYMMDDWithTime(order.orderDate)})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent orders.</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Latest Inventory Movements</h4>
                  {recentActivity?.recentMovements && recentActivity.recentMovements.length > 0 ? (
                    <ul className="space-y-2">
                      {recentActivity.recentMovements.map(move => (
                        <li key={move._id} className="text-sm text-foreground border-b border-border pb-1 last:border-b-0">
                           {move.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} of <span className="font-semibold text-primary">{move.productName}</span> (Qty: {move.quantity})
                           <span className="text-xs text-muted-foreground ml-2">({formatToYYYYMMDDWithTime(move.movementDate)})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground">No recent inventory movements.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><ListChecks className="mr-2 h-5 w-5 text-orange-500" />Inventory Alerts</CardTitle>
            <CardDescription>Products needing attention based on stock levels or expiry dates.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
               <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Low Stock</h4>
                  {inventoryAlerts?.lowStockProducts && inventoryAlerts.lowStockProducts.length > 0 ? (
                    <ul className="space-y-2">
                      {inventoryAlerts.lowStockProducts.map(product => (
                        <li key={product._id} className="text-sm text-red-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span> is low on stock ({product.stock} units / Threshold: {product.lowStockThreshold}).
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />No low stock alerts.</p>
                  )}
                </div>
                 <div>
                  <h4 className="font-medium text-foreground mb-2">Expiring Soon (Next 30 Days)</h4>
                  {inventoryAlerts?.expiringSoonProducts && inventoryAlerts.expiringSoonProducts.length > 0 ? (
                    <ul className="space-y-2">
                      {inventoryAlerts.expiringSoonProducts.map(product => (
                        <li key={product._id} className="text-sm text-orange-600">
                           <AlertTriangle className="inline h-4 w-4 mr-1" />
                           <span className="font-semibold">{product.name}</span> expires on {product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : "N/A"}.
                        </li>
                      ))}
                    </ul>
                  ): (
                     <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />No products expiring soon.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}