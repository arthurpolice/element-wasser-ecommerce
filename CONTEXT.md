# Element Wasser Ecommerce

This context describes commerce language for Element Wasser: catalog, checkout, orders, and customers.

## Language

**Customer**:
A person who places or may place orders, either as a registered user or as a guest. Customer email and name are required for checkout; registered customer name stays synced with the linked user. Registered customer email is captured during Customer Onboarding and displayed in the Customer Area, but is not editable there.
_Avoid_: User, account, buyer

**User**:
An authenticated identity used for sign-in, sessions, and credentials.
_Avoid_: Customer, account

**Guest Customer**:
A customer who checks out without a linked user.
_Avoid_: Anonymous user

**Registered Customer**:
A customer linked to exactly one authenticated user.
_Avoid_: Account, user profile

**Customer Area**:
The self-service area where a registered customer can view their own customer information and orders. Customer Area contact editing allows salutation, first name, and last name changes; email remains read-only.
_Avoid_: Account area, user profile

**Customer Onboarding**:
The step where a signed-in user provides the missing customer information required to become a registered customer.
_Avoid_: Account setup, profile completion

**Checkout**:
The customer-facing step where a customer provides or selects the information needed to place an order. Checkout supports both guest customers and registered customers; only registered customers use address book entries during checkout.
_Avoid_: Kasse

**Checkout Submission**:
One Customer confirmation to place an Order from Checkout. Repeating the same submission because of a timeout or network retry must resolve to the same Order and Active Payment Attempt.
_Avoid_: Checkout request, form submit

**Cart**:
A customer's pre-checkout selection of products and quantities intended to become one order.
_Avoid_: Basket

**Order**:
A customer commitment to buy one or more products at recorded purchase terms. Cancellations apply to whole orders, and customer contact details are stored as order snapshots.
_Avoid_: Purchase, transaction

**Order Origin**:
The channel where an Order was created: storefront checkout or the owner dashboard. Order Origin determines which automatic customer communications and payment workflows apply.
_Avoid_: Order source, creator

**Order Lifecycle Status**:
Whether the order as a whole is open, cancelled, or closed. This is distinct from payment outcome and fulfillment progress.
_Avoid_: Order Status, state

**Order Confirmation**:
The customer-facing page for one placed order after checkout, showing the order summary and current payment outcome.
_Avoid_: Receipt, thank-you page

**Order Access Link**:
A secure, expiring link that gives a Guest Customer access to one Order Confirmation without signing in. It grants access only to the referenced Order.
_Avoid_: Guest token, permanent order link

**Order Placed Email**:
A transactional email confirming that an Order was placed, while making no claim that its Payment succeeded. It gives the Customer a way to return to the Order Confirmation.
_Avoid_: Order Confirmation Email, payment receipt

**Payment Confirmation Email**:
A transactional email confirming that an Order's Payment succeeded.
_Avoid_: Order Placed Email, receipt

**New Paid Order Email**:
An internal merchant notification sent once when an Order first becomes paid.
_Avoid_: Payment Confirmation Email, new Order email

**Payment Failed Email**:
A transactional email informing the Customer that a Payment attempt failed and, while the Order remains open, directing them to retry payment.
_Avoid_: Order Failed Email

**Order Cancelled Email**:
A transactional email informing the Customer that the merchant explicitly cancelled the whole Order. Automatic Stock Reservation Expiry does not create this communication.
_Avoid_: Payment Cancelled Email

**Order Dispatched Email**:
A transactional email informing the Customer that the merchant handed the Order to the carrier. It does not claim that the Order was delivered.
_Avoid_: Order Fulfilled Email, Delivery Confirmation Email

**Email Notification**:
A single transactional communication owed to a Customer because a meaningful Order, Payment, or Fulfillment outcome occurred. Each Email Notification has one purpose and must not be delivered more than once.
_Avoid_: User email, marketing email

**Payment-scoped Email Notification**:
An Email Notification owed because of one specific Payment outcome. Its identity includes the Payment so separate attempts for the same Order can each create their own communication.
_Avoid_: Order payment email

**Order Line**:
One product entry inside an order, including purchase-time quantity, price, cost, and any recorded Product Shipping Weight.
_Avoid_: Order product, product reference

**Price**:
The amount charged to a customer for a product or order, stored as integer cents in CHF.
_Avoid_: Float price

