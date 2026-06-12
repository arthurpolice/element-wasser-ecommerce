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

**Cart**:
A customer's pre-checkout selection of products and quantities intended to become one order.
_Avoid_: Basket

**Order**:
A customer commitment to buy one or more products at recorded purchase terms. Cancellations apply to whole orders, and customer contact details are stored as order snapshots.
_Avoid_: Purchase, transaction

**Order Lifecycle Status**:
Whether the order as a whole is open, cancelled, or closed. This is distinct from payment outcome and fulfillment progress.
_Avoid_: Order Status, state

**Order Confirmation**:
The customer-facing page for one placed order after checkout, showing the order summary and current payment outcome.
_Avoid_: Receipt, thank-you page

**Order Line**:
One product entry inside an order, including purchase-time quantity, price, and cost.
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
Whether the merchant's operational completion of an order is unfulfilled, fulfilled, or cancelled.
_Avoid_: Delivery status, Order Lifecycle Status

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
A sellable catalog item with current price, current cost, inventory, manufacturer, slug, and SKU.
_Avoid_: Item, article

**Orderable Product**:
A product that can currently be placed into an order because it is active, exists in the catalog, and has enough available stock for the requested quantity.
_Avoid_: Available item

**Featured Product**:
A product deliberately promoted wherever it appears in storefront Category views. Category membership determines which Category views can feature the Product, including ancestor views.
_Avoid_: Featured item

**SKU**:
A system-assigned unique product code stored on products and copied onto order lines for support and operations. Structured as a brand prefix, a three-character manufacturer hint, a three-character product-name hint, and a sequence (for example `EW-BRI-WAT-00001`). Once assigned, a SKU never changes. The merchant does not assign or manage SKUs.
_Avoid_: Product ID

**Manufacturer**:
The company or brand responsible for a product; every product has exactly one manufacturer.
_Avoid_: Brand, supplier

**Category**:
A navigational grouping for products. Categories can be nested, and a product can appear in multiple categories. Catalog maintenance links each product to the categories where it should appear in the storefront.
_Avoid_: Collection, tag

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

**Shipping Charge**:
The flat CHF cent amount charged for shipping and stored on the order as a checkout snapshot.
_Avoid_: Shipping rule

**Discount**:
A product-level percentage reduction used for clearance sales and stored on orders as a CHF cent checkout snapshot.
_Avoid_: Coupon

**Payment**:
A payment attempt or money movement associated with an order. Checkout creates a pending payment for the selected payment method when the order is placed.
_Avoid_: Transaction

**Payment Provider**:
The external processor for a payment. Stripe is the provider for both card and TWINT payments.
_Avoid_: Payment method, gateway

**Payment Method**:
The customer's checkout choice for how they intend to pay, such as card or TWINT.
_Avoid_: Payment provider

**Order Payment Status**:
Whether an order has been paid, is awaiting payment, has only failed payment attempts, has been refunded, or can no longer be paid. A failed payment status does not by itself prevent retry while the order remains open and unexpired.
_Avoid_: Payment state
