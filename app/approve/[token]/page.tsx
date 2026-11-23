"use client";

import { useParams } from "next/navigation";
import { ApprovePage } from "@/components/offerrequest";

export default function Approve() {
  const { token } = useParams<{ token: string }>();
  return <ApprovePage token={token} />;
}
