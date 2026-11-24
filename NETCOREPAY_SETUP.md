# NetCorePay GCash setup

The customer booking page creates a GCash checkout through NetCorePay. A signed
webhook updates the payment and booking; returning from the checkout page alone
does not mark a payment as paid.

## Environment

Set these in the server's `.env` file:

- `NETCOREPAY_SECRET_KEY`: `sk_test_...` for sandbox or `sk_live_...` for live.
- `NETCOREPAY_WEBHOOK_SECRET`: the signing secret for the matching webhook endpoint.
- `APP_BASE_URL`: the public application origin, such as `https://bookings.example.com`.

Use `.env.example` as a variable template. Do not commit `.env` or real gateway
keys.

## Webhook registration

Register this HTTPS URL in the NetCorePay dashboard:

`https://<your-domain>/api/webhooks/netcorepay`

Subscribe to `payment.succeeded`, `payment.failed`, and `payment.expired`, then
copy the endpoint signing secret into `NETCOREPAY_WEBHOOK_SECRET`. Test with a
NetCorePay sandbox key and confirm the webhook reaches the app before using live
credentials.

The integration validates the `X-NexusPay-Signature` header and raw-body HMAC
format described in the published NetCorePay webhook guide. The guide uses the
NexusPay header name; confirm the exact header and live API details with
NetCorePay support before production activation.
