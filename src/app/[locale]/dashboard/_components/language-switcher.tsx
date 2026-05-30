"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { dashSelectClass } from "~/app/[locale]/dashboard/_components/dashboard-ui";
import { usePathname, useRouter } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(nextLocale: Locale) {
    const query = Object.fromEntries(searchParams.entries());
    router.replace(
      {
        pathname,
        query,
      },
      { locale: nextLocale },
    );
  }

  return (
    <label className="flex items-center gap-2.5 text-sm text-dash-muted">
      <span className="sr-only">{t("label")}</span>
      <span
        aria-hidden="true"
        className="text-xs font-semibold uppercase tracking-wider"
      >
        {t("label")}
      </span>
      <select
        aria-label={t("label")}
        className={`${dashSelectClass} py-1.5 pl-2.5 pr-8 text-xs font-medium`}
        onChange={(event) => handleChange(event.target.value as Locale)}
        value={locale}
      >
        {routing.locales.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