**Cost**:
The merchant's purchase or fulfillment cost for a product, stored as integer cents in CHF and captured on order lines for margin reporting.
_Avoid_: Expense

**Fulfillment**:
The process of completing an order after it is placed.
_Avoid_: Delivery

**Fulfillment Status**:
Whether the merchant's operational handling of an order is unfulfilled, dispatched, fulfilled, or cancelled. An Order must be dispatched before it can be marked fulfilled.
_Avoid_: Delivery status, Order Lifecycle Status

**Dispatch**:
The point when the merchant hands an Order to the carrier. Dispatch does not mean the Order was delivered.
_Avoid_: Fulfillment, delivery

**Carrier**:
The delivery service that receives a dispatched Order from the merchant. Schweizerische Post is the only supported Carrier in the first version.
_Avoid_: Shipping method, fulfillment provider

**Fulfillment Completion**:
The merchant's manual confirmation that operational work for a dispatched Order is complete. It does not create a Customer email.
_Avoid_: Dispatch, automatic delivery confirmation

**Address Book Entry**:
A reusable registered-customer address selected or created during checkout and copied into the order.
_Avoid_: Order address

**Main Address Book Entry**:
The registered customer's preferred address book entry, shown first and preselected during checkout. When a registered customer has any address book entries, exactly one is main.
_Avoid_: Default address, primary address

**Shipping Address**:
The address snapshot stored on an order for fulfillment.
_Avoid_: Registered address, address reference

**Billing Address**:
The address snapshot stored on an order for invoicing and payment records.
_Avoid_: Payment address

**Product**:
A sellable catalog item with current price, current cost, optional Product Shipping Weight, inventory, manufacturer, slug, and SKU.
_Avoid_: Item, article

**Product Shipping Weight**:
The optional weight of one product unit used to determine shipping charges, stored in grams and representing the product as it should count for carrier pricing. A product without a Product Shipping Weight contributes no weight to shipping-price calculation.
_Avoid_: Product weight, package weight

**Orderable Product**:
A product that can currently be placed into an order because it is active, exists in the catalog, and has enough available stock for the requested quantity.
_Avoid_: Available item

**Featured Product**:
A product deliberately promoted wherever it appears in storefront Category views. Category membership determines which Category views can feature the Product, including ancestor views.
_Avoid_: Featured item

**Product Search**:
A global customer-facing product discovery mode that returns matching active Products for a customer's query, including Products that are temporarily not orderable. Category and Manufacturer can shape relevance or refinement, but are not standalone Product Search results.
_Avoid_: Storefront Search, site search, mixed search

**Product Search Relevance**:
How closely a Product matches a customer's Product Search query, with Product name and Manufacturer as the strongest signals, Category as discovery context, SKU as a precise lookup signal, and Product Description as supporting text. Featured Product status does not increase Product Search Relevance.
_Avoid_: Sort order, popularity, merchandising order

**Product Search Suggestion**:
A Product shown directly under the Product Search bar while the customer is typing, linking to the Product detail page.
_Avoid_: Autocomplete result, typeahead item

**SKU**:
A system-assigned unique product code stored on products and copied onto order lines for support and operations. Structured as a brand prefix, a three-character manufacturer hint, a three-character product-name hint, and a sequence (for example `EW-BRI-WAT-00001`). Once assigned, a SKU never changes. The merchant does not assign or manage SKUs.
_Avoid_: Product ID

**Manufacturer**:
The company or brand responsible for a product; every product has exactly one manufacturer.
_Avoid_: Brand, supplier

**Category**:
A navigational grouping for products. Categories can be nested, and a product can appear in multiple categories. Catalog maintenance links each product to the categories where it should appear in the storefront.
_Avoid_: Collection, tag

**Storefront-visible Category**:
An active Category whose subtree contains at least one active Product. It appears in storefront Category navigation; an active Category that is not storefront-visible can still be reached through its direct Category URL.
_Avoid_: Non-empty Category, populated Category

**Stock On Hand**:
The current physical quantity available in inventory before reservations.
_Avoid_: Inventory

**Stock Reserved**:
The quantity committed to placed orders that has not yet left inventory.
_Avoid_: Held inventory

**Available Stock**:
The quantity a customer can currently place into an order, calculated as Stock On Hand minus Stock Reserved.
_Avoid_: Available to user, free stock

