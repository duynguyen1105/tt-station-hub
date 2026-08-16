# Hướng dẫn sử dụng — Kế toán (web)

> Tài liệu dành cho kế toán Trường Thịnh. Hệ thống Hồ sơ Trạm giúp duyệt số chốt
> ca do AI đọc, quản lý giấy tờ, hàng tồn và công nợ theo lượt xe.

## 1. Đăng nhập

- Mở trang web hệ thống, đăng nhập bằng **tên đăng nhập + mật khẩu** do quản trị
  viên cấp. Không ai tự đăng ký tài khoản được.
- Tên đăng nhập có dạng `ten@truongthinh.local`. Nó **trông giống email nhưng
  không phải hộp thư** — hệ thống không gửi thư cho ai; điền nó vào ô **Email**
  ở trang đăng nhập.
- Quên mật khẩu thì gọi quản trị viên. Quản trị viên mở màn hình **Kế toán**,
  bấm **Đặt lại mật khẩu** trên dòng của bạn, đặt mật khẩu mới và đọc lại cho
  bạn. Bạn đăng nhập được ngay bằng mật khẩu đó; mật khẩu cũ hết dùng được. Việc
  đặt lại được ghi nhật ký, mật khẩu thì không.
- Không có chức năng "quên mật khẩu" tự phục vụ, và hệ thống không gửi email
  đặt lại.

## 2. Trạm bạn phụ trách

- **Quản trị viên** quyết định bạn phụ trách những trạm nào. Mỗi trạm chỉ có
  **một** kế toán phụ trách; một kế toán có thể phụ trách nhiều trạm.
- Mọi màn hình trong tài liệu này chỉ hiển thị **những trạm bạn phụ trách** —
  danh sách trạm, trang tổng thể, hàng chờ duyệt, tải ảnh và báo cáo MISA. Mở
  đường dẫn tới một trạm không phải của bạn thì hệ thống đưa bạn về danh sách
  trạm.
- Cần xem hoặc duyệt một trạm khác (nghỉ phép, bàn giao...) thì đề nghị quản
  trị viên chuyển trạm đó sang bạn. Trạm chuyển sang ai thì người cũ thôi phụ
  trách trạm đó.
- Chưa phụ trách trạm nào thì các màn hình hiện **trống** (không phải lỗi).

## 3. Trang tổng thể

- Xem nhanh **các trạm bạn phụ trách**: ca đang chờ duyệt, giấy tờ sắp hết hạn,
  tồn thấp, công nợ quá hạn. Đây không phải bảng tổng hợp toàn công ty — số của
  trạm người khác phụ trách không nằm ở đây.

## 4. Duyệt chốt ca (mục **Cần duyệt → Chốt ca**)

Hàng chờ chỉ liệt kê ca của **các trạm bạn phụ trách**.

1. AI đọc số đồng hồ từ ảnh nhân viên gửi qua Zalo và điền sẵn (bản nháp).
2. Mỗi dòng hiển thị: trụ, số điện tử, số cơ, ảnh, độ tin cậy (%).
3. Việc của kế toán:
   - **Duyệt** nếu số đúng.
   - **Sửa số** nếu AI đọc sai → hệ thống **giữ lại số gốc AI đọc** và lưu số mới.
   - **Từ chối** nếu ảnh không dùng được.
4. Dấu cảnh báo (số giảm, chênh lệch lớn, hai đồng hồ lệch, ảnh mờ, thiếu ảnh)
   sẽ được tô để ưu tiên kiểm tra.
5. Khi tất cả dòng đã duyệt → bấm **Chốt ca**.

## 5. Giấy tờ pháp lý (tab **Giấy tờ**)

- Thêm/sửa giấy tờ, đính kèm bản scan, nhập ngày hết hạn.
- Màu trạng thái: **xanh** (còn hạn), **vàng** (sắp hết — trong 60 ngày),
  **đỏ** (hết hạn). Hệ thống tự nhắc trước **60 / 30 / 15 ngày**.

## 6. Hàng tồn (tab **Hàng tồn**)

- **Tồn ước tính** = tồn đầu + nhập − bán (tự tính từ ca đã duyệt).
- Nhập lệnh **nhập hàng**, nhập **tồn thực** (đo bồn) → xem chênh lệch.
- Cảnh báo khi tồn dưới ngưỡng.

## 7. Công nợ theo lượt xe (tab **Công nợ**)

- Hàng chờ ở **Cần duyệt → Công nợ** chỉ có lượt xe của các trạm bạn phụ trách.
  Chuyển một lượt xe sang trạm khác cũng chỉ chuyển được vào trạm bạn phụ trách.
- AI đọc **số lít** và **đơn giá** từ ảnh đồng hồ; hệ thống **tự tính tiền =
  lít × đơn giá** (KHÔNG dùng số tiền hiển thị vì có thể bị cụt số).
- Kế toán **xác nhận biển số** và số liệu, gán đúng khách.
- Ghi **thanh toán** → hệ thống trừ vào công nợ (ưu tiên nợ cũ nhất).

## 8. Tải ảnh (mục **Tải ảnh**)

- Dùng khi ảnh không gửi qua Zalo được. Ô chọn trạm chỉ liệt kê **trạm bạn phụ
  trách**, và ô chọn trụ chỉ liệt kê trụ của trạm đã chọn.

## 9. Xuất MISA (mục **Báo cáo MISA**)

- Chọn ca → tải file Excel để import vào MISA Nội bộ.
- Bảng chỉ liệt kê ca của **các trạm bạn phụ trách**.

## 10. Nguyên tắc quan trọng

- Quản trị viên quyết định bạn phụ trách trạm nào; đó cũng là ranh giới của
  những gì bạn đọc được.
- AI chỉ **làm nháp**; kế toán là người **duyệt cuối**.
- Mọi chỉnh sửa đều được ghi nhật ký (ai sửa, sửa gì, khi nào).
