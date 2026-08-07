# Nhập hàng (nhiên liệu vào hầm)

> Tài liệu nghiệp vụ + kỹ thuật cho tính năng **Nhập hàng**: ghi nhận mỗi chuyến xe bồn
> giao nhiên liệu vào hầm, kèm ảnh chứng từ, tự cộng tồn kho, xuất Excel lưu trữ và
> cân đối nhập − bán theo từng hầm. Hoàn thành ngày 31/07/2026.

## 1. Bài toán

Hàng (xăng, dầu, URE…) về trạm được bơm vào các **HẦM**. Mỗi lần nhập cần:

- Ghi lại **ai nhập, hầm nào, bao nhiêu lít, lúc nào, của nhà cung cấp nào**.
- Lưu **ảnh chứng từ** (hóa đơn, phiếu cân, tem kẹp chì…) để đối chiếu về sau.
- Cộng số nhập vào **tồn kho ước tính**, để cân đối với số **bán ra** (từ chốt ca)
  và số **đo hầm thực tế** (que barem).
- Xuất **file Excel** đơn giản khi cần kiểm tra/lưu trữ.

Điểm đặc thù ngành: **xăng dầu dãn nở theo nhiệt độ**, nên hóa đơn giao hàng thường ghi
cả **số lít thực tế** (theo nhiệt độ lúc giao) lẫn **số lít quy về 15°C (V15)**. Phiếu
nhập lưu cả hai + nhiệt độ đo được.

## 2. Hướng dẫn sử dụng

> **Lưu ý:** Nhập hàng làm **trực tiếp trên web**, không qua Zalo.

### Tạo phiếu nhập — quy trình biên bản 3 bước (cập nhật 07/08/2026)

Nút **"Nhập hàng"** nằm ở 2 chỗ (chỉ admin/kế toán thấy — người xem không có):

- Trang **chi tiết ca** (cạnh nút Chốt ca) — vì hàng thường về đúng ngày chốt.
- Trang **Tồn kho** của trạm.

Mỗi chuyến hàng về đều có tờ **BIÊN BẢN GIAO NHẬN XĂNG DẦU** ký giữa tài xế và
nhân viên trạm. Quy trình bám theo tờ đó:

**Bước 1 — Hình biên bản.** Chụp/chọn hình biên bản (được nhiều trang) và bấm
**"Đọc biên bản (AI)"**. AI đọc toàn bộ tờ giấy (kể cả chữ viết tay, số kiểu
Việt Nam "6.000" / "34,5") và tự điền vào form. Nếu không muốn dùng AI có nút
**"Bỏ qua AI, nhập tay"**.

**Bước 2 — Rà soát.** Form được dựng **theo đúng bố cục biên bản** để dò từng ô:

- **Đầu phiếu:** ngày giờ nhập, nhân viên trạm, bên vận chuyển (tài xế), xe bồn.
- **Hàng nhập:** mỗi mặt hàng một cột — kho xuất, số lượng, số phiếu xuất kho,
  số niêm chì (giống bảng "Tên hàng" trên giấy).
- **a. Ngăn xe bồn 1-5:** số lít, vị trí lưỡi gà, lít bơm bù, nhiệt độ trên xe.
- **b. Kiểm tra phương tiện:** tình trạng hàng hóa (nước, cặn).
- **c. Kiểm tra hầm:** trước/sau nhập (nhiệt độ, chiều cao mm, SL sổ sách, SL
  barem) + cột **"Nhập vào hầm (lít)"** — chính số này được cộng vào tồn kho,
  mỗi hầm có nhận hàng sinh một phiếu nhập riêng.
- **d. Trụ bơm:** total điện tử + cơ trước/sau, kèm cột **chênh lệch tự tính**
  — phải bằng 0 (không bán trong lúc nhập); khác 0 hiện đỏ để soát lại ngay.
- **e. Ghi chú.**

