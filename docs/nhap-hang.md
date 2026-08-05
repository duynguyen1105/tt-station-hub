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

### Tạo phiếu nhập

Nút **"Nhập hàng"** nằm ở 2 chỗ (chỉ admin/kế toán thấy — người xem không có):

- Trang **chi tiết ca** (cạnh nút Chốt ca) — vì hàng thường về đúng ngày chốt.
- Trang **Tồn kho** của trạm.

Form gồm:

| Trường            | Bắt buộc | Ghi chú                                                            |
| ----------------- | -------- | ------------------------------------------------------------------ |
| Hầm nhận          | ✅       | Chọn từ danh sách hầm của trạm; có "Hầm khác…" nhập tay mã hầm mới |
| Loại nhiên liệu   | ✅       | Tự điền theo hầm đã chọn; chỉ phải chọn tay khi hầm chưa khai báo  |
| Số lít thực tế    | ✅       | Số lít theo nhiệt độ lúc giao — **số này được cộng vào tồn**       |
| Số lít V15        | —        | Số quy về 15°C trên hóa đơn (nếu có)                               |
| Nhiệt độ (°C)     | —        | Đo tại xe bồn/hầm lúc giao                                         |
| Ngày giờ nhập     | ✅       |                                                                    |
| Nhà cung cấp      | —        |                                                                    |
| Số hóa đơn        | —        |                                                                    |
| Xe bồn            | —        | Biển số xe giao hàng                                               |
| Ghi chú           | —        |                                                                    |
| Chứng từ đính kèm | —        | Nhiều ảnh hoặc PDF; bấm được để xem lại từ danh sách phiếu         |

Lưu phiếu → tồn ước tính của loại nhiên liệu đó **tự cộng** ngay.

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

- **`fuel_imports`** — mỗi phiếu = 1 chuyến giao vào 1 hầm: trạm, mã hầm (`HAM_x`),
  loại nhiên liệu, lít thực tế, lít V15, nhiệt độ, NCC, số hóa đơn, xe bồn, ghi chú,
  ngày giờ, người tạo, dấu hủy (`canceled_at/by`).
- **`fuel_import_documents`** — ảnh/PDF chứng từ, lưu Supabase Storage tại
  `<MÃ TRẠM>/imports/<id phiếu>-<n>.<đuôi>`.
- Mỗi phiếu sinh một **`inventory_movements`** loại `import` (+lít) và cộng
  `inventory_balances.estimated_stock`; hủy phiếu sinh movement `adjustment` (−lít).

### API

| Route                      | Method | Chức năng                                               |
| -------------------------- | ------ | ------------------------------------------------------- |
| `/api/imports`             | POST   | Tạo phiếu (multipart: trường + files `documents`)       |
| `/api/imports/[id]/cancel` | POST   | Hủy phiếu + bút toán trừ lại                            |
| `/api/imports/export`      | GET    | Excel theo `stationId` + `from`/`to` (mặc định 31 ngày) |

### Code chính

- `components/inventory/fuel-import-form.tsx` — dialog form (hầm → tự điền nhiên liệu).
- `components/inventory/import-cancel-button.tsx` — nút hủy.
- `lib/inventory/tank-ledger.ts` — `computeTankFlows`: gom nhập/bán theo hầm
  (bán = delta điện tử của các trụ map vào hầm qua `dispenser.tank_code`;
  delta âm bị bỏ qua — đó là lỗi dữ liệu đã có cờ review riêng).
- Trang: `app/(dashboard)/stations/[id]/inventory/page.tsx` (form + bảng phiếu +
  cột cân đối), `.../shifts/[shiftId]/page.tsx` (nút Nhập hàng).
- Tests: `tests/tank-ledger.test.ts`.

## 5. Chưa làm / chờ Trường Thịnh

1. **Bảng barem từng hầm (cm → lít)** — khi có mới so được _số lít_ tồn ước tính với
   đo que thực tế và bật cảnh báo chênh lệch (hiện số đo que vẫn là số thô).
2. **Chốt hệ quy chiếu cân đối: lít thực tế hay V15?** — hiện tồn kho cộng theo
   **lít thực tế**; nếu kế toán muốn theo V15 thì đổi một chỗ trong API tạo phiếu.
3. Ngưỡng chênh lệch chấp nhận (hao hụt tự nhiên/bay hơi) cho cảnh báo ở mục 1.
4. AI đọc tự động nội dung hóa đơn — ngoài phạm vi, làm sau nếu cần.
