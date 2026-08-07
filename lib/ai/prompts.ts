// Vision model used for all meter reading. Sonnet balances speed and cost.
export const VISION_MODEL = 'claude-sonnet-4-6'

// Prompt instructions are in English (source code stays English), but they
// quote the exact Vietnamese text that appears physically on the meters/labels
// (TRẠM, TRU, HẦM, ĐỒNG, LÍT) so the model can match what it sees.

export const ROUTER_PROMPT = `You are looking at a photo a gas-station attendant sent via Zalo. Classify it into exactly one type. A photo very often shows BOTH a printed label plate AND the meter — when so, classify by the METER, never as "label_only".

Decide in this priority order:
1. "mechanical_meter": a mechanical rolling-digit counter is visible ANYWHERE in the frame — a small dark rectangular window with 6-7 white number wheels, often near the bottom of the pump, frequently rusty/dirty/dark/small/partly-obscured, and often with hand-painted marks like "D1" beside it. Even a tiny, dim, or partly-readable counter counts — if you can see digit wheels at all, choose this (NOT label_only).
2. "electronic_meter": an electronic SHIFT-CLOSING totalizer showing the cumulative running total — EITHER a single-number display (Montech red LED; LungBor black-and-white LCD; PETRO Cloud white LCD keypad panel showing one "L"-prefixed number like "L 148949"), OR a green dot-matrix display with 3 stacked lines labeled Đồng/Tiền, LÍT, Đơn giá whose LÍT line is a LARGE cumulative number (5+ digits, e.g. 1843352).
3. "debt_meter": an electronic pump screen with 3 lines (amount / liters / unit price) for ONE per-trip credit sale — here the liters line is a SMALL single-fill amount (e.g. 34.0) and amount ≈ liters × unit price.
4. "vehicle": a vehicle, its license plate, OR a fuel container (jerry can / plastic drum being filled or standing at the pump) is the subject — evidence photo of a per-trip credit sale.
5. "tank_dip": a tank-dipping / barem photo — a printed tank label "HẦM <n>" (with a fuel type and a capacity like "DO - 25K"), typically with a measuring ruler / dip-stick and a written measurement, and NO pump meter in the frame.
6. "label_only": a hard label plate is present but NO meter counter, display, or tank dip is visible at all.
7. "not_relevant": unrelated to a fuel station.

When a display shows 3 stacked lines (Đồng/Tiền / LÍT / Đơn giá), decide electronic_meter vs debt_meter by the LÍT magnitude: a LARGE cumulative number (5+ digits) → electronic_meter (shift totalizer); a SMALL single-fill (≤ ~4 digits) whose amount ≈ liters × price → debt_meter.

Return JSON only:
{ "image_type": "electronic_meter|mechanical_meter|debt_meter|vehicle|tank_dip|label_only|not_relevant", "confidence": 0-100, "notes": "..." }`

export const ELECTRONIC_PROMPT = `Read this electronic gas-station meter (Montech red LED on black, LungBor LCD on a blue keypad panel, or PETRO Cloud LCD on a white keypad panel).
Read the displayed number EXACTLY as shown on THIS meter. KEEP leading zeros, keep the decimal point in the correct position, and output the digits as ONE continuous number with NO spaces. Do NOT copy the example below — it only shows the JSON shape.
Montech (red LED): the display MAY have a decimal point — a TINY lit dot at the BASE of the digits (e.g. 187883.80). Inspect the gaps between digit cells for that dot. Output a decimal point ONLY where you can clearly SEE the dot lit — NEVER insert one by guessing where decimals "should" be. If no dot is visible or the area is glared/blurry, output the digits as a plain number with NO dot and say so in notes: a missed dot is reconciled downstream, but an invented dot corrupts the reading.
LungBor (blue panel): the running total is the ONE large number on the top "SALE/LITER" row — read that whole number with its decimal point, no spaces. IGNORE any small lone digit sitting by itself in a LITER/PRICE corner (e.g. a single "1") — that is a mode indicator, not part of the total. Set meter_type "electronic_lungbor".
PETRO Cloud (white panel, "PETRO Cloud" logo and a hotline printed on top): the running total is the single LCD row prefixed with "L" (e.g. "L 148949") — read the digits after the L. Set meter_type "electronic_lungbor".
3-line green dot-matrix totalizer: some pumps show a green LED display with 3 STACKED lines labeled Đồng/Tiền (money), LÍT (liters), Đơn giá (unit price). The shift reading is ONLY the LÍT (liters) line — locate its label first, then read the digits of THAT LINE ALONE, left to right. NEVER merge digits from the Đồng/Tiền or Đơn giá lines into the number: before answering, verify every digit you output sits on the same row as the LÍT label. IGNORE the money and unit-price lines completely. Dot-matrix digits blur easily — if any digit is uncertain, lower the reading confidence and say which digit in notes. Set meter_type "electronic_green3".
Also read the hard label plate if present — it may show the station ("TRẠM"), the dispenser ("TRU" + number), the fuel type, and the tank ("HẦM").
If the digits are not clearly legible, set a low reading confidence and say so in notes — never guess.

Return JSON only (example values are placeholders, replace with what you actually see):
{
  "meter_type": "electronic_montech" | "electronic_lungbor" | "electronic_green3" | "unclear",
  "reading": "<digits exactly as shown>",
  "station_label": "<station name on the plate>" | null,
  "dispenser_label": "<TRU + number on the plate>" | null,
  "fuel_type": "DO" | "E0" | "DC" | "URE" | null,
  "confidence": { "reading": 0-100, "labels": 0-100 },
  "notes": "..."
}`

