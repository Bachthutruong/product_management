
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, AlertTriangle, TrendingUp, Loader2, DollarSign, ShoppingBag, CircleSlash } from "lucide-react";
import { 
  getOverallSalesSummary, 
  getReportsPageInventoryAlerts, // Using the specific reports action now
  type SalesSummary,
  type InventoryAlerts
} from "./actions";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

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
      <h1 className="text-3xl font-bold text-foreground">Reports & Analysis</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-6 w-6 text-green-500" /> Sales Summary
            </CardTitle>
            <CardDescription>Overall sales performance metrics.</CardDescription>
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
                    <span>Total Orders (All Time):</span>
                  </div>
                  <span className="font-semibold text-lg text-foreground">{salesSummary.totalOrdersAllTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-muted-foreground">
                    <DollarSign className="mr-2 h-5 w-5" />
                    <span>Total Revenue (All Time):</span>
                  </div>
                  <span className="font-semibold text-lg text-foreground">${salesSummary.totalRevenueAllTime.toFixed(2)}</span>
                </div>
                 <div className="h-32 bg-muted/30 rounded-md flex items-center justify-center text-sm text-muted-foreground mt-4">
                   Sales Chart Area (Future Enhancement)
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Could not load sales summary.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-6 w-6 text-orange-500" /> Detailed Inventory Alerts
            </CardTitle>
            <CardDescription>Products nearing expiration or low stock (shows up to 10).</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : inventoryAlerts ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Low Stock Products</h4>
                  {inventoryAlerts.lowStockProducts.length > 0 ? (
                    <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                      {inventoryAlerts.lowStockProducts.map(product => (
                        <li key={product._id} className="text-red-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span>: {product.stock} units (Threshold: {product.lowStockThreshold})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />No low stock products.</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Expiring Soon Products (Next 30 Days)</h4>
                   {inventoryAlerts.expiringSoonProducts.length > 0 ? (
                    <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                      {inventoryAlerts.expiringSoonProducts.map(product => (
                        <li key={product._id} className="text-orange-600">
                          <AlertTriangle className="inline h-4 w-4 mr-1" />
                          <span className="font-semibold">{product.name}</span> expires on {product.expiryDate ? format(new Date(product.expiryDate), "dd/MM/yyyy") : "N/A"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground flex items-center"><CircleSlash className="mr-2 h-4 w-4" />No products expiring soon.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Could not load inventory alerts.</p>
            )}
          </CardContent>
        </Card>
        
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-6 w-6 text-blue-500" /> Custom Reports
            </CardTitle>
            <CardDescription>Generate and download custom reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Functionality to generate specific reports will be here.</p>
            <div className="mt-4 space-y-2">
              <Button variant="link" className="p-0 h-auto text-sm text-primary hover:underline" disabled>Download Inventory Report (CSV) - Soon</Button><br/>
              <Button variant="link" className="p-0 h-auto text-sm text-primary hover:underline" disabled>Download Sales Report (PDF) - Soon</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
