"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Loader2, FileUp, FileCheck2, ArrowRight } from "lucide-react";
import * as XLSX from 'xlsx';
import { importOrders } from "@/app/(app)/orders/actions";

type Step = 'uploadOrders' | 'uploadItems' | 'preview' | 'result';

interface OrderData { [key: string]: any; }
interface ItemData { [key: string]: any; }

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}

export function ImportOrdersDialog({ onOrdersImported }: { onOrdersImported: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<Step>('uploadOrders');
  
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  
  const [ordersData, setOrdersData] = useState<OrderData[]>([]);
  const [itemsData, setItemsData] = useState<ItemData[]>([]);
  
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  const ordersFileInputRef = useRef<HTMLInputElement>(null);
  const itemsFileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, fileType: 'orders' | 'items') => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type.includes('csv') || selectedFile.type.includes('sheet')) {
        if (fileType === 'orders') setOrdersFile(selectedFile);
        else setItemsFile(selectedFile);
      } else {
        toast({ variant: "destructive", title: "檔案格式錯誤", description: "請選擇 CSV 或 Excel 檔案。" });
      }
    }
  };

  const parseFile = async (file: File, fileType: 'orders' | 'items') => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

      if (jsonData.length === 0) {
        toast({ variant: "destructive", title: "檔案為空", description: "檔案不包含任何數據。" });
        return;
      }
      
      // Mapping to normalize different header names to a canonical version
      const keyMapping: { [key: string]: string } = {
        // Vietnamese -> Canonical
        'ngay tao don hang': 'ngay tao don hang',
        'ma don hang': 'ma don hang',
        'tong tien don hang': 'tong tien don hang',
        'mã khách hàng': 'ma khach hang', // Fixes the accent issue
        'note don hang': 'note don hang',
        'ma san pham': 'ma san pham',
        'ten san pham': 'ten san pham',
        'số lượng': 'so luong',
        'so luong': 'so luong',
        'đơn vị': 'don vi',
        'don vi': 'don vi',
        'đơn giá': 'don gia',
        'don gia': 'don gia',
        'thành tiền': 'thanh tien',
        'thanh tien': 'thanh tien',

        // Chinese -> Canonical (as provided by user)
        '數量': 'so luong',
        '單位': 'don vi',
        '單位.': 'don vi',
        '單價': 'don gia',
        '單價.': 'don gia',
        '金額': 'thanh tien',
        '金額.': 'thanh tien',
      };
      
      const transformedData = jsonData.map(row => {
          const newRow: {[key: string]: any} = {};
          for(const key in row) {
              const normalizedKey = key.toLowerCase().trim();
              const mappedKey = keyMapping[normalizedKey] || normalizedKey;
              newRow[mappedKey] = row[key];
          }
          return newRow;
      });

      if (fileType === 'orders') {
        setOrdersData(transformedData);
        setStep('uploadItems');
      } else {
        setItemsData(transformedData);
        setStep('preview');
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({ variant: "destructive", title: "檔案解析錯誤", description: `無法解析 ${file.name}。` });
    }
  };

  const handleImport = async () => {
    if (ordersData.length === 0 || itemsData.length === 0 || !user) return;
    setIsImporting(true);
    try {
      const result = await importOrders(ordersData, itemsData, user._id, user.name);
      setImportResult(result);
      setStep('result');
      if (result.success) {
        toast({ title: "導入成功", description: `成功導入 ${result.imported} 筆訂單！` });
        onOrdersImported();
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({ variant: "destructive", title: "導入失敗", description: "導入過程中發生錯誤。" });
    } finally {
      setIsImporting(false);
    }
  };

  const resetDialog = () => {
    setStep('uploadOrders');
    setOrdersFile(null);
    setItemsFile(null);
    setOrdersData([]);
    setItemsData([]);
    setImportResult(null);
    if (ordersFileInputRef.current) ordersFileInputRef.current.value = '';
    if (itemsFileInputRef.current) itemsFileInputRef.current.value = '';
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(resetDialog, 300);
    }
  };
  
  const renderStepContent = () => {
    switch (step) {
      case 'uploadOrders':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-primary" />
                <span>步驟 1: 上傳訂單列表檔案</span>
              </CardTitle>
              <CardDescription>
                請選擇包含主要訂單資訊的檔案 (e.g., ma don hang, ma khach hang, tong tien don hang)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input id="ordersFile" ref={ordersFileInputRef} type="file" accept=".csv,.xls,.xlsx" onChange={(e) => handleFileSelect(e, 'orders')} />
              {ordersFile && <p className="mt-2 text-sm text-muted-foreground">已選擇: {ordersFile.name}</p>}
              <Button onClick={() => ordersFile && parseFile(ordersFile, 'orders')} disabled={!ordersFile} className="mt-4">
                下一步 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        );
      case 'uploadItems':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-green-500" />
                <span>步驟 2: 上傳訂單詳情檔案</span>
              </CardTitle>
              <CardDescription>
                請選擇包含訂單商品詳情的檔案 (e.g., ma don hang, ma san pham, so luong, don gia)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input id="itemsFile" ref={itemsFileInputRef} type="file" accept=".csv,.xls,.xlsx" onChange={(e) => handleFileSelect(e, 'items')} />
              {itemsFile && <p className="mt-2 text-sm text-muted-foreground">已選擇: {itemsFile.name}</p>}
              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => setStep('uploadOrders')}>返回</Button>
                <Button onClick={() => itemsFile && parseFile(itemsFile, 'items')} disabled={!itemsFile}>
                  預覽數據 <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      case 'preview':
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">預覽數據</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">訂單總數</CardTitle>
                        </CardHeader>
                        <CardContent><p className="text-2xl font-bold">{ordersData.length}</p></CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">商品項目總數</CardTitle>
                        </CardHeader>
                        <CardContent><p className="text-2xl font-bold">{itemsData.length}</p></CardContent>
                    </Card>
                </div>
                <p className="text-sm text-muted-foreground">
                    系統將根據 `ma don hang` 欄位來匹配訂單和商品。請確認數據數量是否正確。
                </p>
            </div>
        );
      case 'result':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {importResult?.success ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
              <h3 className="text-lg font-semibold">{importResult?.success ? '導入完成' : '導入過程中有錯誤'}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{importResult?.imported || 0}</div>
                  <p className="text-xs text-muted-foreground">成功導入</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{importResult?.failed || 0}</div>
                  <p className="text-xs text-muted-foreground">導入失敗</p>
                </CardContent>
              </Card>
            </div>
            {importResult?.errors && importResult.errors.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-red-600">錯誤詳情</CardTitle></CardHeader>
                <CardContent>
                  <div className="max-h-40 overflow-y-auto bg-muted p-2 rounded-md">
                    <ul className="space-y-1 text-sm">
                      {importResult.errors.map((error, index) => <li key={index}>• {error}</li>)}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          批量導入訂單
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>批量導入訂單</span>
          </DialogTitle>
          <DialogDescription>
            通過上傳兩個檔案來導入訂單和其詳細項目。
          </DialogDescription>
        </DialogHeader>
        
        {renderStepContent()}

        <DialogFooter className="mt-4">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('uploadItems')}>返回</Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />導入中...</> : `確認導入`}
              </Button>
            </>
          )}
           {step === 'result' && (
             <>
              <Button variant="outline" onClick={resetDialog}>再次導入</Button>
              <Button onClick={() => handleOpenChange(false)}>完成</Button>
             </>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 