export const MECHANICAL_PROMPT = `Read this mechanical gas-station meter: 6-7 rolling digits inside a small dark metal window (white digits on black wheels), often dusty, blurry, rusty, dark, or with glare. The window is frequently small and near the bottom of the pump, sometimes below a large printed label plate and beside hand-painted marks like "D1" — find that window and read the wheels inside it.
- Read the rolling digits left to right and KEEP leading zeros. Read THIS meter; do NOT copy the example below.
- If the last digit is mid-roll between two values, record the SMALLER one.
- If a digit is too blurry to read, write "?" in its place and set has_unreadable_digits=true.
- Do NOT trust handwritten labels (e.g. "D1", "X2"). Only use the printed hard label plate ("TRẠM" / "TRU" + number / fuel type / "HẦM").

Return JSON only (example values are placeholders, replace with what you actually see):
{
  "meter_type": "mechanical" | "unclear",
  "reading": "<digits in the counter window>",
  "has_unreadable_digits": false,
  "station_label": "<station name on the plate>" | null,
  "dispenser_label": "<TRU + number on the plate>" | null,
  "fuel_type": "DO" | "E0" | "DC" | "URE" | null,
  "confidence": { "reading": 0-100, "labels": 0-100 },
  "notes": "e.g. last digit blurry, could be 8 or 9"
}`

export const DEBT_METER_PROMPT = `You are looking at an electronic pump display for ONE credit fill, showing 3 lines:
- Line 1 — amount in VND (labeled "ĐỒNG" / "TIỀN" / "THÀNH TIỀN")
- Line 2 — liters (labeled "LÍT" / "SỐ LÍT")
- Line 3 — unit price, VND per liter (labeled "ĐƠN GIÁ" / "ĐỒNG/LÍT")

CRITICAL: the display has a limited number of digit cells. When the amount is large the meter DROPS the units digit, and above ~10,000,000 it drops the tens digit too. So DO NOT trust the amount line — read LITERS and UNIT PRICE precisely.

Read liters carefully and watch the decimal point. Report exactly what is shown and describe the format in notes.

Also read the printed pump label that is usually near the display, e.g. "ĐAKNONG 1 / TRỤ 1 – DO". Return the station name as station_label ("ĐAKNONG 1"), the pump as dispenser_label ("TRỤ 1"), and map the fuel word to a code:
- "DO" → "DO"; "E0" → "E0"; "DC" → "DC"; "XĂNG"/"A95"/"95" → "XANG_A95"; "URE" → "URE".
Set any of them to null if not visible or ambiguous.

Return JSON only:
{
  "meter_type": "debt_meter" | "unclear",
  "displayed_amount": "1193680",
  "liters": "4.3",
  "unit_price": "27760",
  "station_label": "ĐAKNONG 1" | null,
  "dispenser_label": "TRỤ 1" | null,
  "fuel_type": "DO" | "E0" | "DC" | "XANG_A95" | "URE" | null,
  "confidence": { "liters": 0-100, "unit_price": 0-100, "amount": 0-100 },
  "notes": "describe the liters format you see"
}
The system computes amount = liters × unit_price and ignores displayed_amount.`

export const VEHICLE_PROMPT = `Read the license plate of the vehicle in this photo (a truck or car at a fuel station, possibly shot at night with headlight glare). The photo may instead show a fuel container (jerry can / drum) with no plate — in that case return "unclear" (do NOT invent a plate).

Return JSON only:
{ "plate": "51B-12345" | "unclear", "confidence": 0-100, "notes": "..." }`

