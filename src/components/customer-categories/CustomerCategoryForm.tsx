"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { type CustomerCategory, type CreateCustomerCategoryInput } from '@/models/CustomerCategory';

interface CustomerCategoryFormProps {
  initialData?: CustomerCategory;
  onSubmit: (data: CreateCustomerCategoryInput) => void | Promise<void>;
}

export function CustomerCategoryForm({ initialData, onSubmit }: CustomerCategoryFormProps) {
  const [formData, setFormData] = useState<CreateCustomerCategoryInput>({
    name: initialData?.name || '',
    code: initialData?.code, // Only set for editing existing categories
    description: initialData?.description || '',
    isActive: initialData?.isActive ?? true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '分類名稱為必填項目';
    }

    // Only validate code if it's provided (for editing existing categories)
    if (formData.code !== undefined) {
      if (!formData.code.trim()) {
        newErrors.code = '分類代碼為必填項目';
      } else if (!/^[A-Z_]+$/.test(formData.code)) {
        newErrors.code = '分類代碼只能包含大寫字母和底線';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof CreateCustomerCategoryInput, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field as string]) {
      setErrors(prev => ({ ...prev, [field as string]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">分類名稱 *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          placeholder="請輸入分類名稱"
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && (
          <p className="text-sm text-red-500">{errors.name}</p>
        )}
      </div>

      {/* Only show code field when editing existing categories */}
      {initialData && (
        <div className="space-y-2">
          <Label htmlFor="code">分類代碼 *</Label>
          <Input
            id="code"
            value={formData.code || ''}
            onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
            placeholder="請輸入分類代碼 (例如: RETAIL)"
            className={errors.code ? 'border-red-500' : ''}
          />
          {errors.code && (
            <p className="text-sm text-red-500">{errors.code}</p>
          )}
          <p className="text-sm text-muted-foreground">
            只能使用大寫字母和底線，例如：RETAIL、ODM_OFFICIAL
          </p>
        </div>
      )}

      {/* Show auto-generation message for new categories */}
      {!initialData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            📝 分類代碼將自動根據分類名稱產生，您無需手動輸入
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">描述</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          placeholder="請輸入分類描述（可選）"
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => handleInputChange('isActive', checked)}
        />
        <Label htmlFor="isActive">啟用此分類</Label>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? '處理中...' : (initialData ? '更新' : '新增')}
        </Button>
      </div>
    </form>
  );
} 