# Hướng dẫn cấu hình Zalo OA — Hồ sơ Trạm Trường Thịnh

> Dành cho người **quản trị Zalo OA** của công ty. Mục tiêu: cho phép hệ thống
> Hồ sơ Trạm **nhận ảnh** nhân viên gửi qua Zalo và **tự động đọc số đồng hồ**,
> đồng thời **trả lời xác nhận** lại nhân viên.

---

## A. 3 thông tin cần gửi cho đội kỹ thuật

1. **App ID** (mã ứng dụng)
2. **App Secret Key** (khóa bí mật ứng dụng) — dùng để xác thực dữ liệu webhook
3. **Access Token** **và** **Refresh Token** của OA

> ⚠️ **Access Token hết hạn sau ~1 giờ**; **Refresh Token** (hạn ~3 tháng) dùng để
> tự gia hạn. Vui lòng gửi **cả hai**, hệ thống sẽ tự động làm mới token.

---

## B. Các bước lấy thông tin (người quản trị OA thực hiện)

1. Truy cập **Zalo for Developers** (`developers.zalo.me`), đăng nhập bằng tài khoản
   có **quyền quản trị OA** của công ty.
2. **Tạo mới** (hoặc mở) một **Ứng dụng (Application)** và **liên kết với Official
   Account** của công ty.
3. Vào phần thông tin ứng dụng → lấy **App ID** và **App Secret Key**.
4. **Cấp quyền** cho ứng dụng: quyền **Quản lý tin nhắn và hội thoại** của OA
   (để nhận ảnh và trả lời tin nhắn). Người quản trị OA phải bấm **đồng ý cấp quyền**.
5. Tạo **Access Token** (kèm **Refresh Token**) bằng công cụ tạo token của Zalo
   trong trang ứng dụng.

> Lưu ý: kiểm tra **gói/quyền của OA** có cho phép gửi/nhận tin nhắn qua API không.

---

## C. Cấu hình Webhook

- Đặt **Webhook URL** trỏ về hệ thống:
  `https://<địa-chỉ-hệ-thống>/api/zalo/webhook`
  (Giai đoạn thử nghiệm: đội kỹ thuật sẽ cung cấp một URL tạm thời.)
- Bật nhận **sự kiện tin nhắn từ người dùng**, đặc biệt là **gửi ảnh**
  (`user_send_image`).
- Webhook được xác thực tự động bằng **App Secret Key** (đội kỹ thuật xử lý).

---

## D. ⭐ Việc cần KIỂM TRA quan trọng nhất: Nhóm hay Chat riêng?

Hiện nhân viên gửi ảnh vào **NHÓM Zalo** của trạm. Cần xác nhận với Zalo:
**OA có nhận được tin nhắn/ảnh gửi trong NHÓM hay không?**

- ✅ **Nếu CÓ**: giữ nguyên cách làm — thêm OA vào nhóm trạm, nhân viên gửi ảnh
  vào nhóm như bình thường.
- ⚠️ **Nếu KHÔNG** (thường gặp, vì OA chủ yếu hỗ trợ **chat 1-1**): nhân viên gửi
  ảnh **trực tiếp cho OA của trạm** — thay đổi thói quen rất nhỏ, mọi thứ khác
  giữ nguyên.

👉 **Vui lòng thử nghiệm thực tế và báo lại kết quả** (đây là yếu tố quyết định
cách triển khai).

---

## E. Dữ liệu ánh xạ (để hệ thống biết ảnh thuộc trạm nào)

- Nếu dùng **nhóm**: gửi **ID nhóm Zalo** của **từng trạm** (13 trạm).
- Nếu dùng **1-1**: gửi **danh sách Zalo** (tên / số điện thoại / Zalo ID) của
  **nhân viên từng trạm**.

---

## F. Checklist bàn giao cho đội kỹ thuật

- [ ] App ID
- [ ] App Secret Key
- [ ] Access Token + Refresh Token
- [ ] Đã cấp quyền "Quản lý tin nhắn và hội thoại"
- [ ] Kết quả kiểm tra: **Nhóm** được hay phải **1-1**
- [ ] Danh sách nhóm Zalo / nhân viên theo từng trạm

---

## Bảo mật

Các **khóa và token** là thông tin nhạy cảm. Vui lòng gửi qua **kênh an toàn**
(không nhắn công khai, không đăng lên nhóm chung). Hệ thống lưu các khóa này ở
nơi cấu hình riêng, không đưa lên mã nguồn công khai.
