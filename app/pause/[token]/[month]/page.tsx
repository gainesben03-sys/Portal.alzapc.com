"use client";

import { useParams } from "next/navigation";
import { PauseView } from "@/components/pause";

export default function PauseMonthPage() {
  const { token, month } = useParams<{ token: string; month: string }>();
  return <PauseView token={token} slug={month} />;
}
