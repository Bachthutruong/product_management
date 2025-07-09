"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importCustomers } from "@/app/(app)/customers/actions";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from 'xlsx';

interface CustomerImportData {
  name: string;
  customerCode?: string;
  email?: string;
  phone?: string;
  address?: string;
  categoryName?: string;
  notes?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  duplicates: number;
  updated: number;
}

interface ImportOptions {
  skipDuplicates: boolean;
  updateExisting: boolean;
}

export function ImportCustomersDialog({ onCustomersImported }: { onCustomersImported: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<CustomerImportData[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipDuplicates: true,
    updateExisting: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || 
          selectedFile.type === 'application/vnd.ms-excel' ||
          selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        setFile(selectedFile);
        parseFile(selectedFile);
      } else {
        toast({
          variant: "destructive",
          title: "檔案格式錯誤",
          description: "請選擇 CSV 或 Excel 檔案。",
        });
      }
    }
  };

  const parseFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        toast({
          variant: "destructive",
          title: "檔案格式錯誤",
          description: "檔案必須包含標題行和至少一行數據。",
        });
        return;
      }

      // Get headers (first row)
      const headers = jsonData[0].map((h: any) => String(h).toLowerCase().trim());
      
      // Map common column names
      const columnMapping: { [key: string]: keyof CustomerImportData } = {
        // Your exact column names
        'tên khách hàng': 'name',
        'mã khách hàng': 'customerCode',
        'mail': 'email',
        'điện thoại': 'phone',
        'địa chỉ': 'address',
        'phân loại khách hàng': 'categoryName',
        'note': 'notes',
        // Alternative Chinese names
        '客戶名稱': 'name',
        '姓名': 'name',
        '名稱': 'name',
        'name': 'name',
        '客戶編號': 'customerCode',
        '編號': 'customerCode',
        '客戶代碼': 'customerCode',
        'code': 'customerCode',
        '電子郵件': 'email',
        '郵件': 'email',
        'email': 'email',
        '電話': 'phone',
        '手機': 'phone',
        'phone': 'phone',
        '地址': 'address',
        'address': 'address',
        '分類': 'categoryName',
        '客戶分類': 'categoryName',
        '類型': 'categoryName',
        'category': 'categoryName',
        '備註': 'notes',
        '說明': 'notes',
        'notes': 'notes',
      };

             // Parse data rows
       const parsedData: CustomerImportData[] = [];
       for (let i = 1; i < jsonData.length; i++) {
         const row = jsonData[i];
         const customer: CustomerImportData = { name: '' };
         
         headers.forEach((header, index) => {
           const mappedField = columnMapping[header];
           if (mappedField && row[index] !== undefined && row[index] !== null && row[index] !== '') {
             const value = String(row[index]).trim();
             // Skip N/A values or treat them as empty
             if (value.toUpperCase() !== 'N/A' && value !== '') {
               customer[mappedField] = value;
             }
           }
         });

         if (customer.name) {
           parsedData.push(customer);
         }
       }

      if (parsedData.length === 0) {
        toast({
          variant: "destructive",
          title: "沒有找到有效數據",
          description: "請確保檔案包含客戶名稱欄位和有效數據。",
        });
        return;
      }

      setImportData(parsedData);
      setStep('preview');
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        variant: "destructive",
        title: "檔案解析錯誤",
        description: "無法解析檔案內容，請檢查檔案格式。",
      });
    }
  };

  const handleImport = async () => {
    if (importData.length === 0) return;

    setIsImporting(true);
    try {
      const result = await importCustomers(importData, importOptions);
      setImportResult(result);
      setStep('result');
      
      if (result.success && result.imported > 0) {
        toast({
          title: "導入成功",
          description: `成功導入 ${result.imported} 位客戶！`,
        });
        onCustomersImported();
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        variant: "destructive",
        title: "導入失敗",
        description: "導入過程中發生錯誤，請稍後再試。",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      ['phân loại khách hàng', 'mã khách hàng', 'Tên khách hàng', 'Mail', 'Điện thoại', 'Địa chỉ', 'Note'],
      ['新客戶', 'A0001', '安妮絲薇蜜艾麗', 'N/A', '07-3987869', 'N/A', '【統編：53883403】'],
      ['舊客戶', 'A0002', '靜之工藝', 'N/A', '06-6528349', '台北市信義區', '重要客戶'],
      ['新客戶', 'A0003', '靜乙七賢', 'N/A', 'N/A', 'N/A', '【正式客戶】'],
      ['新客戶', 'AW0000', 'Annie', 'annie@example.com', 'N/A', 'N/A', 'N/A']
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "客戶模板");
    XLSX.writeFile(wb, "客戶導入模板.xlsx");
  };

  const resetDialog = () => {
    setFile(null);
    setImportData([]);
    setImportResult(null);
    setStep('upload');
    setImportOptions({
      skipDuplicates: true,
      updateExisting: false
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => resetDialog(), 300); // Reset after animation
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          批量導入客戶
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            批量導入客戶
          </DialogTitle>
          <DialogDescription>
            從 CSV 或 Excel 檔案批量導入客戶資料
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">下載模板</CardTitle>
                <CardDescription>
                  建議先下載模板檔案，按照格式填入客戶資料
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={downloadTemplate} variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  下載 Excel 模板
                </Button>
              </CardContent>
            </Card>

                         <Card>
               <CardHeader>
                 <CardTitle className="text-lg">上傳檔案</CardTitle>
                 <CardDescription>
                   支援 CSV 和 Excel 格式 (.csv, .xls, .xlsx)<br/>
                   請確保檔案包含欄位: phân loại khách hàng, mã khách hàng, Tên khách hàng, Mail, Điện thoại, Địa chỉ, Note<br/>
                   <strong>注意：</strong>空白欄位或 "N/A" 值會被視為空值處理
                 </CardDescription>
               </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="file">選擇檔案</Label>
                    <Input
                      id="file"
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xls,.xlsx"
                      onChange={handleFileSelect}
                      className="mt-1"
                    />
                  </div>
                  {file && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        已選擇檔案: <strong>{file.name}</strong>
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

                         <Card>
               <CardHeader>
                 <CardTitle className="text-lg">欄位說明</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                     <p><strong>必填欄位:</strong></p>
                     <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                       <li>Tên khách hàng (name)</li>
                     </ul>
                   </div>
                   <div>
                     <p><strong>選填欄位:</strong></p>
                     <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                       <li>phân loại khách hàng</li>
                       <li>mã khách hàng</li>
                       <li>Mail</li>
                       <li>Điện thoại</li>
                       <li>Địa chỉ</li>
                       <li>Note</li>
                     </ul>
                     <p className="mt-2 text-xs text-orange-600">
                       * 可使用 "N/A" 表示空值
                     </p>
                   </div>
                 </div>
               </CardContent>
             </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">預覽數據</h3>
              <Badge variant="secondary">
                共 {importData.length} 筆資料
              </Badge>
            </div>
            
            {/* Import Options */}
            <div className="p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium mb-3">導入選項</h4>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="skipDuplicates"
                    checked={importOptions.skipDuplicates}
                    onCheckedChange={(checked) => 
                      setImportOptions(prev => ({ ...prev, skipDuplicates: checked as boolean }))
                    }
                  />
                  <Label htmlFor="skipDuplicates" className="text-sm">
                    跳過重複客戶 (推薦)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="updateExisting"
                    checked={importOptions.updateExisting}
                    onCheckedChange={(checked) => 
                      setImportOptions(prev => ({ ...prev, updateExisting: checked as boolean }))
                    }
                  />
                  <Label htmlFor="updateExisting" className="text-sm">
                    更新現有客戶資料 (如果存在重複)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * 重複檢測基於：客戶名稱、電子郵件或電話號碼
                </p>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
                             <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>phân loại khách hàng</TableHead>
                     <TableHead>mã khách hàng</TableHead>
                     <TableHead>Tên khách hàng</TableHead>
                     <TableHead>Mail</TableHead>
                     <TableHead>Điện thoại</TableHead>
                     <TableHead>Địa chỉ</TableHead>
                     <TableHead>Note</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {importData.slice(0, 10).map((customer, index) => (
                     <TableRow key={index}>
                       <TableCell>{customer.categoryName || '-'}</TableCell>
                       <TableCell>{customer.customerCode || '-'}</TableCell>
                       <TableCell className="font-medium">{customer.name}</TableCell>
                       <TableCell>{customer.email || '-'}</TableCell>
                       <TableCell>{customer.phone || '-'}</TableCell>
                       <TableCell className="max-w-32 truncate">{customer.address || '-'}</TableCell>
                       <TableCell className="max-w-32 truncate">{customer.notes || '-'}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
              {importData.length > 10 && (
                <div className="p-3 text-center text-sm text-muted-foreground border-t">
                  還有 {importData.length - 10} 筆資料未顯示...
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <h3 className="text-lg font-semibold">
                {importResult.success ? '導入完成' : '導入失敗'}
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">
                    {importResult.imported}
                  </div>
                  <p className="text-xs text-muted-foreground">成功導入</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">
                    {importResult.updated}
                  </div>
                  <p className="text-xs text-muted-foreground">更新現有</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-yellow-600">
                    {importResult.duplicates}
                  </div>
                  <p className="text-xs text-muted-foreground">重複跳過</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.failed}
                  </div>
                  <p className="text-xs text-muted-foreground">導入失敗</p>
                </CardContent>
              </Card>
            </div>

            {importResult.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-red-600">錯誤詳情</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-sm">
                      {importResult.errors.map((error, index) => (
                        <li key={index} className="text-red-600">
                          • {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button onClick={handleClose} variant="outline">
              取消
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button onClick={() => setStep('upload')} variant="outline">
                重新選擇
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    導入中...
                  </>
                ) : (
                  `確認導入 ${importData.length} 筆資料`
                )}
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              <Button onClick={() => setStep('upload')} variant="outline">
                再次導入
              </Button>
              <Button onClick={handleClose}>
                完成
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 