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
        setIsLoading(true);
        try {
            const result = await getCategories({
                page: currentPage,
                limit: itemsPerPage,
                searchTerm: appliedSearchTerm
            });
            setCategories(result.categories);
            setTotalPages(result.totalPages);
            setTotalCategories(result.totalCount);
        } catch (error) {
            console.error("Failed to fetch categories:", error);
            toast({ variant: "destructive", title: "Loading Error", description: "Could not load categories." });
        } finally {
            setIsLoading(false);
        }
    }, [toast, currentPage, itemsPerPage, appliedSearchTerm]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleFormSubmit = async (data: CategoryFormInput) => {
        setIsSubmittingForm(true);
        try {
            let result;
            if (editingCategory) {
                result = await updateCategory(editingCategory._id, data);
                if (result.success && result.category) {
                    toast({ title: "Category Updated", description: `Category "${result.category.name}" has been updated.` });
                }
            } else {
                result = await addCategory(data);
                if (result.success && result.category) {
                    toast({ title: "Category Added", description: `Category "${result.category.name}" has been added.` });
                }
            }

            if (result.success) {
                fetchCategories();
                setIsFormDialogOpen(false);
                setEditingCategory(null);
            } else {
                toast({ variant: "destructive", title: result.error || "Submission Error", description: result.errors?.map(e => e.message).join(", ") || "An unknown error occurred." });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Submission Error", description: "An unexpected error occurred." });
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
            toast({ title: "Category Deleted", description: "Category has been successfully deleted." });
            fetchCategories(); // Refetch or optimistically update
            // If current page becomes empty after deletion, go to previous page
            if (categories.length === 1 && currentPage > 1 && deletingCategoryId) {
                setCurrentPage(prev => prev - 1);
            }
        } else {
            toast({ variant: "destructive", title: "Error Deleting Category", description: result.error });
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
                    <FolderTree className="mr-3 h-8 w-8 text-primary" /> Category Management
                </h1>
                <Dialog open={isFormDialogOpen} onOpenChange={(isOpen) => {
                    setIsFormDialogOpen(isOpen);
                    if (!isOpen) setEditingCategory(null);
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openAddDialog}>
                            <PlusCircle className="mr-2 h-5 w-5" /> Add Category
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogNativeHeader>
                            <DialogNativeTitle className="text-2xl">
                                {editingCategory ? "Edit Category" : "Add New Category"}
                            </DialogNativeTitle>
                            <DialogNativeDescription>
                                {editingCategory ? "Modify the category details." : "Fill in the new category details."}
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
                        Filter & Search Categories
                    </CardTitle>
                    <CardDescription>
                        {isLoading && totalCategories === 0 ? "Loading..." : `${totalCategories} categories found.`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleApplySearch} className="space-y-4 md:space-y-0 md:flex md:gap-4 md:items-end">
                        <div className="flex-grow">
                            <label htmlFor="searchTermCategories" className="block text-sm font-medium text-muted-foreground mb-1">Search by Name</label>
                            <Input
                                id="searchTermCategories"
                                placeholder="Enter category name..."
                                value={searchTermInput}
                                onChange={(e) => setSearchTermInput(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 items-center pt-4 md:pt-0">
                            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                                <Search className="mr-2 h-4 w-4" /> Apply
                            </Button>
                            <Button type="button" variant="outline" onClick={handleClearSearch} disabled={isLoading || !appliedSearchTerm && !searchTermInput}>
                                <X className="mr-2 h-4 w-4" /> Clear
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Category List</CardTitle>
                    <CardDescription>Manage your product categories.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && categories.length === 0 && totalCategories === 0 ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : !isLoading && categories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <FolderTree className="w-16 h-16 text-muted-foreground mb-4" />
                            <h3 className="text-xl font-semibold text-foreground">No Categories Found</h3>
                            <p className="text-muted-foreground">
                                {appliedSearchTerm ? "No categories match your search." : "Add your first category."}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Created At</TableHead>
                                            <TableHead className="text-center">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {categories.map((category) => (
                                            <TableRow key={category._id}>
                                                <TableCell className="font-medium">{category.name}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{category.description || 'N/A'}</TableCell>
                                                <TableCell>{format(new Date(category.createdAt!), 'dd/MM/yy HH:mm')}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center items-center space-x-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openEditDialog(category)}
                                                            title={`Edit ${category.name}`}
                                                            className="text-muted-foreground hover:text-primary"
                                                        >
                                                            <Edit3 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openDeleteDialog(category._id)}
                                                            title={`Delete ${category.name}`}
                                                            className="text-destructive hover:text-destructive/80"
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
                                        <span className="text-sm text-muted-foreground">Rows per page:</span>
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
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1 || isLoading}
                                        >
                                            <ArrowLeft className="mr-1 h-4 w-4" /> Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages || isLoading}
                                        >
                                            Next <ArrowRight className="ml-1 h-4 w-4" />
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
                        <AlertDialogNativeTitle>Are you sure?</AlertDialogNativeTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the category.
                            Any products associated with this category might need to be re-categorized.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingCategoryId(null)} disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <Button onClick={handleDeleteConfirm} variant="destructive" disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete Category
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
} 