import { format, isValid } from 'date-fns';

/**
 * Format date to yyyy/mm/dd format
 */
export function formatToYYYYMMDD(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValid(dateObj)) return 'Invalid Date';
  
  return format(dateObj, 'yyyy/MM/dd');
}

/**
 * Format date to yyyy/mm/dd HH:mm format
 */
export function formatToYYYYMMDDWithTime(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValid(dateObj)) return 'Invalid Date';
  
  return format(dateObj, 'yyyy/MM/dd HH:mm');
}

/**
 * Format date for display in calendar picker (still using PPP for readability)
 */
export function formatForCalendarDisplay(date: Date | null | undefined): string {
  if (!date) return '';
  
  if (!isValid(date)) return 'Invalid Date';
  
  return format(date, 'PPP');
}

/**
 * Format date to yyyy/mm/dd for form inputs
 */
export function formatForInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  
  if (!isValid(date)) return '';
  
  return format(date, 'yyyy-MM-dd');
} 