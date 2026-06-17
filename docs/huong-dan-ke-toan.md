# Hướng dẫn sử dụng — Kế toán (web)

> Tài liệu dành cho kế toán Trường Thịnh. Hệ thống Hồ sơ Trạm giúp duyệt số chốt
> ca do AI đọc, quản lý giấy tờ, hàng tồn và công nợ theo lượt xe.

## 1. Đăng nhập

- Mở trang web hệ thống, đăng nhập bằng **email + mật khẩu** được cấp.
- Nếu quên mật khẩu, liên hệ quản trị viên (admin).

## 2. Trang tổng thể

- Xem nhanh tất cả các trạm: ca đang chờ duyệt, giấy tờ sắp hết hạn, tồn thấp,
  công nợ quá hạn.

## 3. Duyệt chốt ca (mục **Cần duyệt → Chốt ca**)

1. AI đọc số đồng hồ từ ảnh nhân viên gửi qua Zalo và điền sẵn (bản nháp).
2. Mỗi dòng hiển thị: trụ, số điện tử, số cơ, ảnh, độ tin cậy (%).
3. Việc của kế toán:
   - **Duyệt** nếu số đúng.
   - **Sửa số** nếu AI đọc sai → hệ thống **giữ lại số gốc AI đọc** và lưu số mới.
   - **Từ chối** nếu ảnh không dùng được.
4. Dấu cảnh báo (số giảm, chênh lệch lớn, hai đồng hồ lệch, ảnh mờ, thiếu ảnh)
   sẽ được tô để ưu tiên kiểm tra.
5. Khi tất cả dòng đã duyệt → bấm **Chốt ca**.

## 4. Giấy tờ pháp lý (tab **Giấy tờ**)

- Thêm/sửa giấy tờ, đính kèm bản scan, nhập ngày hết hạn.
- Màu trạng thái: **xanh** (còn hạn), **vàng** (sắp hết — trong 60 ngày),
  **đỏ** (hết hạn). Hệ thống tự nhắc trước **60 / 30 / 15 ngày**.

## 5. Hàng tồn (tab **Hàng tồn**)

- **Tồn ước tính** = tồn đầu + nhập − bán (tự tính từ ca đã duyệt).
- Nhập lệnh **nhập hàng**, nhập **tồn thực** (đo bồn) → xem chênh lệch.
- Cảnh báo khi tồn dưới ngưỡng.

## 6. Công nợ theo lượt xe (tab **Công nợ**)

- AI đọc **số lít** và **đơn giá** từ ảnh đồng hồ; hệ thống **tự tính tiền =
  lít × đơn giá** (KHÔNG dùng số tiền hiển thị vì có thể bị cụt số).
- Kế toán **xác nhận biển số** và số liệu, gán đúng khách.
- Ghi **thanh toán** → hệ thống trừ vào công nợ (ưu tiên nợ cũ nhất).

## 7. Xuất MISA (mục **Báo cáo MISA**)

- Chọn ca → tải file Excel để import vào MISA Nội bộ.

## 8. Nguyên tắc quan trọng

- AI chỉ **làm nháp**; kế toán là người **duyệt cuối**.
- Mọi chỉnh sửa đều được ghi nhật ký (ai sửa, sửa gì, khi nào).
