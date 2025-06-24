"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { CustomerCategoryForm } from '@/components/customer-categories/CustomerCategoryForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { type CustomerCategory, type CreateCustomerCategoryInput } from '@/models/CustomerCategory';
import { 
  getCustomerCategories, 
  createCustomerCategory, 
  updateCustomerCategory, 
  deleteCustomerCategory 
} from './actions';

export default function CustomerCategoriesPage() {
  const [categories, setCategories] = useState<CustomerCategory[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomerCategory | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getCustomerCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast({
        title: "載入失敗",
        description: "無法載入客戶分類資料。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (data: CreateCustomerCategoryInput) => {
    try {
      const result = await createCustomerCategory(data);
      if (result.success && result.category) {
        setCategories(prev => [result.category!, ...prev]);
        setIsAddDialogOpen(false);
        toast({
          title: "客戶分類已新增",
          description: `分類 "${data.name}" 已成功新增。`,
        });
      } else {
        toast({
          title: "新增失敗",
          description: result.error || "無法新增客戶分類，請稍後再試。",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error adding category:', error);
      toast({
        title: "新增失敗",
        description: "無法新增客戶分類，請稍後再試。",
        variant: "destructive",
      });
    }
  };

  const handleEditCategory = async (data: CreateCustomerCategoryInput) => {
    try {
      if (!editingCategory?._id) return;
      
      const result = await updateCustomerCategory(editingCategory._id, data);
      if (result.success && result.category) {
        setCategories(prev => 
          prev.map(cat => cat._id === editingCategory._id ? result.category! : cat)
        );
        setIsEditDialogOpen(false);
        setEditingCategory(null);
        toast({
          title: "客戶分類已更新",
          description: `分類 "${data.name}" 已成功更新。`,
        });
      } else {
        toast({
          title: "更新失敗",
          description: result.error || "無法更新客戶分類，請稍後再試。",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: "更新失敗",
        description: "無法更新客戶分類，請稍後再試。",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const result = await deleteCustomerCategory(categoryId);
      if (result.success) {
        setCategories(prev => prev.filter(cat => cat._id !== categoryId));
        toast({
          title: "客戶分類已刪除",
          description: "分類已成功刪除。",
        });
      } else {
        toast({
          title: "刪除失敗",
          description: result.error || "無法刪除客戶分類，請稍後再試。",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除客戶分類，請稍後再試。",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (category: CustomerCategory) => {
    setEditingCategory(category);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">客戶分類管理</h1>
          <p className="text-muted-foreground">管理客戶的分類和類型</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增分類
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增客戶分類</DialogTitle>
            </DialogHeader>
            <CustomerCategoryForm onSubmit={handleAddCategory} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>客戶分類列表</CardTitle>
          <CardDescription>
            所有客戶分類的總覽，包含分類代碼和狀態
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="text-muted-foreground">載入中...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分類名稱</TableHead>
                  <TableHead>分類代碼</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                <TableRow key={category._id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{category.code}</Badge>
                  </TableCell>
                  <TableCell>{category.description || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? "default" : "secondary"}>
                      {category.isActive ? '啟用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(category)}
                        className="text-muted-foreground hover:text-white hover:bg-[#c3223d]"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white hover:bg-[#c3223d]">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>確認刪除</AlertDialogTitle>
                            <AlertDialogDescription>
                              您確定要刪除分類 "{category.name}" 嗎？此操作無法復原。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCategory(category._id!)}
                            >
                              刪除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯客戶分類</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <CustomerCategoryForm
              initialData={editingCategory}
              onSubmit={handleEditCategory}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 