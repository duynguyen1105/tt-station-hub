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
  bấm vào tên bạn để mở trang của bạn, bấm **Đặt lại mật khẩu** ở đó, đặt mật
  khẩu mới và đọc lại cho bạn. Bạn đăng nhập được ngay bằng mật khẩu đó; mật khẩu cũ hết dùng được. Việc
  đặt lại được ghi nhật ký, mật khẩu thì không.
- Không có chức năng "quên mật khẩu" tự phục vụ, và hệ thống không gửi email
  đặt lại.

## 2. Trạm bạn phụ trách

- **Quản trị viên** quyết định bạn phụ trách những trạm nào. Một kế toán phụ
  trách được nhiều trạm, và **một trạm cũng có thể có nhiều kế toán cùng phụ
  trách** — những người đó ngang nhau, không ai là chính, không ai là người thay.
- Mọi màn hình trong tài liệu này chỉ hiển thị **những trạm bạn phụ trách** —
  danh sách trạm, trang tổng thể, hàng chờ duyệt, tải ảnh và báo cáo MISA. Mở
  đường dẫn tới một trạm không phải của bạn thì hệ thống đưa bạn về danh sách
  trạm.
- Cần xem hoặc duyệt thêm một trạm khác (nghỉ phép, hỗ trợ đồng nghiệp...) thì đề
  nghị quản trị viên thêm bạn vào trạm đó. Việc này **không lấy trạm khỏi ai**:
  người đang phụ trách vẫn phụ trách như cũ.
- Trạm chung với đồng nghiệp thì ai phụ trách trạm đó cũng duyệt được ca, giấy tờ,
  hàng tồn và công nợ của trạm. Hệ thống không giữ phần việc cho riêng ai, nên
  những người cùng phụ trách tự thống nhất với nhau ai làm gì.
- Chưa phụ trách trạm nào thì các màn hình hiện **trống** (không phải lỗi).

## 3. Trang tổng thể

- Xem nhanh **các trạm bạn phụ trách**: ca đang chờ duyệt, giấy tờ sắp hết hạn,
  tồn thấp, công nợ quá hạn. Đây không phải bảng tổng hợp toàn công ty — số của
  trạm bạn không phụ trách không nằm ở đây. Trạm bạn phụ trách chung với đồng
  nghiệp thì có, và ai phụ trách trạm đó cũng thấy.

## 4. Duyệt chốt ca (mục **Cần duyệt → Chốt ca**)

Hàng chờ chỉ liệt kê ca của **các trạm bạn phụ trách**.

1. AI đọc số đồng hồ từ ảnh được tải lên ở mục **Tải ảnh** và điền sẵn (bản nháp).
   Số đọc từ ảnh chốt ca (điện tử và cơ) được **làm tròn xuống** số nguyên, vd
   `12345.7` → `12345`; số đầu ca luôn lấy **đúng** số cuối ca trước (kể cả số lẻ cũ), nên không lít nào bị tính trùng.
   Số bạn tự gõ (Sửa số, nhập tay) giữ nguyên như gõ. Ảnh công nợ và đo bồn không
   làm tròn.
2. Mỗi dòng hiển thị: trụ, số điện tử, số cơ, ảnh, độ tin cậy (%).
3. Việc của kế toán:
   - **Duyệt** nếu số đúng.
   - **Sửa số** nếu AI đọc sai → hệ thống **giữ lại số gốc AI đọc** và lưu số mới.
   - **Từ chối** nếu ảnh không dùng được.
4. Dấu cảnh báo (số giảm, chênh lệch lớn, hai đồng hồ lệch, ảnh mờ, thiếu ảnh)
   sẽ được tô để ưu tiên kiểm tra.
5. Khi tất cả dòng đã duyệt → bấm **Chốt ca**. Ca đã chốt bị **khoá với mọi
   người**; muốn sửa thì nhờ quản trị viên **Mở lại ca** (xem mục 11).

## 5. Giấy tờ pháp lý (tab **Giấy tờ**)

- Thêm giấy tờ, đính kèm bản scan, nhập ngày hết hạn. Sửa hoặc xóa giấy tờ đã
  lưu: nhờ quản trị viên.
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

1. Nhận ảnh từ nhân viên trạm, mở **Tải ảnh**, chọn **Trạm** bạn phụ trách và
   **Ngày**. Ngày mặc định là hôm nay; chọn ngày trước đó để **tải bù** (không chọn
   ngày tương lai).
2. Chọn phần phù hợp: **Chốt ca** (ảnh đồng hồ từng trụ), **Công nợ** (ảnh từng
   lượt xe), hoặc **Đo bồn** (ảnh que/đồng hồ đo). Kéo thả ảnh vào phần đó hoặc
   bấm để chọn nhiều ảnh, tối đa 50 ảnh mỗi phần cho một lần gửi.
3. Có thể nhập một **Tin nhắn** cho lần gửi (tối đa 500 ký tự). Tên người tải
   ảnh và tin nhắn hiện cùng ảnh/lượt để người duyệt đối chiếu; với khách mang
   can, ghi tên khách vào đây.
