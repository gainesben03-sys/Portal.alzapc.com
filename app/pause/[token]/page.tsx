"use client";

import { useParams } from "next/navigation";
import { PauseView } from "@/components/pause";

export default function PausePage() {
  const { token } = useParams<{ token: string }>();
  return <PauseView token={token} />;
}
