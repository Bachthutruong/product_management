
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
        <div className="space-x-2">
           <Button variant="outline">
            <History className="mr-2 h-5 w-5" /> View History
          </Button>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ArrowDownToLine className="mr-2 h-6 w-6 text-green-500" />
              Stock In (Receive Products)
            </CardTitle>
            <CardDescription>Record new stock arrivals.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Form to add incoming stock will be here...</p>
            {/* Placeholder for Stock In form */}
            <div className="mt-4 p-4 border rounded-md bg-muted/50 space-y-2">
              <p>Select Product, Enter Quantity, Enter Expiration Date.</p>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                Record Stock In
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ArrowUpFromLine className="mr-2 h-6 w-6 text-red-500" />
              Stock Out (Adjustments)
            </CardTitle>
            <CardDescription>Record stock removal or adjustments (not orders).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Form for manual stock adjustments will be here...</p>
             {/* Placeholder for Stock Out form */}
            <div className="mt-4 p-4 border rounded-md bg-muted/50 space-y-2">
              <p>Select Product, Enter Quantity, Reason for adjustment.</p>
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                Record Stock Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Inventory History</CardTitle>
          <CardDescription>Log of all stock movements.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Table of inventory history (date, product, quantity, type, user) will be here...</p>
        </CardContent>
      </Card>

    </div>
  );
}