4. Với **Công nợ**, xếp 2 ảnh cho mỗi lượt: ảnh 1–2 là lượt 1, ảnh 3–4 là
   lượt 2… AI tự phân biệt ảnh xe (biển số) và ảnh màn hình trụ trong từng cặp,
   nên thứ tự hai ảnh trong cặp không quan trọng. Bấm một ảnh rồi bấm ảnh khác
   để **đổi chỗ**, hoặc bấm **✕** để **bỏ ảnh**. Nếu còn ảnh lẻ, cần thêm/bỏ
   một ảnh trước khi gửi.
5. Nếu khách **không có ảnh xe (khách mang can)**, đánh dấu ô đó: mỗi ảnh màn
   hình trụ là một lượt riêng, không cần ghép cặp; ghi tên khách trong
   **Tin nhắn**.
6. Bấm **Gửi** ở phần cần tải. Ảnh **Chốt ca** có nhãn trạm khác sẽ vào đúng
   trạm ghi trên trụ. Không ai thêm được ảnh chốt ca vào ca **đã chốt**; quản
   trị viên phải **Mở lại ca** trước. Kết quả đọc ảnh chốt ca/công nợ nằm trong
   **Cần duyệt** để kiểm tra, sửa số và duyệt; ảnh đo bồn nằm ở **Tồn kho**.

## 9. Xuất MISA (mục **Báo cáo MISA**)

- Chọn ca → bấm **Xuất MISA** → tải file Excel để import vào MISA. Mỗi ca có 3 file:
  - **Chứng từ bán hàng** (như trước).
  - **Phiếu thu**: mỗi dòng có số **Thu** trong bảng Thu chi tiền mặt của ca là 1 dòng.
  - **Phiếu chi**: mỗi dòng có số **Chi** là 1 dòng.
- Phiếu thu / Phiếu chi chỉ điền sẵn Ngày hạch toán, Ngày chứng từ (lấy theo ngày chọn
  trong hộp), Diễn giải lý do (= Nội dung), Diễn giải, TK tiền mặt 11111 (Nợ ở phiếu
  thu, Có ở phiếu chi) và Số tiền. **Các cột còn lại kế toán tự điền trong MISA** (Số
  chứng từ, đối tượng, tài khoản đối ứng…). Nút mờ đi nếu ca không có dòng Thu / Chi.
- Bảng chỉ liệt kê ca của **các trạm bạn phụ trách**.

## 10. Nguyên tắc quan trọng

- Quản trị viên quyết định bạn phụ trách trạm nào; đó cũng là ranh giới của
  những gì bạn đọc được.
- AI chỉ **làm nháp**; kế toán là người **duyệt cuối**.
- Mọi chỉnh sửa đều được ghi nhật ký (ai sửa, sửa gì, khi nào).

## 11. Quản trị viên sửa số liệu đã duyệt / đã chốt

Kế toán sửa được số **chưa duyệt** của ca **chưa chốt**. Số đã Duyệt / Từ chối
hoặc ca đã chốt thì chỉ **quản trị viên** sửa được:

- **Chốt ca, dòng đã Duyệt / Từ chối**: quản trị viên bấm vào số để sửa. Dòng giữ
  nguyên trạng thái, số AI đọc gốc vẫn được giữ, số đầu của các ca sau (kể cả dòng
  đã duyệt) tự cập nhật theo.
- **Ca đã chốt**: quản trị viên bấm **Mở lại ca** → phần bán đã trừ kho được hoàn
  lại, ca về "chờ duyệt" → sửa → bấm **Chốt ca** lại. Sau đó **xuất lại file
  MISA** của ca đó.
- **Sửa số cuối của một ca mà ca ngày sau đã chốt**: hệ thống từ chối và báo ngày
  của ca sau, vì ca đó đã trừ kho theo số đầu cũ. Mở lại **cả ca sau**, sửa ca
  trước (số đầu ca sau tự đổi theo), rồi chốt lại cả hai ca — tổng bán không bị
  tính trùng.
- **Công nợ**: ở **Cần duyệt → Công nợ → Đã xử lý** (chọn ngày bán), quản trị viên
  sửa số / từ chối lượt xe đã duyệt, hoặc duyệt lại lượt đã từ chối. Sổ công nợ
  của khách tự cập nhật đúng một lần ghi nợ.
- **Đo bồn** đã duyệt / từ chối: sửa số đo, hầm ngay trên dòng; "So với lần
  trước" tự tính lại.
- **Nhập hàng**: mở phiếu → **Sửa phiếu** (ngày, tài xế, xe bồn, số lượng / số
  lít từng hầm…). Tồn kho tự điều chỉnh theo chênh lệch.
- **Phát sinh nhập tay** (Hàng tồn → Sổ sách theo ngày): Sửa / Xóa.
- **Giấy tờ pháp lý**: Sửa / Xóa. **Thông tin trạm**: nút **Sửa thông tin trạm**
  ở đầu trang trạm (mã, tên, chi nhánh, địa chỉ).

Mọi lần sửa đều ghi nhật ký (ai sửa, số cũ, số mới, lúc nào).
