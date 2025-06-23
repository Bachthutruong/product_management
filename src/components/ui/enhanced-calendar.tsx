"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DatePickerCalendarProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
}

function DatePickerCalendar({ selected, onSelect, disabled, className }: DatePickerCalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => selected || new Date());

  const currentYear = currentMonth.getFullYear();
  const currentMonthIndex = currentMonth.getMonth();

  const handleYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10);
    if (!isNaN(year)) {
      const newDate = new Date(year, currentMonthIndex, 1);
      setCurrentMonth(newDate);
    }
  };

  const handleMonthChange = (monthStr: string) => {
    const month = parseInt(monthStr, 10);
    if (!isNaN(month)) {
      const newDate = new Date(currentYear, month, 1);
      setCurrentMonth(newDate);
    }
  };

  // Generate years from 1900 to 2100
  const years = React.useMemo(() => {
    const yearArray = [];
    for (let year = 2100; year >= 1900; year--) {
      yearArray.push(year);
    }
    return yearArray;
  }, []);

  const months = [
    "1 月", "2 月", "3 月", "4 月", "5 月", "6 月",
    "7 月", "8 月", "9 月", "10 月", "11 月", "12 月"
  ];

  // Custom formatter for weekday headers in Traditional Chinese
  const formatWeekdayName = (date: Date) => {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    return weekdays[date.getDay()];
  };

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-4 space-y-4">
      {/* Year and Month Selectors */}
      <div className="flex items-center justify-center gap-3 pb-2 border-b border-border">
        <Select value={currentMonthIndex.toString()} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-[140px] h-9 text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((month, index) => (
              <SelectItem key={index} value={index.toString()}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentYear.toString()} onValueChange={handleYearChange}>
          <SelectTrigger className="w-[100px] h-9 text-sm font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Regular Calendar */}
      <Calendar
        mode="single"
        selected={selected}
        onSelect={onSelect}
        disabled={disabled}
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        className={cn("", className)}
        formatters={{
          formatWeekdayName: formatWeekdayName,
        }}
        classNames={{
          day: "h-10 w-10 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground transition-colors",
          day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md font-medium",
          day_today: "bg-accent text-accent-foreground font-medium rounded-md",
        }}
      />
    </div>
  );
}

export { DatePickerCalendar } 