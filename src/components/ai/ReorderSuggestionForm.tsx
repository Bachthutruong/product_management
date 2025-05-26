
"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { suggestReorderQuantity, type SuggestReorderQuantityInput, type SuggestReorderQuantityOutput } from "@/ai/flows/suggest-reorder-quantity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product Name is required"),
  averageDailySales: z.coerce.number().min(0, "Average daily sales must be non-negative"),
  currentStockLevel: z.coerce.number().min(0, "Current stock level must be non-negative"),
  leadTimeInDays: z.coerce.number().min(0, "Lead time must be non-negative"),
  desiredSafetyStockLevel: z.coerce.number().min(0, "Desired safety stock must be non-negative"),
});

type ReorderFormValues = z.infer<typeof formSchema>;

export function ReorderSuggestionForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestReorderQuantityOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<ReorderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: "",
      productName: "",
      averageDailySales: 0,
      currentStockLevel: 0,
      leadTimeInDays: 0,
      desiredSafetyStockLevel: 0,
    },
  });

  const onSubmit: SubmitHandler<ReorderFormValues> = async (data) => {
    setIsLoading(true);
    setSuggestion(null);
    try {
      const result = await suggestReorderQuantity(data);
      setSuggestion(result);
      toast({
        title: "Suggestion Ready!",
        description: `AI suggests reordering ${result.reorderQuantity} units of ${data.productName}.`,
      });
    } catch (error) {
      console.error("Error getting reorder suggestion:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to get reorder suggestion. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Lightbulb className="mr-2 h-6 w-6 text-accent" />
          AI Reorder Quantity Suggester
        </CardTitle>
        <CardDescription>
          Enter product details to get an AI-powered reorder quantity suggestion.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product ID</FormLabel>
                    <FormControl>
                      <Input placeholder="SKU-123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Super Widget" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="averageDailySales"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Average Daily Sales</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentStockLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Stock Level</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="leadTimeInDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Time (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 7" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="desiredSafetyStockLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desired Safety Stock Level</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-4">
            <Button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lightbulb className="mr-2 h-4 w-4" />
              )}
              Get Suggestion
            </Button>
            {suggestion && (
              <Card className="bg-accent/10 border-accent">
                <CardHeader>
                  <CardTitle className="text-accent">AI Suggestion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-lg font-semibold text-foreground">
                    Reorder Quantity: <span className="text-accent">{suggestion.reorderQuantity}</span> units
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reasoning:</span> {suggestion.reasoning}
                  </p>
                </CardContent>
              </Card>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
