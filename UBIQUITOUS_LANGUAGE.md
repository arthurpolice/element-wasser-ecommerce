# Ubiquitous Language

Element Wasser ecommerce — catalog, checkout, orders, payments, and customers. Canonical terms for domain discussions, issues, and tests.

## People & identity

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Customer** | A person who places or may place orders, as a guest or registered customer. | User, account, buyer |
| **User** | An authenticated identity used for sign-in, sessions, and credentials. | Customer, account |
| **Guest Customer** | A customer who checks out without a linked user. | Anonymous user |
| **Registered Customer** | A customer linked to exactly one user; name and email stay synced with that user. | Account, user profile |

## Catalog

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Catalog** | The mutable set of sellable products, categories, manufacturers, and current prices. | Shop, inventory list |
| **Product** | A sellable catalog item with current price, cost, stock, manufacturer, slug, and SKU. | Item, article |
| **Featured Product** | A Product deliberately promoted wherever it appears in storefront Category views. Category membership determines which Category views can feature it, including ancestor views. | Featured item |
| **SKU** | A system-assigned unique product code copied onto order lines for support and operations; structured as brand prefix, manufacturer hint, product-name hint, and sequence (for example `EW-BRI-WAT-00001`). Once assigned, never changes. | Product ID |
| **Manufacturer** | The company or brand responsible for a product; every product has exactly one. | Brand, supplier |
| **Category** | A navigational grouping for products; categories nest and products may belong to several. Catalog maintenance links each product to the categories where it should appear in the storefront. | Collection, tag |
| **Product Image** | An optional image attached to a product for catalog presentation. | Picture, media asset |
| **Product Description** | Rich product content stored as structured JSON. | HTML description |
| **Dispatch Estimate** | The product-level business-day range shown before checkout for expected ship timing. | Delivery range, lead time |

## Inventory

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Stock On Hand** | The current physical quantity available before reservations. | Inventory, available stock |
| **Stock Reserved** | Quantity committed to placed orders that has not yet left inventory. | Held inventory, allocated stock |
| **Stock Reservation** | The temporary hold on stock while an order's payment is pending (15 minutes). | Lock, hold |

## Checkout & cart

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Cart** | The pre-checkout selection of products and quantities, stored in browser local storage only. | Basket, saved cart |
| **Checkout** | The flow where a customer confirms contact, addresses, and payment before an order is placed. | Purchase flow |
| **Checkout Snapshot** | Purchase-time values copied onto an order so later catalog or address changes do not alter history. | Order copy, frozen data |

## Orders & pricing

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Order** | A customer commitment to buy one or more products at recorded purchase terms. | Purchase, transaction |
| **Order Line** | One product entry inside an order with purchase-time quantity, price, cost, and discount. | Order product, line item |
| **Order Number** | A human-readable unique order identifier from the yearly Element Wasser sequence. | Order ID |
| **Order Number Sequence** | The yearly counter that generates order numbers without races. | Order count |
| **Price** | The amount charged to a customer, stored as integer cents in CHF. | Float price |
| **List Price** | The pre-discount unit price captured on an order line at checkout. | Original price |
| **Unit Price** | The final per-unit price charged on an order line after any product discount. | Sale price |
| **Cost** | The merchant's purchase or fulfillment cost for a product, stored as integer cents in CHF. | Expense |
| **Order Total** | The CHF cent amount charged for an order: subtotal, shipping, discount, and final total. | Total price |
| **Shipping Charge** | The flat CHF cent shipping fee stored on the order as a checkout snapshot. | Shipping rule, delivery fee |
| **Discount** | A product-level percentage reduction for clearance; stored on orders as a CHF cent snapshot. | Coupon, promo code |

## Order lifecycle

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Order Status** | Whether the order as a whole is placed, cancelled, or completed. | State |
| **Order Payment Status** | Whether the order has been paid, is pending, failed, refunded, or cancelled for payment. | Payment state |
| **Fulfillment Status** | Whether the order is unfulfilled, fulfilled, or cancelled for fulfillment. | Delivery status, shipping status |
| **Fulfillment** | The process of completing an order after it is placed. | Delivery, shipment |

## Addresses

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Address Book Entry** | A reusable registered-customer address selected at checkout and copied into the order. | Address, saved address |
| **Shipping Address** | The address snapshot stored on an order for fulfillment. | Registered address, address reference |
| **Billing Address** | The address snapshot stored on an order for invoicing and payment records. | Payment address |