Sửa chỗ AI đọc chưa đúng rồi bấm **"Xác nhận & lưu phiếu"** → biên bản + các
phiếu nhập theo hầm được lưu, tồn kho **tự cộng**, hình biên bản đính kèm phiếu.

**Bước 3 — Hình ảnh liên quan.** Tải lên **tất cả** hình của ca nhập (niêm chì,
đồng hồ xe bồn, đo que, trụ bơm…). Toàn bộ được lưu trữ theo biên bản để **đối
soát về sau**. Có thể bấm "Để sau" nếu chưa có hình.

Trong bảng "Nhập hàng gần đây", chứng từ hiện theo nhãn: `BB…` = trang biên
bản, `HA…` = hình liên quan, `CT…` = chứng từ gắn trực tiếp phiếu (kiểu cũ).

### Hủy phiếu

Trong bảng **"Nhập hàng gần đây"** (trang Tồn kho) mỗi phiếu có nút **Hủy phiếu**.
Hủy **không xóa** gì cả: phiếu được đóng dấu "Đã hủy" (mờ đi trong danh sách), số lít
được **trừ lại** khỏi tồn bằng một bút toán điều chỉnh, và mọi thao tác đều ghi vào
nhật ký kiểm toán (ai, lúc nào).

### Xuất Excel

Nút **"Xuất Excel"** ở đầu bảng Nhập hàng gần đây. Mặc định xuất **31 ngày gần nhất**
của trạm đang xem; đổi khoảng ngày bằng tham số URL:

```
/api/imports/export?stationId=<id>&from=2026-07-01&to=2026-07-31
```

File gồm các cột: Ngày giờ nhập · Trạm · Hầm · Loại hàng · Số lít thực tế · Số lít V15 ·
Nhiệt độ · Nhà cung cấp · Số hóa đơn · Xe bồn · Người nhập · Ghi chú · Số chứng từ ·
Trạng thái (Đã hủy). Định dạng đơn giản có chủ đích — file để lưu trữ/kiểm tra,
không phải mẫu kế toán.

### Cân đối theo hầm

Bảng **"Đo hầm (barem)"** trên trang Tồn kho có thêm 2 cột:

- **Nhập hôm nay** — tổng số lít các phiếu nhập (chưa hủy) vào hầm đó trong ngày.
- **Bán hôm nay** — tổng chênh lệch đồng hồ **điện tử** (số cuối − số đầu) của mọi trụ
  hút từ hầm đó, lấy từ số liệu chốt ca trong ngày. Hai trụ chung một hầm thì cộng dồn.

Nhìn một hàng là thấy đủ: số đo que mới nhất + nhập + bán của từng hầm. Hầm có nhập
trong ngày nhưng chưa từng đo que vẫn hiện dòng riêng.

## 3. Phân quyền

| Vai trò   | Tạo phiếu | Hủy phiếu | Xem + xuất Excel |
| --------- | --------- | --------- | ---------------- |
| Admin     | ✅        | ✅        | ✅               |
| Kế toán   | ✅        | ✅        | ✅               |
| Người xem | ❌        | ❌        | ✅               |

## 4. Kỹ thuật

### Dữ liệu

- **`fuel_import_receipts`** — mỗi biên bản giao nhận: trạm, ngày, nhân viên,
  tài xế, xe bồn, và 4 mục a-d dạng JSON đúng như đã rà soát (`products`,
  `compartments`, `tank_checks`, `pump_checks`) + `raw_extract` (kết quả AI
  nguyên bản, để sau này đối chiếu "AI đọc gì" vs "người dùng xác nhận gì").
- **`fuel_imports`** — mỗi phiếu = hàng vào 1 hầm: trạm, mã hầm (`HAM_x`),
  loại nhiên liệu, lít thực tế, lít V15, nhiệt độ, NCC, số hóa đơn, xe bồn, ghi chú,
  ngày giờ, người tạo, dấu hủy (`canceled_at/by`), và `receipt_id` khi phiếu
  sinh ra từ biên bản (1 biên bản → nhiều phiếu nếu nhập nhiều hầm).
