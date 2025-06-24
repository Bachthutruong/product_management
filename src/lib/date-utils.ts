import { format, isValid } from 'date-fns';

/**
 * 將日期格式化為 yyyy/mm/dd 格式
 */
export function formatToYYYYMMDD(date: Date | string | null | undefined): string {
  if (!date) return 'N/A'; // 翻譯: 不適用
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValid(dateObj)) return '無效日期'; // 翻譯: Invalid Date
  
  return format(dateObj, 'yyyy/MM/dd');
}

/**
 * 將日期格式化為 yyyy/mm/dd HH:mm 格式
 */
export function formatToYYYYMMDDWithTime(date: Date | string | null | undefined): string {
  if (!date) return 'N/A'; // 翻譯: 不適用
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValid(dateObj)) return '無效日期'; // 翻譯: Invalid Date
  
  return format(dateObj, 'yyyy/MM/dd HH:mm');
}

/**
 * 格式化日期以供日曆選擇器顯示 (中文格式)
 */
export function formatForCalendarDisplay(date: Date | null | undefined): string {
  if (!date) return '';
  
  if (!isValid(date)) return '無效日期'; // 翻譯: Invalid Date
  
  return format(date, 'yyyy年MM月dd日');
}

/**
 * 將日期格式化為 yyyy-MM-dd 以供表單輸入使用
 */
export function formatForInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  
  if (!isValid(date)) return '';
  
  return format(date, 'yyyy-MM-dd');
} 