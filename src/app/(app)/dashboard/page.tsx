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
      try {
        // Fetch stats first as they're most important
        const statsPromise = getDashboardOverviewStats().then(data => {
          setStats(data);
          setLoadingStats(false);
        });

        // Fetch other data in parallel but don't block stats
        const activityPromise = getRecentActivity().then(data => {
          setRecentActivity(data);
          setLoadingActivity(false);
        });

        const alertsPromise = getDashboardInventoryAlerts().then(data => {
          setInventoryAlerts(data);
          setLoadingAlerts(false);
        });

        // Don't wait for all to complete - let each update as they finish
        await Promise.allSettled([statsPromise, activityPromise, alertsPromise]);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
        // Set loading states to false even on error
        setLoadingStats(false);
        setLoadingActivity(false);
        setLoadingAlerts(false);
      }
    }
    fetchData();
  }, []);

  const statCardsData = [
    { title: "總商品數量", value: stats?.totalProducts ?? "0", icon: Package, color: "text-primary", loading: loadingStats },
    { title: "活躍訂單", value: stats?.activeOrders ?? "0", icon: ShoppingCart, color: "text-accent", loading: loadingStats },
    { title: "總客戶數量", value: stats?.totalCustomers ?? "0", icon: Users, color: "text-green-500", loading: loadingStats },
    { title: "本月收入", value: stats ? formatCurrency(stats.currentMonthRevenue ?? 0) : "NT$0", icon: BarChart3, color: "text-blue-500", loading: loadingStats },
  ];

  return (
    <div className="w-full max-w-none space-y-4">
      <h1 className="text-3xl font-bold text-foreground">總覽概況</h1>
      
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCardsData.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5 text-primary" />最近活動</CardTitle>
            <CardDescription>最近庫存變動和訂單的狀況</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-3 bg-gray-200 rounded w-full"></div>
                    ))}
                  </div>
                </div>
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-3 bg-gray-200 rounded w-full"></div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                    <h4 className="font-medium text-foreground mb-2">最新訂單</h4>
                  {recentActivity?.recentOrders && recentActivity.recentOrders.length > 0 ? (
                    <ul className="space-y-2">
                      {recentActivity.recentOrders.map(order => (
                        <li key={order._id} className="text-sm text-foreground border-b border-border pb-1 last:border-b-0">
                          訂單{' '}
                          <Link 
                            href={`/orders/${order._id}`}
                            className="font-semibold text-primary hover:text-primary/80 hover:underline transition-colors"
                          >
                            {order.orderNumber}
                          </Link>
                          {' '}: {order.customerName} ({formatCurrency(order.totalAmount)})
                          <span className="text-xs text-muted-foreground ml-2">({formatToYYYYMMDDWithTime(order.orderDate)})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">沒有最近訂單。</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">庫存變動狀況</h4>
                  {recentActivity?.recentMovements && recentActivity.recentMovements.length > 0 ? (
                    <ul className="space-y-2">
                      {recentActivity.recentMovements.map(move => (
                        <li key={move._id} className="text-sm text-foreground border-b border-border pb-1 last:border-b-0">
                           {move.type ? move.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'} : <span className="font-semibold text-primary">{move.productName}</span> (數量: {move.quantity})
                           <span className="text-xs text-muted-foreground ml-2">({formatToYYYYMMDDWithTime(move.movementDate)})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground">沒有最近庫存移動。</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><ListChecks className="mr-2 h-5 w-5 text-orange-500" />商品警告</CardTitle>
            <CardDescription>需要關注的商品庫存數量或到期日期</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="space-y-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="h-3 bg-gray-200 rounded w-full"></div>
                    ))}
                  </div>
                </div>
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="space-y-2">
                    {[1, 2].map(i => (
                      <div key={i} className="h-3 bg-gray-200 rounded w-full"></div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">庫存數量低於安全值警告</h4>
                  {inventoryAlerts?.lowStockProducts && inventoryAlerts.lowStockProducts.length > 0 ? (
                    <ul className="space-y-2">
                      {inventoryAlerts.lowStockProducts.map(product => (
                        <li key={product._id} className="text-sm text-red-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span> 庫存不足 ({product.stock} 單位 / 門檻: {product.lowStockThreshold}).
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />沒有低庫存警報。</p>
                  )}
                </div>
                 <div>
                  <h4 className="font-medium text-foreground mb-2">1年內到期</h4>
                  {inventoryAlerts?.expiringSoonProducts && inventoryAlerts.expiringSoonProducts.length > 0 ? (
                    <ul className="space-y-2">
                      {inventoryAlerts.expiringSoonProducts.map(product => (
                        <li key={product._id} className="text-sm text-orange-600">
                           <AlertTriangle className="inline h-4 w-4 mr-1" />
                           <span className="font-semibold">{product.name}</span> 過期日期: {product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : "N/A"}.
                        </li>
                      ))}
                    </ul>
                  ): (
                     <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />沒有即將過期的商品。</p>
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