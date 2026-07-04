import { setRequestLocale } from 'next-intl/server'

import { CustomerPersonalInformation } from '~/app/[locale]/customer-area/_components/customer-area-details'
import { CustomerAreaPageFrame } from '~/app/[locale]/customer-area/_components/customer-area-page-frame'
import {
  customerAreaPaths,
  loadCustomerArea,
  redirectToCustomerOnboarding
} from '~/app/[locale]/customer-area/_lib/load-customer-area'

type PersonalInformationPageProps = {
  params: Promise<{ locale: string }>
}

export default async function PersonalInformationPage({
  params
}: PersonalInformationPageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const path = customerAreaPaths.personalInformation
  const customerArea = await loadCustomerArea(locale, path)

  if (customerArea.status === 'needs-onboarding') {
    redirectToCustomerOnboarding(locale, path)
  }

  return (
    <CustomerAreaPageFrame>
      <CustomerPersonalInformation customer={customerArea.customer} />
    </CustomerAreaPageFrame>
  )
}