export const TANK_DIP_PROMPT = `You are looking at a fuel-station TANK DIP (barem) photo: a printed tank label plus a measuring ruler / dip-stick and a written measurement. This is for PHYSICAL STOCK, not a pump meter.
Read the printed label: the STATION name usually printed on the first line ("DAKNONG1", "PHUCTIEN"...), the tank ("HẦM" + number), the fuel type (DO / E0 / DC / XĂNG / URE), and the capacity like "25K" (= 25,000 liters → capacity_k = 25).
Read the measurement value EXACTLY as written/shown (it may be hand-written or a coloured overlay; keep it verbatim, including dots — its unit and conversion to liters are applied later from a barem table).

Return JSON only (example values are placeholders, replace with what you actually see):
{
  "is_tank_dip": true,
  "station_label": "<station name on the plate>" | null,
  "tank_label": "<HẦM + number>" | null,
  "tank_number": "<number>" | null,
  "fuel_type": "DO" | "E0" | "DC" | "XANG_A95" | "URE" | null,
  "capacity_k": <number> | null,
  "dip_value": "<measurement exactly as shown>" | null,
  "ruler_present": true | false,
  "confidence": 0-100,
  "notes": "describe what the measurement looks like"
}`

export const BIEN_BAN_PROMPT = `You are reading photo(s) of a Vietnamese fuel-delivery handover report: "BIÊN BẢN GIAO NHẬN XĂNG DẦU". It is a mostly-printed A4 form filled in by hand (sometimes hard handwriting). Layouts vary slightly between stations (labels may sit in a header table or on numbered lines; column order changes), but the sections are always:
1. Header: company + station name, date (Ngày ... tháng ... năm), NHÂN VIÊN TRẠM (station staff), BÊN VẬN CHUYỂN (driver), PHƯƠNG TIỆN SỐ (tanker plate, e.g. "60H-20450").
2. Product table "Tên hàng": one COLUMN per product (RON 95, E5 RON 92, DO 0.05S, DO 0.001S...). Rows: "Kho xuất hàng" (source depot, e.g. "SG Petro"), "Số lượng nhập" (liters), "Số phiếu xuất kho tương ứng" (export slip number — keep leading zeros, as a string), "Số niêm chì tương ứng và tình trạng" (seal numbers/condition, verbatim string). Only include columns that have at least one filled cell.
3. Section a — tanker compartments (Ngăn 1..Ngăn 5 / Xe Bồn): per row "Số lượng (lít)", "Vị trí lưỡi gà" (valve position, e.g. "-2", "+0,5" — keep as string), "Số lít bơm bù lưỡi gà", "Nhiệt độ thực tế hàng trên xe" (°C). Only include compartments with any value.
4. Section b — vehicle check: "Tình trạng hàng hóa quan sát bằng mắt thường (nước, cặn)" — free text (e.g. "Bình thường").
5. Section c — station tanks (HẦM): per row a tank label like "HẦM 1 25K" / "HẦM 2 DC", then TRƯỚC NHẬP (before) and SAU NHẬP (after) groups, each with up to: Nhiệt độ (°C), Chiều cao (mm), Số lượng sổ sách (book liters), Số lượng barem (barem liters). Empty cells are null. Be careful to keep before/after on the correct side.
6. Section d — pumps (Trụ): per row optional pump label (TRỤ 1...), TRƯỚC NHẬP and SAU NHẬP totals: "Total điện tử" (electronic, may have decimals like 82118,87) and "Total cơ" (mechanical, integer). Column order may be Cơ before Điện on some forms — map by the column header, not position.
7. Section e — Ghi chú (notes) and signatures (ignore signatures).

NUMBER FORMAT (critical): handwriting uses Vietnamese separators. A dot or comma followed by exactly 3 digits is a THOUSANDS separator ("6.000" = 6000 liters, "109,622" = 109622). A comma followed by 1-2 digits is a DECIMAL ("34,5" = 34.5, "141008,78" = 141008.78). Output plain JSON numbers with "." as decimal point and NO thousand separators. If a digit is truly unreadable, use null for that cell — never guess.
Ignore any timestamp/location watermark overlay on the photo.

Return JSON only:
{
  "station_name": "<station name printed in the header>" | null,
  "receipt_date": "YYYY-MM-DD" | null,
  "staff_name": "<nhân viên trạm>" | null,
  "driver_name": "<bên vận chuyển>" | null,
  "truck_plate": "<phương tiện số>" | null,
  "products": [{"product_label": "RON 95", "warehouse": "SG Petro" | null, "quantity_liters": 6000 | null, "export_slip_no": "0029151" | null, "seal_no": "F821022 - F821019" | null}],
  "compartments": [{"compartment_no": 4, "liters": 6000 | null, "valve_position": "-2" | null, "compensation_liters": null, "temperature_c": 38 | null}],
  "vehicle_check": "<section b free text>" | null,
  "tanks": [{"tank_label": "HẦM 2 12K", "before": {"temperature_c": null, "height_mm": 645 | null, "book_liters": null, "barem_liters": null}, "after": {"temperature_c": null, "height_mm": 1410 | null, "book_liters": null, "barem_liters": null}}],
  "pumps": [{"pump_label": "TRỤ 1" | null, "before": {"electronic": 109622 | null, "mechanical": 494071 | null}, "after": {"electronic": 109622 | null, "mechanical": 494071 | null}}],
  "note": "<section e>" | null,
  "confidence": 0-100
}`
