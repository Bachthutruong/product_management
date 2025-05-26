
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Package, Users, ShoppingCart } from "lucide-react";

export default function DashboardPage() {
  const stats = [
    { title: "Total Products", value: "1,234", icon: Package, color: "text-primary" },
    { title: "Active Orders", value: "56", icon: ShoppingCart, color: "text-accent" },
    { title: "Total Customers", value: "789", icon: Users, color: "text-green-500" },
    { title: "Revenue (Month)", value: "$12,345", icon: BarChart3, color: "text-blue-500" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              {/* <p className="text-xs text-muted-foreground">+20.1% from last month</p> */}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Overview of recent stock movements and orders.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Recent activity feed will be displayed here...</p>
            {/* Placeholder for activity feed */}
             <ul className="space-y-2 mt-4">
              <li className="text-sm text-foreground">Product "SuperWidget" stock updated.</li>
              <li className="text-sm text-foreground">New order #1024 created.</li>
              <li className="text-sm text-foreground">Customer "John Doe" registered.</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Inventory Alerts</CardTitle>
            <CardDescription>Products needing attention.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Low stock and expiring soon items will be listed here...</p>
             {/* Placeholder for alerts */}
            <ul className="space-y-2 mt-4">
              <li className="text-sm text-red-500">Product "Gizmo X" low stock (5 units).</li>
              <li className="text-sm text-orange-500">Product "Elixir Z" expiring in 30 days.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
