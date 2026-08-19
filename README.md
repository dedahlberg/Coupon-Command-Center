# Coupon Command Center — Step 8

Step 8 broadens live source ingestion while preserving authorized redemption.

## Broader source layer
- GrocerySmarts: public individual coupon metadata
- Krazy Coupon Lady: recent public deal-discovery headlines
- LOZO: directory health/count + link-out
- Coupons.com: live page health + provider-controlled printable flow
- Fetch: personalized link-out
- Manufacturer Direct: curated official-program layer

## Automation
The GitHub Action now refreshes twice daily.

## Guardrails
The app does not copy/generate barcodes or QR codes, bypass phone verification or print limits, or present personalized Fetch offers as universal offers.
