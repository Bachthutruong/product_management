import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format currency number to Vietnamese format with comma as thousand separator
 * @param amount - The number to format
 * @param showCurrency - Whether to show $ symbol (default: true)
 * @returns Formatted string like "$1,234" or "1,234"
 */
export function formatCurrency(amount: number, showCurrency: boolean = true): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  return showCurrency ? `$${formatted}` : formatted;
}
