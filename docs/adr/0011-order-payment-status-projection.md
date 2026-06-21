# Project Order Payment Status through one module

Order Payment Status is a projection of all Payments for the Order plus whether the Order can still accept Payment. The precedence is: a successful charge is PAID; otherwise an Active Payment Attempt is PENDING; otherwise a failed attempt within the Payment Window is FAILED; otherwise the Order is CANCELLED for payment. REFUNDED remains reserved for the future refund operation. Only the Order-level Payment outcome module may change this projection, so callers cannot independently encode conflicting precedence or concurrency rules.

Status: accepted

A captured Payment always records the money truth even if the Order was already cancelled. The cancellation is not automatically reversed and Stock Reservation is not recreated; the Order is marked as a Payment Exception for merchant intervention. Automatic Payment Confirmation and New Paid Order Email Notifications are withheld for this exceptional state.