## Payments

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Payment** | A single payment attempt or money movement (charge or refund) linked to an order. | Transaction |
| **Payment Provider** | The external processor for a payment attempt (Stripe or TWINT). | Gateway, processor |
| **Payment Expiry** | The deadline after which an unpaid order's stock reservation is released. | Timeout |

## Reviews

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Review** | A moderated product rating and comment tied to a verified purchased order line. | Testimonial, feedback |
| **Review Invite** | A secure, expiring email link that lets a guest customer review a fulfilled order line. | Review token |

## Relationships

- A **User** may link to at most one **Registered Customer**; a **Guest Customer** has no linked **User**.
- A **Customer** places zero or more **Orders**; each **Order** belongs to exactly one **Customer**.
- An **Order** contains one or more **Order Lines**; each **Order Line** references one **Product** and stores checkout snapshots of name, SKU, prices, and cost.
- An **Order** has exactly one **Shipping Address** snapshot and one **Billing Address** snapshot (billing may match shipping).
- A **Registered Customer** has zero or more **Address Book Entries**; checkout copies a selected entry into the **Order** snapshots.
- Placing an **Order** creates a **Stock Reservation** on each line's quantity; **Payment Expiry** releases **Stock Reserved** if unpaid.
- An **Order** may have multiple **Payment** records (retries or providers); **Order Payment Status** reflects the order-level outcome.
- A **Review** belongs to exactly one **Order Line** and one **Product**; a **Review Invite** belongs to exactly one **Order Line**.
- A **Featured Product** is always a **Product**.
- A **Product** belongs to exactly one **Manufacturer** and may appear in multiple **Categories**.
- **Product** membership in **Categories** is maintained when creating or editing the **Product**; Featured Product status belongs to the **Product** and applies wherever that **Product** appears through Category membership.
- **Stock On Hand** and **Stock Reserved** apply per **Product**; available sellable quantity is on hand minus reserved.

## Example dialogue

> **Dev:** "When a **Guest Customer** finishes **Checkout**, do we create a **User**?"
>
> **Domain expert:** "No. We create a **Guest Customer** and an **Order** with **Checkout Snapshots** for contact, **Shipping Address**, and **Billing Address**. Only **Registered Customers** link to a **User**."
>
> **Dev:** "So the **Cart** becomes an **Order** at place time, and we **reserve stock** for 15 minutes?"
>
> **Domain expert:** "Exactly. **Stock Reserved** increases until **Payment Expiry** or successful **Payment**. Each **Order Line** keeps its own **List Price**, **Unit Price**, and **Cost** — changing the **Catalog** later must not rewrite old orders."
>
> **Dev:** "If they pay with TWINT after a failed Stripe attempt, are those two **Payments**?"
>
> **Domain expert:** "Yes — separate **Payment** records, same **Order**. **Order Payment Status** moves to paid when one succeeds. **Fulfillment** only starts once the order is paid and **Fulfillment Status** is still unfulfilled."

## Flagged ambiguities

- **"Account"** is overloaded: Better Auth **Account** (OAuth/credential linkage for a **User**) is not a **Customer** or **Registered Customer**. Use **User** / **Registered Customer** in commerce language; reserve "account" for auth only when unavoidable in code.
- **"User" vs Customer"**: sign-in identity (**User**) and commerce actor (**Customer**) are distinct. A **Guest Customer** never has a **User**; do not call guests "users."
- **"Delivery" vs Fulfillment"**: customer-facing ship timing is a **Dispatch Estimate**; post-payment completion is **Fulfillment**. Avoid "delivery" as the order lifecycle term.
- **"Inventory" vs stock"**: **Stock On Hand** and **Stock Reserved** are the precise quantities; "inventory" is vague and often confused with the whole **Catalog**.
- **"Product ID" vs SKU"**: internal database ids are implementation details; **SKU** is the merchant-facing product code on **Order Lines** and in support.
- **"Order ID" vs Order Number"**: customer-facing and operational references use **Order Number**; internal cuid ids stay in persistence layers only.
- **"Address" in code vs domain"**: the reusable customer record is an **Address Book Entry**; fields copied onto an **Order** are **Shipping Address** or **Billing Address** snapshots — not live links to the book entry.
- **"Discount" vs coupon"**: clearance pricing is a product-level percentage reflected as cent snapshots on the **Order**; there are no coupon codes in the current model.
- **"Payment" vs transaction"**: a **Payment** is one provider attempt or refund; **Order Payment Status** summarizes whether the **Order** is paid overall.
- **"Highlight" vs Featured Product"**: "highlight" may be used as a UI action label, but the domain term is **Featured Product**.
