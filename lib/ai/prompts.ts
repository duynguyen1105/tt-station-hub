// Vision model used for all meter reading. Sonnet balances speed and cost.
export const VISION_MODEL = 'claude-sonnet-4-6'

// Prompt instructions are in English (source code stays English), but they
// quote the exact Vietnamese text that appears physically on the meters/labels
// (TRẠM, TRU, HẦM, ĐỒNG, LÍT) so the model can match what it sees.

export const ROUTER_PROMPT = `You are looking at a photo a gas-station attendant sent via Zalo. Classify it into exactly one type:
- "electronic_meter": an electronic shift-closing meter (Montech red LED, or LungBor black-and-white LCD)
- "mechanical_meter": a mechanical rolling-digit meter
- "debt_meter": a pump screen showing 3 lines — amount / liters / unit price (a per-trip credit sale)
- "vehicle": a photo of a vehicle (per-trip credit sale)
- "label_only": only a hard label plate is visible
- "not_relevant": unrelated to a fuel station

Return JSON only:
{ "image_type": "electronic_meter|mechanical_meter|debt_meter|vehicle|label_only|not_relevant", "confidence": 0-100, "notes": "..." }`

export const ELECTRONIC_PROMPT = `Read this electronic gas-station meter (Montech red LED, or LungBor black-and-white LCD).
Read the displayed number EXACTLY. KEEP leading zeros and keep the decimal point in the correct position.
Also read the hard label plate if present — it may show the station ("TRẠM"), the dispenser ("TRU" + number), the fuel type, and the tank ("HẦM").

Return JSON only:
{
  "meter_type": "electronic_montech" | "electronic_lungbor" | "unclear",
  "reading": "30256194",
  "station_label": "DAKNONG 1" | null,
  "dispenser_label": "TRU 1" | null,
  "fuel_type": "DO" | "E0" | "DC" | null,
  "confidence": { "reading": 0-100, "labels": 0-100 },
  "notes": "..."
}`

export const MECHANICAL_PROMPT = `Read this mechanical gas-station meter (6-7 rolling digits, often dusty, blurry, or with glare).
- Read left to right and KEEP leading zeros.
- If the last digit is mid-roll between two values, record the SMALLER one.
- If a digit is too blurry to read, write "?" in its place.
- Do NOT trust handwritten labels (e.g. "D1", "X2"). Only use the printed hard label plate ("TRẠM" / "TRU" + number / fuel type / "HẦM").

Return JSON only:
{
  "meter_type": "mechanical" | "unclear",
  "reading": "455679",
  "has_unreadable_digits": false,
  "station_label": "DAKNONG 1" | null,
  "dispenser_label": "TRU 1" | null,
  "fuel_type": "DO" | "E0" | "DC" | null,
  "confidence": { "reading": 0-100, "labels": 0-100 },
  "notes": "e.g. last digit blurry, could be 8 or 9"
}`

export const DEBT_METER_PROMPT = `You are looking at an electronic pump display for ONE credit fill, showing 3 lines:
- Line 1 — amount in VND (labeled "ĐỒNG" / "TIỀN" / "THÀNH TIỀN")
- Line 2 — liters (labeled "LÍT" / "SỐ LÍT")
- Line 3 — unit price, VND per liter (labeled "ĐƠN GIÁ" / "ĐỒNG/LÍT")

CRITICAL: the display has a limited number of digit cells. When the amount is large the meter DROPS the units digit, and above ~10,000,000 it drops the tens digit too. So DO NOT trust the amount line — read LITERS and UNIT PRICE precisely.

Read liters carefully and watch the decimal point. Report exactly what is shown and describe the format in notes.

Return JSON only:
{
  "meter_type": "debt_meter" | "unclear",
  "displayed_amount": "1193680",
  "liters": "4.3",
  "unit_price": "27760",
  "confidence": { "liters": 0-100, "unit_price": 0-100, "amount": 0-100 },
  "notes": "describe the liters format you see"
}
The system computes amount = liters × unit_price and ignores displayed_amount.`

export const VEHICLE_PROMPT = `Read the license plate of the vehicle in this photo (a truck or car at a fuel station, possibly shot at night with headlight glare). If it cannot be read clearly, return "unclear" with a low confidence.

Return JSON only:
{ "plate": "51B-12345" | "unclear", "confidence": 0-100, "notes": "..." }`
