import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 將數字格式化為繁體中文 (台灣) 的貨幣格式，使用逗號作為千分位分隔符號並加上 NT$ 符號。
 * @param amount - 要格式化的數字
 * @param showCurrency - 是否顯示 NT$ 符號 (預設: true)
 * @returns 格式化後的字串，例如 "NT$1,234" 或 "1,234"
 */
export function formatCurrency(amount: number, showCurrency: boolean = true): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  return showCurrency ? `NT$${formatted}` : formatted;
}
