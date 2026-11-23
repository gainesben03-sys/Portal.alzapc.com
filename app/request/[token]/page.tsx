"use client";

import { useParams } from "next/navigation";
import { RequestForm } from "@/components/offerrequest";

export default function RequestPage() {
  const { token } = useParams<{ token: string }>();
  return <RequestForm token={token} />;
}
