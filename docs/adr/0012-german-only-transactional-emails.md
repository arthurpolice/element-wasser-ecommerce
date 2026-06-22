# Keep transactional emails German-only

Element Wasser sends all Customer and merchant transactional emails in German and links them to the German Order Confirmation route. The English storefront route exists to make development and interface testing easier; it is not a supported communication language, so Checkout Locale is deliberately not persisted on Orders or Email Notifications.

Status: accepted
