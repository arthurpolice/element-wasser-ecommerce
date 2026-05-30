import { getTranslations } from "next-intl/server";

import { Link } from "~/i18n/navigation";

export default async function AccessDeniedPage() {
  const t = await getTranslations("AccessDenied");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="mt-3 text-sm text-slate-600">{t("description")}</p>
        <Link
          className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          href="/"
        >
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
