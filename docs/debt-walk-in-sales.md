# Bán nợ KHÔNG có biển số xe (khách mang can / xe không rõ biển)

> Tài liệu nghiệp vụ + kỹ thuật cho luồng **bán nợ walk-in**: khách quen tới đổ nhiên liệu
> vào **can/thùng**, hoặc xe không chụp được biển số. Đã kiểm thử end-to-end ngày 21/07/2026
> (kịch bản "Chị Tư – mang can 20L").

## 1. Khác gì so với bán nợ có xe?

|                       | Có xe (chuẩn)                                | Mang can / không biển số                |
| --------------------- | -------------------------------------------- | --------------------------------------- |
| Số ảnh nhân viên chụp | **2** — biển số xe + màn hình cây xăng       | **1** — chỉ màn hình cây xăng           |
| Nhận diện khách       | Tự động qua biển số (`known_plates`)         | **Kế toán chọn tay** khi duyệt          |
| Ghi chú (caption)     | Không bắt buộc                               | **Nên có** — để kế toán biết gán cho ai |
| Duyệt & ghi nợ        | Giống nhau — chọn khách → Duyệt → cộng dư nợ | Giống nhau                              |

Điểm mấu chốt: **ảnh xe không bắt buộc**. Một lượt công nợ chỉ cần ảnh màn hình cây xăng
(số lít + đơn giá + thành tiền của giao dịch đó) là đủ để duyệt và ghi nợ.

## 2. Hướng dẫn NHÂN VIÊN trạm (gửi qua Zalo)

1. Đổ xong, chụp **màn hình cây xăng** (thấy rõ 3 số: tiền / lít / đơn giá — kèm nhãn
   "TRỤ x – DO/E0/DC" càng tốt).
2. Gửi ảnh vào OA/nhóm Zalo, **gõ kèm tin nhắn** theo mẫu:
   > `công nợ <tên khách> <ghi chú>` — ví dụ: **"công nợ anh Ba can 30L"**
3. Xong. Không cần chụp can, không cần chụp người.

Lưu ý caption:

- Có chữ **"công nợ" / "cong no" / "xe"** → hệ thống chắc chắn xếp vào công nợ.
- Không gõ gì cũng thường vẫn đúng (AI nhận màn hình _giao dịch_ — số lít nhỏ — và tự xếp
  vào công nợ), nhưng **caption là bảo hiểm** + là thông tin cho kế toán → bắt buộc theo quy trình.
- Caption được lưu vào lượt xe (`debt_vehicle_visits.zalo_caption`) và hiện trên thẻ duyệt.

Đường tải web (`/upload`) tương đương: chọn **Loại ảnh = Lượt xe / công nợ**, loại con
**Ảnh đồng hồ (lít + đơn giá)**, nhập **Ghi chú**.

## 3. Hướng dẫn KẾ TOÁN (duyệt)

Vào **Cần duyệt → Duyệt công nợ**. Thẻ lượt "mang can" có dạng:

- **Biển số: "—"** (không có ảnh xe → ô ảnh xe ghi "Không có ảnh")
- Khung vàng **"Ghi chú của nhân viên"**: 💬 _"công nợ chị Tư – mang can 20L"_
- Ảnh cây xăng (bấm để phóng to đối chiếu), số tiền lớn = **lít × đơn giá**, badge
  **Khớp/Lệch** so với số hiển thị trên màn hình, chip nhiên liệu (đọc từ nhãn "TRỤ x – DO").

Thao tác:

1. Đối chiếu ảnh với số AI đọc (sai thì bấm **Sửa số**).
2. Đọc ghi chú → **Chọn khách hàng** trong combobox (gõ để tìm).
   - Khách **chưa có** trong danh sách → bấm nút **`+`** ngay cạnh combobox → điền
     _Tên, SĐT, **Mã khách hàng** (bắt buộc — mã do Trường Thịnh cấp), biển số (nếu có)_ →
     **Lưu** → khách được **tự chọn ngay** vào lượt.
