"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/types";

/**
 * التحديث الفوري: عند أي تغيير يعيد تحميل بيانات الصفحة من الخادم (بنفس الصلاحيات).
 * - المصنع: قناة خاصة "factory-orders" تحمل الرقم والحالة فقط.
 * - المالك والمبيعات: تغييرات جدول orders (مفلترة بـ RLS في Supabase).
 * - الجميع: إشعاراتهم الخاصة.
 */
export function LiveUpdates({ role, userId }: { role: AppRole; userId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const notes = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
          refresh
        )
        .subscribe();
      channels.push(notes);

      if (role === "factory_admin") {
        channels.push(
          supabase
            .channel("factory-orders", { config: { private: true } })
            .on("broadcast", { event: "order_changed" }, refresh)
            .subscribe()
        );
      } else {
        channels.push(
          supabase
            .channel(`orders:${userId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
            .subscribe()
        );
      }
    })();

    // عند عودة التطبيق للواجهة (مثلاً بعد قفل الهاتف) نحدّث مباشرة
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [role, userId, router]);

  return null;
}