- **`fuel_import_documents`** — ảnh/PDF, lưu Supabase Storage. Gắn phiếu
  (`import_id`, kiểu cũ, đường dẫn `<TRẠM>/imports/<id phiếu>-<n>`) hoặc gắn
  biên bản (`receipt_id`, `kind` = `bien_ban` | `related`, đường dẫn
  `<TRẠM>/imports/receipts/<id biên bản>/…`).
- Mỗi phiếu sinh một **`inventory_movements`** loại `import` (+lít) và cộng
  `inventory_balances.estimated_stock`; hủy phiếu sinh movement `adjustment` (−lít).

### API

| Route                                  | Method | Chức năng                                                       |
| -------------------------------------- | ------ | --------------------------------------------------------------- |
| `/api/imports/extract`                 | POST   | AI đọc hình biên bản (`photos`) → JSON điền form (chưa lưu gì)  |
| `/api/imports/receipts`                | POST   | Xác nhận biên bản: lưu receipt + phiếu theo hầm + hình biên bản |
| `/api/imports/receipts/[id]/documents` | POST   | Bước 3: lưu trữ toàn bộ hình liên quan ca nhập (`photos`)       |
| `/api/imports`                         | POST   | (Kiểu cũ) tạo phiếu đơn lẻ — vẫn hoạt động                      |
| `/api/imports/[id]/cancel`             | POST   | Hủy phiếu + bút toán trừ lại                                    |
| `/api/imports/export`                  | GET    | Excel theo `stationId` + `from`/`to` (mặc định 31 ngày)         |

### Code chính

- `components/inventory/fuel-import-form.tsx` — wizard 3 bước theo bố cục biên bản.
- `lib/ai/extract-bien-ban.ts` + `BIEN_BAN_PROMPT` (`lib/ai/prompts.ts`) — AI đọc
  biên bản; đã kiểm chứng trên 2 mẫu thật (Nguyên Vượng viết tay, Phúc Tiến bản in
  — đọc đúng cả cột Cơ/Điện đảo thứ tự và số thập phân kiểu `82118,87`).
- `lib/imports/bien-ban.ts` — types dùng chung + `parseVnNumber` ("6.000"→6000,
  "34,5"→34.5, "141.008,78"→141008.78) + `tankCodeFromLabel` ("HẦM 2 12K"→`HAM_2`).
- `components/inventory/import-cancel-button.tsx` — nút hủy.
- `lib/inventory/tank-ledger.ts` — `computeTankFlows`: gom nhập/bán theo hầm
  (bán = delta điện tử của các trụ map vào hầm qua `dispenser.tank_code`;
  delta âm bị bỏ qua — đó là lỗi dữ liệu đã có cờ review riêng).
- Trang: `app/(dashboard)/stations/[id]/inventory/page.tsx` (form + bảng phiếu +
  cột cân đối), `.../shifts/[shiftId]/page.tsx` (nút Nhập hàng).
- Tests: `tests/tank-ledger.test.ts`, `tests/bien-ban.test.ts` (parse số VN + map nhãn hầm,
  toàn bộ số liệu lấy từ 2 biên bản thật).

## 5. Chưa làm / chờ Trường Thịnh

1. **Bảng barem từng hầm (cm → lít)** — khi có mới so được _số lít_ tồn ước tính với
   đo que thực tế và bật cảnh báo chênh lệch (hiện số đo que vẫn là số thô).
2. **Chốt hệ quy chiếu cân đối: lít thực tế hay V15?** — hiện tồn kho cộng theo
   **lít thực tế**; nếu kế toán muốn theo V15 thì đổi một chỗ trong API tạo phiếu.
3. Ngưỡng chênh lệch chấp nhận (hao hụt tự nhiên/bay hơi) cho cảnh báo ở mục 1.
4. AI đọc tự động nội dung hóa đơn — ngoài phạm vi, làm sau nếu cần.
