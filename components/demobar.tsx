"use client";

import { DEMO_SITE } from "@/lib/state";
import { DEFAULT_BOOKING_URL } from "@/lib/state";

/** A thin strip on the public demo so nobody mistakes sample data for a real company. */
export function DemoBar() {
  if (!DEMO_SITE) return null;
  return (
    <div className="demo-bar">
      <span>Demo with a made-up company and sample data.</span>
      <a href={DEFAULT_BOOKING_URL} target="_blank" rel="noopener noreferrer">Book a call</a>
      <a href="/">Start over</a>
    </div>
  );
}