**Stock Reservation**:
A commitment of stock to a placed order while payment or fulfillment is still pending. A payment-pending reservation can expire; a paid reservation remains committed until fulfillment or cancellation.
_Avoid_: Cart hold, lock

**Stock Reservation Expiry**:
The end of an Order's Payment Window, when an unpaid placed Order stops accepting payment and holding stock for the Customer. Expiry cancels the whole Order and releases its Stock Reservation only if Payment has not already succeeded.
_Avoid_: Cleanup, timeout job

**Payment Window**:
The period during which the Customer can complete Payment through the Active Payment Attempt while the Order's Stock Reservation remains held. It begins when the Payment Provider creates the payable session.
_Avoid_: Checkout timeout, Session lifetime

**Product Image**:
An optional image attached to a product for catalog presentation.
_Avoid_: Picture, media asset

**Product Description**:
Rich product content stored as structured JSON.
_Avoid_: HTML description

**Review**:
A moderated product rating and comment tied to a verified purchased order line; guests may review through a secure link.
_Avoid_: Testimonial, feedback

**Review Invite**:
A secure, expiring email link that lets a guest customer review a fulfilled order line.
_Avoid_: Review token

**Dispatch Estimate**:
The product-level business-day range shown before checkout for when an item is expected to ship.
_Avoid_: Delivery range prediction

**Order Number**:
A human-readable unique order identifier using the yearly Element Wasser sequence.
_Avoid_: Order ID

**Order Number Sequence**:
The yearly counter used to generate human-readable order numbers without races.
_Avoid_: Order count

**Order Total**:
The CHF cent amount charged for an order, broken down into subtotal, shipping, discount, and final total.
_Avoid_: Total price

**Order Shipping Weight**:
The total shipment weight used to determine an Order's shipping charge, calculated from each Order Line's purchase-time Product Shipping Weight and quantity.
_Avoid_: Total weight, cart weight

**Carrier Weight Limit**:
The maximum Order Shipping Weight accepted for one Order under the supported Carrier's shipping price tiers.
_Avoid_: Maximum cart weight, overweight threshold

**Customer Non-cancelled Order Value**:
The sum of Order Totals across a Customer's Orders whose Order Lifecycle Status is not cancelled. It describes retained Order value and does not imply that every included Order has been paid.
_Avoid_: Total spent, customer revenue

**Shipping Charge**:
The CHF cent amount charged for shipping and stored on the order as a checkout snapshot.
_Avoid_: Shipping rule

**Discount**:
A product-level percentage reduction used for clearance sales and stored on orders as a CHF cent checkout snapshot.
_Avoid_: Coupon

**Payment**:
A payment attempt or money movement associated with an order. Checkout creates a pending payment for the selected payment method when the order is placed.
_Avoid_: Transaction

**Active Payment Attempt**:
The one Payment attempt for an Order that can still succeed. A pending or authorized Payment is active; failed, cancelled, captured, and refunded Payments are historical outcomes.
_Avoid_: Current Payment, editable Payment

**Payment Attempt Replacement**:
Ending an Active Payment Attempt and starting a new one for the same Order, either with a different Payment Method or a fresh attempt using the same method.
_Avoid_: Edit Payment, change Payment

**Payment Retry**:
The Customer-facing action for continuing Payment on an open unpaid Order. A retry may resume Payment after failure or replace an Active Payment Attempt, but those implementation details are not exposed to the Customer.
_Avoid_: New Payment, Payment Attempt Replacement

**Payment History**:
The operational record of Payment attempts and money movements for an Order, available to the merchant for support and reconciliation. Customers see the Order Payment Status rather than attempt-level history.
_Avoid_: Customer payment timeline

**Payment Exception**:
A confirmed Payment outcome that conflicts with the Order's lifecycle or Stock Reservation outcome and requires merchant intervention, such as Payment captured after Order cancellation. The money outcome remains recorded without automatically reopening the Order.
_Avoid_: Payment error, failed Payment

**Payment Provider**:
The external processor for a payment. Stripe is the provider for both card and TWINT payments.
_Avoid_: Payment method, gateway

**Payment Method**:
The customer's checkout choice for how they intend to pay, such as card or TWINT.
_Avoid_: Payment provider

**Order Payment Status**:
The summary of an Order's Payment outcomes and whether it can still accept Payment. Successful Payment takes precedence over active, failed, and cancelled attempts; a failed status remains retryable while the Payment Window is open.
_Avoid_: Payment state
