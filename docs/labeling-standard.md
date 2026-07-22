# CHUẨN DÁN NHÃN TRỤ BƠM & HẦM — áp dụng cho tất cả 13 trạm

> Nhãn in trên trụ là thứ hệ thống AI đọc để tự nhận: **trạm nào → trụ nào → nhiên liệu gì**.
> Nhãn đúng chuẩn = ảnh gửi Zalo tự vào đúng chỗ, không cần cấu hình gì thêm.
> Chuẩn này đúc kết từ thí nghiệm 185 ảnh thật của 12 trạm (các lỗi nhận diện còn lại
> hầu hết do nhãn thiếu/không thống nhất).

## 1. Nội dung nhãn — 3 dòng, in hoa, đúng thứ tự

```
┌─────────────────────────┐
│      DAKNONG1           │   ← dòng 1: TÊN TRẠM (theo bảng mục 4)
│      TRU 1 - DO         │   ← dòng 2: TRU + số  -  MÃ NHIÊN LIỆU
│      HAM 3 - 25K        │   ← dòng 3 (tùy chọn): HẦM chứa + sức chứa (nghìn lít)
└─────────────────────────┘
```

- **Dòng 1 — Trạm**: **mã viết liền, không khoảng cách** (DAKNONG1, NGUYENVUONG…) theo bảng mục 4. Có dấu hay không dấu đều đọc được
  ("ĐAKNONG 1" = "DAKNONG 1"), nhưng nên in **không dấu** cho đồng nhất.
- **Dòng 2 — Trụ + nhiên liệu**: `TRỤ <số> - <mã>` (viết "TRỤ" hay "TRU" đều đọc được). Số trụ **không thêm số 0** (TRU 1,
  không phải TRU 01). Mỗi trụ một số, duy nhất trong trạm.
- **Dòng 3 — Hầm** (tùy chọn trên trụ, bắt buộc tại miệng hầm): `HAM <số> - <sức chứa>K`.

## 2. Mã nhiên liệu — CHỈ dùng 5 mã này

| Mã trên nhãn | Nghĩa           | Ghi chú                                                                                                |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------ |
| `DO`         | Dầu DO (diesel) |                                                                                                        |
| `E0`         | Xăng E0         | Số 0, không phải chữ O                                                                                 |
| `DC`         | Dầu DC          |                                                                                                        |
| `A95`        | Xăng A95        | ❌ KHÔNG viết "XA", "XĂNG", "95" trần — hệ thống từng đọc "TRU 2 XA" và không xác định được nhiên liệu |
| `URE`        | Urê             |                                                                                                        |

## 3. Vị trí dán — quy tắc "một khung hình"

**Nguyên tắc vàng: nhãn phải nằm LỌT trong cùng khung ảnh với mặt số khi nhân viên chụp.**

| Vị trí                                                                                                | Bắt buộc | Lý do                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cạnh **màn hình điện tử** (Montech/LungBor/màn 3 dòng)                                                | ✅       | Màn LungBor không tự hiện số trụ — thí nghiệm có 6 ảnh đọc được số nhưng **không biết của trụ nào** vì thiếu nhãn cạnh màn |
| Cạnh **đồng hồ cơ** (ô số lăn)                                                                        | ✅       | Ô số cơ thường nằm thấp, xa nhãn chính → chụp đồng hồ cơ hay bị mất nhãn                                                   |
| Tại **miệng hầm** (nhãn hầm: `HAM <số> - <sức chứa>K`, thêm mã nhiên liệu nếu muốn: `HAM 3 DO - 25K`) | ✅       | Cho ảnh đo bồn (tồn kho)                                                                                                   |

→ Thực tế mỗi trụ nên có **2 nhãn giống nhau**: 1 cạnh màn điện tử + 1 cạnh đồng hồ cơ.

## 4. Tên trạm chuẩn trên nhãn (khớp hệ thống)

| #   | Nhãn in     | #   | Nhãn in       |
| --- | ----------- | --- | ------------- |
| 1   | `DAKNONG1`  | 8   | `NGUYENVUONG` |
| 2   | `DAKNONG2`  | 9   | `TANHOA`      |
| 3   | `DAKNONG3`  | 10  | `PHUCTIEN`    |
| 4   | `DAKNONGVK` | 11  | `HTGDONGNAI`  |
| 5   | `DAKNONG5`  | 12  | `CXGNH`       |
| 6   | `LAMDONG01` | 13  | `NGANHA01`    |
| 7   | `LAMDONG02` |     |               |

(Mã viết liền, không khoảng cách. Hệ thống vẫn chấp nhận biến thể có dấu/có cách — "ĐẮK NÔNG 1", "LAMDONG 01" — nhưng in đúng cột trên để đồng nhất.)

## 5. Yêu cầu in ấn

- **Chữ in** (máy in / decal), ❌ **không viết tay**. Các ký hiệu viết tay như "D1", "X2"
  hệ thống chủ động **bỏ qua** (không tin) — chúng chỉ gây nhiễu.
- In HOA, nét đậm, **cao chữ ≥ 3 cm**, tương phản mạnh (nền trắng chữ đen hoặc ngược lại).
- Ép plastic / decal ngoài trời (chống nước, chống phai — nhiều nhãn hiện tại đã ố vàng, bong tróc).
- Không dán đè/che mặt số, không để nhãn cong vênh lóa đèn.

## 6. Checklist nghiệm thu 1 trạm (dán xong tự kiểm tra)

1. ☐ Mỗi trụ có nhãn ở **cả 2 vị trí** (màn điện tử + đồng hồ cơ), nội dung trùng nhau.
2. ☐ Tên trạm đúng bảng mục 4; số trụ liên tục 1..n không trùng.
3. ☐ Nhiên liệu chỉ dùng 5 mã: DO / E0 / DC / A95 / URE.
4. ☐ Mỗi hầm có nhãn `HAM <số> - <sức chứa>K` tại điểm đo.
5. ☐ **Chụp thử từng đồng hồ bằng điện thoại**: nhãn + mặt số lọt cùng khung, chữ đọc rõ.
6. ☐ Gửi loạt ảnh thử qua Zalo → kiểm tra trên app: ảnh vào đúng trạm, đúng trụ, đủ nhiên liệu.

## 7. Vì sao chuẩn này khớp hệ thống (cho dev/quản trị)

- Dòng trạm → định tuyến đa trạm (`matchStationByLabel`: bỏ dấu, chấp nhận zero-padding).
- `TRU <n>` → khớp trụ (`dispenserKey` đọc `TRU_<n>`, bỏ hậu tố nhiên liệu).
- Mã nhiên liệu → điền nhiên liệu cho công nợ (nhãn thắng suy-từ-giá vì giá nợ ≠ giá lẻ).
- `HAM <n>` → ảnh đo bồn tách sang luồng tồn kho.
- Nhãn cạnh màn LungBor → xóa nhóm lỗi "đọc được số nhưng không biết trụ nào".
