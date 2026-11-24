"use client";

// Email links that open in the company's email app (Outlook or Gmail on the web), set per client in Brand.
// On phones we stay with mailto, which opens the phone's own mail app (Outlook, Gmail or Mail, whatever they use).
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { MailApp, mailProps } from "@/lib/mailapp";

const isPhone = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

export function useMail(app?: MailApp) {
  const params = useParams<{ client?: string }>();
  const { config } = useStore();
  const chosen = app ?? (params?.client ? config[params.client]?.mailApp : undefined) ?? "default";
  return (to: string, subject = "", body = "") => mailProps(isPhone() ? "default" : chosen, to, subject, body);
}

/** For pages outside the People Hub (no store), where the app comes from the server. */
export const mailFor = (app: string | undefined, to: string, subject = "", body = "") => mailProps(isPhone() ? "default" : (app as MailApp) || "default", to, subject, body);
