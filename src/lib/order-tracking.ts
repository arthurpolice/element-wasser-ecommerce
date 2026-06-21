export const SWISS_POST_CARRIER_CODE = 'SWISS_POST' as const

export function getSwissPostTrackingUrl(trackingNumber: string | null) {
  if (!trackingNumber) return null

  const url = new URL(
    'https://service.post.ch/EasyTrack/submitParcelData.do'
  )
  url.searchParams.set('formattedParcelCodes', trackingNumber)
  return url.toString()
}
