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
  productId: z.string().min(1, "產品 ID 是必需的"),
  productName: z.string().min(1, "產品名稱是必需的"),
  averageDailySales: z.coerce.number().min(0, "平均日銷售量必須是非負數"),
  currentStockLevel: z.coerce.number().min(0, "目前庫存水平必須是非負數"),
  leadTimeInDays: z.coerce.number().min(0, "提前期必須是非負數"),
  desiredSafetyStockLevel: z.coerce.number().min(0, "目標安全庫存必須是非負數"),
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
        title: "建議已準備就緒！",
        description: `AI 建議再訂購 ${result.reorderQuantity} 單位的 ${data.productName}。`,
      });
    } catch (error) {
      console.error("Error getting reorder suggestion:", error);
      toast({
        variant: "destructive",
        title: "錯誤",
        description: "無法取得再訂購建議。請再試一次。",
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
          AI 再訂購數量建議工具
        </CardTitle>
        <CardDescription>
          輸入產品詳細資訊以取得 AI 動力的再訂購數量建議。
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
                    <FormLabel>產品 ID</FormLabel>
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
                    <FormLabel>產品名稱</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：超級小工具" {...field} />
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
                    <FormLabel>平均日銷售量</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="例如：10" {...field} />
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
                    <FormLabel>目前庫存水平</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="例如：50" {...field} />
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
                    <FormLabel>提前期（天）</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="例如：7" {...field} />
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
                    <FormLabel>目標安全庫存水平</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="例如：20" {...field} />
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
              取得建議
            </Button>
            {suggestion && (
              <Card className="bg-accent/10 border-accent">
                <CardHeader>
                  <CardTitle className="text-accent">AI 建議</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-lg font-semibold text-foreground">
                    再訂購數量: <span className="text-accent">{suggestion.reorderQuantity}</span> 單位
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">理由:</span> {suggestion.reasoning}
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
