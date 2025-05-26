
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Reports & Analysis</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-6 w-6 text-green-500" /> Sales Summary
            </CardTitle>
            <CardDescription>Overview of sales performance.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Sales charts and key metrics will be displayed here...</p>
            {/* Placeholder for sales chart */}
             <div className="h-40 bg-muted/50 rounded-md flex items-center justify-center text-sm text-muted-foreground mt-4">Sales Chart Area</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-6 w-6 text-orange-500" /> Inventory Alerts
            </CardTitle>
            <CardDescription>Products nearing expiration or low stock.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Detailed list of alerted products will be here...</p>
            {/* Placeholder for inventory alerts list */}
            <ul className="space-y-1 mt-4 text-sm">
              <li><span className="font-medium text-red-600">Low Stock:</span> Product A (3 units)</li>
              <li><span className="font-medium text-orange-600">Expiring Soon:</span> Product B (15 days)</li>
            </ul>
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
            <p className="text-muted-foreground">Options to generate specific reports will be here...</p>
            {/* Placeholder for custom report options */}
            <div className="mt-4 space-y-2">
              <button className="text-sm text-primary hover:underline">Download Inventory Report (CSV)</button><br/>
              <button className="text-sm text-primary hover:underline">Download Sales Report (PDF)</button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
