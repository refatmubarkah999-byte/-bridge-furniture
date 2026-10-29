"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addColorsAction,
  createCatalogAction,
  deleteColorAction,
  updateCatalogAction,
  updateColorAction,
} from "@/app/actions/catalogs";
import { useFeedback } from "@/components/ui/Feedback";
import { PageHeader, EmptyState } from "@/components/ui/Bits";
import { Icon } from "@/components/Icon";
import type { ActionResult, FabricCatalog } from "@/lib/types";

export function CatalogsManager({ catalogs }: { catalogs: FabricCatalog[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [newName, setNewName] = useState("");
  const active = catalogs.filter((c) => c.is_active).length;
  const colors = catalogs.reduce((s, c) => s + c.colors.filter((x) => x.is_active).length, 0);

  function run(p: Promise<ActionResult>, ok: string, after?: () => void) {
    start(async () => {
      const r = await p;
      if (r.ok) {
        toast(ok);
        after?.();
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <div className="page max-w-4xl">
      <PageHeader title="الكتالوجات" subtitle={`${active} كتالوج · ${colors} رقم لون متاح — لكل الموديلات`} />

      <p className="mb-4 flex items-start gap-2 rounded-2xl bg-canvas p-3.5 text-sm text-muted ring-1 ring-line">
        <Icon name="note" className="mt-0.5 h-4 w-4 shrink-0 text-walnut-600" />
        موظف المبيعات يختار لكل منتج: الكتالوج ثم رقم اللون. المصنع يرى الكتالوج ورقم اللون على الطلبية. إيقاف لون أو حذفه لا يغيّر الطلبيات السابقة.
      </p>

      <form
        className="card mb-6 flex flex-wrap items-end gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(createCatalogAction(newName), "تمت إضافة الكتالوج.", () => setNewName(""));
        }}
      >
        <label className="block min-w-0 flex-1">
          <span className="label">كتالوج جديد</span>
          <input id="new-catalog" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="مثال: لينن برو" className="field" />
        </label>
        <button disabled={busy || !newName.trim()} className="btn-primary">
          <Icon name="plus" className="h-5 w-5" strokeWidth={2.2} />
          إضافة كتالوج
        </button>
      </form>

      {catalogs.length === 0 ? (
        <EmptyState icon="grid" title="لا توجد كتالوجات بعد" text="أضف أول كتالوج، ثم أضف أرقام ألوانه. بعدها يختار الموظفون منها في كل طلبية." />
      ) : (
        <div className="space-y-4">
          {catalogs.map((c) => (
            <CatalogCard key={c.id} catalog={c} busy={busy} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogCard({
  catalog,
  busy,
  run,
}: {
  catalog: FabricCatalog;
  busy: boolean;
  run: (p: Promise<ActionResult>, ok: string, after?: () => void) => void;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(catalog.name);
  const activeColors = catalog.colors.filter((x) => x.is_active).length;

  return (
    <section className={`card overflow-hidden ${catalog.is_active ? "" : "opacity-70"}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(updateCatalogAction(catalog.id, { name }), "تم تغيير الاسم.", () => setEditing(false));
            }}
          >
            <input id={`name-${catalog.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus className="field" />
            <button disabled={busy} className="btn-primary btn-sm h-12">حفظ</button>
            <button type="button" className="btn-ghost btn-sm h-12" onClick={() => { setEditing(false); setName(catalog.name); }}>إلغاء</button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {catalog.name}
                {!catalog.is_active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold">متوقف</span>}
              </h2>
              <p className="text-[13px] text-muted">{activeColors} رقم لون متاح{catalog.colors.length > activeColors ? ` · ${catalog.colors.length - activeColors} متوقف` : ""}</p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" className="h-4 w-4" />
              الاسم
            </button>
            <button
              type="button"
              disabled={busy}
              className="btn-secondary btn-sm"
              onClick={() =>
                run(updateCatalogAction(catalog.id, { is_active: !catalog.is_active }), catalog.is_active ? "تم إيقاف الكتالوج." : "تم تفعيل الكتالوج.")
              }
            >
              {catalog.is_active ? "إيقاف" : "تفعيل"}
            </button>
          </>
        )}
      </header>

      <div className="p-4">
        {catalog.colors.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {catalog.colors.map((x) => (
              <li
                key={x.id}
                className={`inline-flex items-center gap-1 rounded-xl py-1 pl-1 pr-2.5 ring-1 ${x.is_active ? "bg-surface ring-line-strong" : "bg-canvas text-muted ring-line line-through"}`}
              >
                <b className="ltr-nums">{x.code}</b>
                {x.name && <span className="text-[13px] text-ink/70">{x.name}</span>}
                <button
                  type="button"
                  disabled={busy}
                  title={x.is_active ? "إيقاف هذا اللون" : "تفعيل هذا اللون"}
                  aria-label={x.is_active ? `إيقاف لون ${x.code}` : `تفعيل لون ${x.code}`}
                  className="mr-1 rounded-lg p-1 text-muted hover:bg-walnut-50 hover:text-ink"
                  onClick={() => run(updateColorAction(x.id, { is_active: !x.is_active }), x.is_active ? `تم إيقاف لون ${x.code}.` : `تم تفعيل لون ${x.code}.`)}
                >
                  <Icon name={x.is_active ? "ban" : "refresh"} className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`حذف لون ${x.code}`}
                  className="rounded-lg p-1 text-muted hover:bg-rose-50 hover:text-rose-700"
                  onClick={async () => {
                    const { ok } = await confirm({
                      title: `حذف لون ${x.code}؟`,
                      message: "الطلبيات السابقة تحتفظ برقم اللون كما هو. لن يظهر اللون للاختيار بعد الآن.",
                      confirmLabel: "حذف",
                      tone: "danger",
                    });
                    if (ok) run(deleteColorAction(x.id), `تم حذف لون ${x.code}.`);
                  }}
                >
                  <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted">لا توجد أرقام ألوان بعد.</p>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(addColorsAction(catalog.id, adding), "تمت إضافة الألوان.", () => setAdding(""));
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="label">إضافة أرقام ألوان</span>
            <input
              id={`colors-${catalog.id}`}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="07 بيج، 12، 25 رمادي"
              className="field"
            />
            <span className="hint">الرقم أولاً ثم اسم اللون (اختياري). افصل بين الألوان بفاصلة لإضافة عدة ألوان مرة واحدة.</span>
          </label>
          <button disabled={busy || !adding.trim()} className="btn-secondary">إضافة</button>
        </form>
      </div>
    </section>
  );
}
