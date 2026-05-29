# Element Wasser Ecommerce

This context describes commerce language for Element Wasser: catalog, checkout, orders, and customers.

## Language

**Customer**:
A person who places or may place orders, either as a registered user or as a guest. Customer email and name are required for checkout; registered customer name and email stay synced with the linked user.
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

**Order**:
A customer commitment to buy one or more products at recorded purchase terms. Cancellations apply to whole orders, and customer contact details are stored as order snapshots.
_Avoid_: Purchase, transaction

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

**Address Book Entry**:
A reusable registered-customer address selected during checkout and copied into the order.
_Avoid_: Order address

**Shipping Address**:
The address snapshot stored on an order for fulfillment.
_Avoid_: Registered address, address reference

**Billing Address**:
The address snapshot stored on an order for invoicing and payment records.
_Avoid_: Payment address

**Product**:
A sellable catalog item with current price, current cost, inventory, manufacturer, slug, and SKU.
_Avoid_: Item, article

**SKU**:
A merchant-facing unique product code used for inventory, support, and operations.
_Avoid_: Product ID

**Manufacturer**:
The company or brand responsible for a product; every product has exactly one manufacturer.
_Avoid_: Brand, supplier

**Category**:
A navigational grouping for products. Categories can be nested, and a product can appear in multiple categories.
_Avoid_: Collection, tag

**Stock On Hand**:
The current physical quantity available in inventory before reservations.
_Avoid_: Inventory

**Stock Reserved**:
The quantity committed to placed orders that has not yet left inventory.
_Avoid_: Held inventory

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
A payment attempt or money movement associated with an order.
_Avoid_: Transaction
