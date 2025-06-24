'use client';

import { useEffect, useState, useCallback } from 'react';
import { addCategory, getCategories, updateCategory, deleteCategory } from '@/app/(app)/categories/actions';
import type { Category, CategoryFormInput } from '@/models/Category';
import { CategoryForm } from '@/components/categories/CategoryForm';
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription as DialogNativeDescription,
    DialogHeader as DialogNativeHeader,
    DialogTitle as DialogNativeTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle as AlertDialogNativeTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Edit3, Trash2, Loader2, Search, Filter, X, ArrowLeft, ArrowRight, FolderTree } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatToYYYYMMDDWithTime } from '@/lib/date-utils';

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_ITEMS_PER_PAGE = ITEMS_PER_PAGE_OPTIONS[1];

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isSubmittingForm, setIsSubmittingForm] = useState(false);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [searchTermInput, setSearchTermInput] = useState('');
    const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCategories, setTotalCategories] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState<number>(DEFAULT_ITEMS_PER_PAGE);

    const fetchCategories = useCallback(async () => {
        console.log('fetchCategories called with:', { currentPage, itemsPerPage, appliedSearchTerm });
        setIsLoading(true);
        try {
            const result = await getCategories({
                page: currentPage,
                limit: itemsPerPage,
                searchTerm: appliedSearchTerm
            });
            console.log('fetchCategories result:', result);
            
            setCategories(result.categories);
            setTotalPages(result.totalPages);
            setTotalCategories(result.totalCount);
            
            console.log('Categories state updated, count:', result.categories.length);
        } catch (error) {
            console.error("Failed to fetch categories:", error);
            toast({ variant: "destructive", title: "載入錯誤", description: "無法載入分類。" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, currentPage, itemsPerPage, appliedSearchTerm]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleFormSubmit = async (data: CategoryFormInput) => {
        console.log('handleFormSubmit called with data:', data);
        console.log('editingCategory:', editingCategory);
        
        setIsSubmittingForm(true);
        try {
            let result;
            if (editingCategory) {
                console.log('Updating category:', editingCategory._id);
                result = await updateCategory(editingCategory._id, data);
                if (result.success && result.category) {
                    console.log('Category updated successfully:', result.category);
                    toast({ title: "分類已更新", description: `分類 "${result.category.name}" 已更新。` });
                }
            } else {
                console.log('Adding new category');
                result = await addCategory(data);
                if (result.success && result.category) {
                    console.log('Category added successfully:', result.category);
                    toast({ title: "分類已新增", description: `分類 "${result.category.name}" 已新增。` });
                }
            }

            console.log('Operation result:', result);

            if (result.success) {
                console.log('Success! Fetching categories...');
                await fetchCategories();
                setIsFormDialogOpen(false);
                setEditingCategory(null);
                console.log('Dialog closed and form reset');
            } else {
                console.error('Operation failed:', result.error, result.errors);
                toast({ variant: "destructive", title: result.error || "提交錯誤", description: result.errors?.map(e => e.message).join(", ") || "發生未知錯誤。" });
            }
        } catch (error) {
            console.error('Exception in handleFormSubmit:', error);
            toast({ variant: "destructive", title: "提交錯誤", description: "發生未知錯誤。" });
        } finally {
            setIsSubmittingForm(false);
        }
    };

    const openAddDialog = () => {
        setEditingCategory(null);
        setIsFormDialogOpen(true);
    };

    const openEditDialog = (category: Category) => {
        setEditingCategory(category);
        setIsFormDialogOpen(true);
    };

    const openDeleteDialog = (categoryId: string) => {
        setDeletingCategoryId(categoryId);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingCategoryId) return;
        setIsDeleting(true);
        const result = await deleteCategory(deletingCategoryId);
        if (result.success) {
            toast({ title: "分類已刪除", description: "分類已成功刪除。" });
            fetchCategories(); // Refetch or optimistically update
            // If current page becomes empty after deletion, go to previous page
            if (categories.length === 1 && currentPage > 1 && deletingCategoryId) {
                setCurrentPage(prev => prev - 1);
            }
        } else {
            toast({ variant: "destructive", title: "刪除錯誤", description: result.error });
        }
        setIsDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingCategoryId(null);
    };

    const handleApplySearch = (e?: React.FormEvent<HTMLFormElement>) => {
        if (e) e.preventDefault();
        setAppliedSearchTerm(searchTermInput);
        setCurrentPage(1); // Reset to first page on new search
    };

    const handleClearSearch = () => {
        setSearchTermInput('');
        setAppliedSearchTerm('');
        setCurrentPage(1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
            setCurrentPage(newPage);
        }
    };

    const handleItemsPerPageChange = (newSize: string) => {
        setItemsPerPage(parseInt(newSize, 10));
        setCurrentPage(1);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-foreground flex items-center">
                    <FolderTree className="mr-3 h-8 w-8 text-primary" /> 分類管理
                </h1>
                <Dialog open={isFormDialogOpen} onOpenChange={(isOpen) => {
                    setIsFormDialogOpen(isOpen);
                    if (!isOpen) setEditingCategory(null);
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#c3223d] hover:bg-[#c3223d]/90 text-white" onClick={openAddDialog}>
                            <PlusCircle className="mr-2 h-5 w-5" /> 添加分類
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogNativeHeader>
                            <DialogNativeTitle className="text-2xl">
                                {editingCategory ? "編輯分類" : "添加新分類"}
                            </DialogNativeTitle>
                            <DialogNativeDescription>
                                {editingCategory ? "修改分類詳細信息。" : "填寫新分類的詳細信息。"}
                            </DialogNativeDescription>
                        </DialogNativeHeader>
                        <CategoryForm
                            onSubmit={handleFormSubmit}
                            initialData={editingCategory}
                            isSubmitting={isSubmittingForm}
                            onCancel={() => { setIsFormDialogOpen(false); setEditingCategory(null); }}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center text-xl">
                        <Filter className="mr-2 h-5 w-5 text-primary" />
                        過濾 & 搜尋分類
                    </CardTitle>
                    <CardDescription>
                        {isLoading && totalCategories === 0 ? "載入中..." : `${totalCategories} 個分類已找到。`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleApplySearch} className="space-y-4 md:space-y-0 md:flex md:gap-4 md:items-end">
                        <div className="flex-grow">
                            <label htmlFor="searchTermCategories" className="block text-sm font-medium text-muted-foreground mb-1">按名稱搜尋</label>
                            <Input
                                id="searchTermCategories"
                                placeholder="輸入分類名稱..."
                                value={searchTermInput}
                                onChange={(e) => setSearchTermInput(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center pt-4 md:pt-0">
                            <Button type="submit" className="bg-[#c3223d] hover:bg-[#c3223d]/90 text-white" disabled={isLoading}>
                                <Search className="mr-2 h-4 w-4" /> 應用
                            </Button>
                            <Button type="button" variant="outline" onClick={handleClearSearch} disabled={isLoading || !appliedSearchTerm && !searchTermInput}>
                                <X className="mr-2 h-4 w-4" /> 清除
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>分類列表</CardTitle>
                    <CardDescription>管理您的產品分類。</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && categories.length === 0 ? (
                        <div className="space-y-3">
                            {/* Skeleton table */}
                            <div className="animate-pulse">
                                <div className="grid grid-cols-4 gap-4 py-2 border-b">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="h-4 bg-gray-200 rounded"></div>
                                    ))}
                                </div>
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="grid grid-cols-4 gap-4 py-3">
                                        {[1, 2, 3, 4].map(j => (
                                            <div key={j} className="h-4 bg-gray-200 rounded"></div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : !isLoading && categories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <FolderTree className="w-16 h-16 text-muted-foreground mb-4" />
                            <h3 className="text-xl font-semibold text-foreground">沒有找到分類</h3>
                            <p className="text-muted-foreground">
                                {appliedSearchTerm ? "沒有分類符合您的搜尋。" : "添加您的第一個分類。"}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>名稱</TableHead>
                                            <TableHead>描述</TableHead>
                                            <TableHead>建立時間</TableHead>
                                            <TableHead className="text-center">操作</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {categories.map((category) => (
                                            <TableRow key={category._id}>
                                                <TableCell className="font-medium">{category.name}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{category.description || 'N/A'}</TableCell>
                                                <TableCell>{formatToYYYYMMDDWithTime(category.createdAt!)}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center items-center space-x-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openEditDialog(category)}
                                                            title={`Edit ${category.name}`}
                                                            className="text-muted-foreground hover:text-white hover:bg-[#c3223d]"
                                                        >
                                                            <Edit3 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openDeleteDialog(category._id)}
                                                            title={`Delete ${category.name}`}
                                                            className="text-destructive hover:text-white hover:bg-[#c3223d]"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-6 gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">每頁顯示:</span>
                                        <Select
                                            value={itemsPerPage.toString()}
                                            onValueChange={handleItemsPerPageChange}
                                        >
                                            <SelectTrigger className="h-8 w-[70px]">
                                                <SelectValue placeholder={itemsPerPage.toString()} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ITEMS_PER_PAGE_OPTIONS.map(size => (
                                                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        第 {currentPage} 頁 / 共 {totalPages} 頁
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1 || isLoading}
                                        >
                                            <ArrowLeft className="mr-1 h-4 w-4" /> 上一頁
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages || isLoading}
                                        >
                                            下一頁 <ArrowRight className="ml-1 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogNativeTitle>您確定嗎？</AlertDialogNativeTitle>
                        <AlertDialogDescription>
                            此操作無法撤銷。此操作將永久刪除分類。
                            與此分類相關的產品可能需要重新分類。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingCategoryId(null)} disabled={isDeleting}>取消</AlertDialogCancel>
                        <Button onClick={handleDeleteConfirm} variant="destructive" disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            刪除分類
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
} 