3. Bấm **Duyệt** → hệ thống ghi nợ (tạo giao dịch charge + cộng dư nợ khách, có audit log).
4. Lượt rác/trùng → **Từ chối** (không ghi nợ).

## 4. Quy tắc nghiệp vụ liên quan

- **Mã khách hàng bắt buộc** (Trường Thịnh quy định): không tạo/sửa khách mà thiếu mã;
  khách cũ thiếu mã hiện badge đỏ **"Thiếu mã"** trong sổ công nợ (Trạm → Công nợ).
- **Mã `bl` dành riêng cho bán lẻ** — hệ thống chặn đặt `bl` cho khách nợ. Bán lẻ không
  đi qua luồng công nợ: nó là **chốt ca** bình thường; khi xuất MISA, lít bán lẻ =
  tổng chốt ca − lít bán nợ, xuất dưới mã khách `bl` (TK 11111); bán nợ xuất theo mã
  khách riêng (TK 131).
- **Nhiên liệu** ưu tiên đọc từ **nhãn in trên trụ** ("TRỤ 1 – DO") vì giá bán nợ thường là
  giá hợp đồng ≠ giá bán lẻ (suy từ giá sẽ trượt). Không có nhãn → suy từ đơn giá → vẫn
  không ra thì kế toán chọn tay.

## 5. Chi tiết kỹ thuật (cho dev)

- **Routing**: mỗi ảnh Zalo được `classifyPhoto()` phân loại 1 lần; màn hình _giao dịch_
  (lít nhỏ, tiền ≈ lít × giá) → `debt_meter` → luồng công nợ, kể cả không caption.
  Caption chỉ là fallback khi ảnh mờ (`routePhoto()` trong `lib/zalo/classify.ts`).
- **Tạo lượt**: `assembleDebtVisit()` (`lib/photos/ingest.ts`) — ảnh `debt_meter` sẽ
  **ghép** với lượt chỉ-có-ảnh-xe cùng trạm trong **cửa sổ 5 phút**; không có thì tạo lượt
  mới với `vehicle_photo_id = null`. Caption lưu ở `zalo_caption` (không ghi đè caption cũ
  bằng null).
- **Duyệt**: `POST /api/debts/visits/[id]/approve` yêu cầu `customerId` + `computedAmount`;
  không yêu cầu biển số/ảnh xe. `reviewStatus` không bao giờ tự auto-approve với công nợ.
- **Khách mới inline**: `POST /api/debts/customers` (mã bắt buộc, cấm `bl`, biển số
  uppercase); UI `CustomerForm` dùng chung cho thẻ duyệt (nút `+`, auto-select sau tạo)
  và sổ công nợ trạm (+ Thêm khách mới / Sửa).
- **Giới hạn hiện tại**: nếu 2 lượt xảy ra trong cùng cửa sổ 5 phút ở 1 trạm, ảnh có thể
  ghép nhầm lượt (hiếm; kế toán phát hiện qua ảnh khi duyệt). Ảnh gửi thiếu → lượt nằm ở
  "Cần kiểm tra" chờ bổ sung/gán tay.

## 6. Ví dụ đã kiểm thử (21/07/2026)

1 ảnh màn LED xanh (816000 / 34.000 / 24000, nhãn "TRỤ 1 – DO") + caption
_"Công nợ chị Tư - mang can 20L"_ →

- AI đọc: 34 lít × 24.000 = **816.000** (Khớp số hiển thị, tin cậy 85%), nhiên liệu **DO**.
- Thẻ duyệt: biển số "—", ghi chú 💬 hiển thị, 1 ảnh.
- Tạo khách "Chị Tư" (mã `KH002`) qua nút `+` → tự chọn → **Duyệt** → dư nợ Chị Tư
  **816.000** trong sổ công nợ. ✅
