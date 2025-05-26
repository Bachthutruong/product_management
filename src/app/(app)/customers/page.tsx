
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search } from "lucide-react";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">Customers</h1>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search customers..." className="pl-8 w-full" />
          </div>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0">
            <PlusCircle className="mr-2 h-5 w-5" /> Add Customer
          </Button>
        </div>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>Manage your customer directory.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Customer table will be displayed here...</p>
          {/* Placeholder for customer list/table */}
          <div className="mt-4 p-4 border rounded-md bg-muted/50">
            This is where customer data (Name, Email, Phone, Order History link) will appear.
            <ul>
              <li>- Actions: Edit Customer, Delete Customer (Admin only), View Orders.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
