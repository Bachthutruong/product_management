"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, AlertTriangle, TrendingUp, Loader2, DollarSign, ShoppingBag, CircleSlash } from "lucide-react";
import {
  getOverallSalesSummary,
  getReportsPageInventoryAlerts, // Using the specific reports action now
  type SalesSummary,
} from "./actions";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { InventoryAlerts } from "../dashboard/actions";
import { formatToYYYYMMDD } from '@/lib/date-utils';
import { formatCurrency } from '@/lib/utils';

export default function ReportsPage() {
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlerts | null>(null);
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoadingSales(true);
      setLoadingAlerts(true);
      try {
        const [summaryData, alertsData] = await Promise.all([
          getOverallSalesSummary(),
          getReportsPageInventoryAlerts()
        ]);
        setSalesSummary(summaryData);
        setInventoryAlerts(alertsData);
      } catch (error) {
        console.error("Failed to load reports data", error);
      } finally {
        setLoadingSales(false);
        setLoadingAlerts(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">報告與分析</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-6 w-6 text-green-500" /> 銷售總結
            </CardTitle>
            <CardDescription>整體銷售業績指標。</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSales ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : salesSummary ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-muted-foreground">
                    <ShoppingBag className="mr-2 h-5 w-5" />
                    <span>總訂單數 (所有時間):</span>
                  </div>
                  <span className="font-semibold text-lg text-foreground">{salesSummary.totalOrdersAllTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-muted-foreground">
                    <DollarSign className="mr-2 h-5 w-5" />
                    <span>總營收 (所有時間):</span>
                  </div>
                  <span className="font-semibold text-lg text-foreground">{formatCurrency(salesSummary.totalRevenueAllTime)}</span>
                </div>
                <div className="h-32 bg-muted/30 rounded-md flex items-center justify-center text-sm text-muted-foreground mt-4">
                  銷售圖表區塊 (未來增強功能)
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">無法載入銷售總結。</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-6 w-6 text-orange-500" /> 詳細庫存警示
            </CardTitle>
            <CardDescription>即將到期或庫存不足的產品 (最多顯示 10 個)。</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : inventoryAlerts ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">庫存不足產品</h4>
                  {inventoryAlerts.lowStockProducts.length > 0 ? (
                    <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                      {inventoryAlerts.lowStockProducts.map(product => (
                        <li key={product._id} className="text-red-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span>: {product.stock} 個 (閾值: {product.lowStockThreshold})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />沒有庫存不足的產品。</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">即將到期產品 (未來 30 天內)</h4>
                  {inventoryAlerts.expiringSoonProducts.length > 0 ? (
                    <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                      {inventoryAlerts.expiringSoonProducts.map(product => (
                        <li key={product._id} className="text-orange-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span> 將於 {product.expiryDate ? formatToYYYYMMDD(product.expiryDate) : "不適用"} 到期
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />沒有即將到期的產品。</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">無法載入庫存警示。</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-6 w-6 text-blue-500" /> 自訂報告
            </CardTitle>
            <CardDescription>產生並下載自訂報告。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">產生特定報告的功能將在此處提供。</p>
            <div className="mt-4 space-y-2">
              <Button variant="link" className="p-0 h-auto text-sm text-primary hover:underline" disabled>下載庫存報告 (CSV) - 即將推出</Button><br />
              <Button variant="link" className="p-0 h-auto text-sm text-primary hover:underline" disabled>下載銷售報告 (PDF) - 即將推出</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
