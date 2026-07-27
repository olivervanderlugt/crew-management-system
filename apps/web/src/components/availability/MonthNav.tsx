"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonthNavProps {
  year: number;
  month: number;
  label: string;
}

export function MonthNav({ year, month, label }: MonthNavProps) {
  const router = useRouter();

  function navigate(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    router.push(`/beschikbaarheid?year=${newYear}&month=${newMonth}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => navigate(-1)}
        aria-label="Vorige maand"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-[130px] text-center capitalize">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => navigate(1)}
        aria-label="Volgende maand"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
