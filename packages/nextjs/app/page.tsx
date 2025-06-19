"use client";

// The lightweight build does not expose the original home page.
// Instead, we immediately redirect developers to the Knowledge Graph tab.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/graph");
  }, [router]);

  return null;
}
