# Bán nợ KHÔNG có biển số xe (khách mang can / xe không rõ biển)

> Tài liệu nghiệp vụ + kỹ thuật cho luồng **bán nợ walk-in**: khách quen tới đổ nhiên liệu
> vào **can/thùng**, hoặc xe không chụp được biển số.

## 1. Khác gì so với bán nợ có xe?

|                       | Có xe (chuẩn)                                | Mang can / không biển số              |
| --------------------- | -------------------------------------------- | ------------------------------------- |
| Số ảnh nhân viên chụp | **2** — biển số xe + màn hình cây xăng       | **1** — chỉ màn hình cây xăng         |
| Nhận diện khách       | Tự động qua biển số (`known_plates`)         | **Kế toán chọn tay** khi duyệt        |
| Tin nhắn khi tải ảnh  | Không bắt buộc                               | **Ghi tên khách** để kế toán gán đúng |
| Duyệt & ghi nợ        | Giống nhau — chọn khách → Duyệt → cộng dư nợ | Giống nhau                            |

Điểm mấu chốt: **ảnh xe không bắt buộc**. Một lượt công nợ chỉ cần ảnh màn hình cây xăng
(số lít + đơn giá + thành tiền của giao dịch đó) là đủ để duyệt và ghi nợ.

## 2. Hướng dẫn NHÂN VIÊN trạm

1. Đổ xong, chụp **màn hình cây xăng** (thấy rõ 3 số: tiền / lít / đơn giá — kèm nhãn
   "TRỤ x – DO/E0/DC" càng tốt).
2. Gửi ảnh và **tên khách** cho kế toán phụ trách trạm qua kênh thuận tiện, ví dụ:
   **"chị Tư – mang can 20L"**. Không cần chụp can hay chụp người.

## 3. Hướng dẫn KẾ TOÁN (tải ảnh và duyệt)

1. Vào **Tải ảnh → Công nợ**, chọn trạm và ngày, đánh dấu
   **"Không có ảnh xe (khách mang can)"**, rồi chọn ảnh màn hình.
2. Ghi **tên khách** vào **Tin nhắn** và bấm **Gửi**. Mỗi ảnh ở chế độ này là
   một lượt công nợ riêng; nếu gửi nhiều ảnh cùng lúc, chúng dùng chung Tin nhắn.
3. Vào **Cần duyệt → Duyệt công nợ**. Thẻ lượt "mang can" có dạng:

- **Biển số: "—"** (không có ảnh xe → ô ảnh xe ghi "Không có ảnh")
- Khung vàng **"Ghi chú của nhân viên"**: _"Chị Tư – mang can 20L"_
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

- **Tải ảnh**: `POST /api/uploads` nhận từng lượt ở phần Công nợ: hai ảnh trong một cặp
  theo thứ tự trên màn hình (1–2, 3–4…), hoặc một ảnh màn hình cho mỗi lượt khi chọn
  **"Không có ảnh xe (khách mang can)"**. Người tải ảnh chọn trạm; trạm đã chọn là trạm
  của lượt công nợ. `pairHalves()` (`lib/photos/upload.ts`) dùng kết quả phân loại AI
  để xác định ảnh xe và ảnh trụ trong cặp; khi không phân biệt được, ảnh đầu là ảnh xe.
  Không ghép ảnh dựa trên thời điểm gửi hay người gửi.
- **Số lít (dấu phẩy ngầm)**: màn hình trụ hiện LÍT không dấu ("340000" = 340,000 L). Dòng
  tiền cắt chữ số cuối khi ≥ 1.000.000 đ nên **không** phân biệt được 34 L với 340 L bằng
  số học — `resolveLiters()` (`lib/ai/extract-visit.ts`) đặt dấu theo thứ tự: dấu chấm AI
  thấy rõ → 3 số thập phân ngầm (`DEFAULT_LITERS_DECIMALS`) → thang khác của
  cùng dãy số (gắn `liters_rescaled`, buộc kiểm tra). Số học chỉ **xác nhận**, không chọn.
- **Tạo lượt**: `assembleDebtVisit()` (`lib/photos/ingest.ts`) tạo đúng một
  `DebtVehicleVisit` cho mỗi cặp, hoặc một lượt chỉ có `meter_photo_id` khi không có
  ảnh xe. Cả ảnh AI không đọc được vẫn nằm trong lượt; kế toán dùng **Sửa số** để
  điền số. Tin nhắn chung của lần gửi lưu ở `debt_vehicle_visits.sender_note` và
  `shift_photos.sender_note`; tên người tải lưu ở `shift_photos.sender_name`.
  Lượt không có ảnh xe vẫn ở hàng chờ duyệt để kế toán chọn khách.
- **Duyệt**: `POST /api/debts/visits/[id]/approve` yêu cầu `customerId` + `computedAmount`;
  không yêu cầu biển số/ảnh xe. `reviewStatus` không bao giờ tự auto-approve với công nợ.
- **Khách mới inline**: `POST /api/debts/customers` (mã bắt buộc, cấm `bl`, biển số
  uppercase); UI `CustomerForm` dùng chung cho thẻ duyệt (nút `+`, auto-select sau tạo)
  và sổ công nợ trạm (+ Thêm khách mới / Sửa).
- **Giới hạn hiện tại**: tối đa 50 ảnh và một Tin nhắn tối đa 500 ký tự cho mỗi
  lần gửi (không có ghi chú riêng cho từng lượt). Nếu một yêu cầu đã được lưu
  nhưng phản hồi bị mất, gửi lại có thể tạo lượt trùng; đối chiếu ảnh khi duyệt
  để từ chối lượt trùng.

## 6. Ví dụ duyệt lượt khách mang can

1 ảnh màn LED xanh (816000 / 34.000 / 24000, nhãn "TRỤ 1 – DO") được tải lên
ở phần **Công nợ** với ô **"Không có ảnh xe (khách mang can)"** và Tin nhắn
_"Chị Tư – mang can 20L"_ →

- Ví dụ số đọc: 34 lít × 24.000 = **816.000** (khớp số hiển thị), nhiên liệu **DO**.
- Thẻ duyệt: biển số "—", ghi chú 💬 hiển thị, 1 ảnh.
- Tạo khách "Chị Tư" (mã `KH002`) qua nút `+` → tự chọn → **Duyệt** → ghi nợ
  **816.000** cho Chị Tư trong sổ công nợ.
