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
- **Hàng nhập:** đúng **4 cột in sẵn `E0 · EA · DO · DC`** của biên bản chuẩn —
  kho xuất, số lượng, số phiếu xuất kho. Cột nào chuyến này không có hàng thì để
  trống (EA hiện chưa trạm nào bán); **một trong 4 cột chuẩn mà bỏ trống thì
  không sinh gì cả** — không lưu mặt hàng, không đem đối chiếu với hầm nào (4
  tiêu đề đó do app in ra nên app tự bỏ được). Giấy kiểu cũ ghi cột khác
  ("RON 95", "DO 0.05S") thì cột đó hiện **thêm** vào sau 4 cột chuẩn, và
  **luôn được lưu** — chữ do người rà soát đọc từ giấy thì không tự ý bỏ.
- **Số niêm chì & tình trạng:** **một ô cho cả biên bản** — đúng như ô gộp trên
  giấy chuẩn, không còn mỗi cột một ô. Giấy kiểu cũ ghi niêm chì theo từng cột
  thì các số đó được gộp vào ô này để rà soát.
- **a. Ngăn xe bồn 1-5:** số lít, vị trí lưỡi gà, lít bơm bù, nhiệt độ trên xe.
- **b. Kiểm tra phương tiện:** tình trạng hàng hóa (nước, cặn).
- **c. Kiểm tra hầm:** trước/sau nhập (nhiệt độ, chiều cao mm, SL sổ sách, SL
  barem) + cột **"Nhập vào hầm (lít)"** — chính số này được cộng vào tồn kho,
  mỗi hầm có nhận hàng sinh một phiếu nhập riêng. **SL barem và Nhập vào hầm
  do app tự tra từ Barem của Trường Thịnh**, xem mục *Barem: từ chiều cao ra số
  lít* bên dưới. Dòng nào thuộc hầm nào: xem *Dòng trên giấy thuộc hầm nào*.
- **d. Trụ bơm:** **mỗi trụ của trạm một dòng** (kể cả trụ AI đọc không ra —
  dòng trống vẫn hiện, vì thiếu một dòng là mất luôn bằng chứng trụ đó đứng yên),
  total điện tử + cơ trước/sau, kèm cột **chênh lệch tự tính** — phải bằng 0
  (không bán trong lúc nhập); khác 0 hiện đỏ để soát lại ngay, **và báo lên đúng
  dòng hầm ở mục (c)** mà trụ đó hút, xem *Trụ chạy thì số đo hầm đáng ngờ*.
- **e. Ghi chú.**

Sửa chỗ AI đọc chưa đúng rồi bấm **"Xác nhận & lưu phiếu"** → biên bản + các
phiếu nhập theo hầm được lưu, tồn kho **tự cộng**, hình biên bản đính kèm phiếu.

**Bước 3 — Hình ảnh liên quan.** Tải lên **tất cả** hình của ca nhập (niêm chì,
đồng hồ xe bồn, đo que, trụ bơm…). Toàn bộ được lưu trữ theo biên bản để **đối
soát về sau**. Có thể bấm "Để sau" nếu chưa có hình.

Trong bảng "Nhập hàng gần đây", chứng từ hiện theo nhãn: `BB…` = trang biên
bản, `HA…` = hình liên quan, `CT…` = chứng từ gắn trực tiếp phiếu (kiểu cũ).

### Biên bản chuẩn (cập nhật 12/08/2026)

Trường Thịnh đã phát hành **BIÊN BẢN GIAO NHẬN XĂNG DẦU chuẩn**, mỗi trạm một
mẫu in sẵn, 13 mẫu (`docs/BB GIAONHANXD/`). Khác tờ cũ ở 4 chỗ:

- **Bảng hàng nhập cố định 4 cột `E0 · EA · DO · DC`** thay vì cột tự do
  ("RON 95", "E5 RON 92", "DO 0.05S"). `EA` là **xăng E5** — chưa trạm nào bán,
  cột in sẵn cho sau này, để trống là đúng. App **không** quy `EA`/`E5` về `E0`:
  hai loại xăng khác nhau, quy nhầm là ghi hàng vào sai hầm.
- **`Số niêm chì` là một ô gộp** cho cả bảng — một số niêm chì cho cả biên bản.
- **Danh sách hầm và trụ của chính trạm đó được in sẵn.** Hầm ghi kiểu
  `1. DO 10K`, `2.E0 - 12K`, LAMDONG02 thì chỉ `DC - 9K`; trụ ghi `1- DO`, hoặc
  chỉ `DO`. **Chữ HẦM và TRỤ không còn xuất hiện trong nhãn dòng.**
- Câu ghi chú và vị trí tiêu đề "Tình trạng trụ bơm" mỗi mẫu một khác — chỉ là
  hình thức, AI không bám vào đó.

**Giấy kiểu cũ vẫn dùng được**: AI vẫn đọc, và thang khớp hầm vẫn nhận dạng
`HẦM 2 12K`. Trạm còn tồn tờ cũ trong ngăn kéo cứ nhập bình thường.

Biên bản **đã lưu trước đây giữ nguyên**: niêm chì theo từng cột, cột hàng tự do
— app không viết lại dữ liệu cũ.

### Biên bản của trạm khác thì không nhập được (cập nhật 12/08/2026)

Biên bản chuẩn in sẵn tên trạm ở đầu tờ, kèm mã trong ngoặc:
`CỬA HÀNG BÁN LẺ XĂNG DẦU TRƯỜNG THỊNH SỐ 2 (DAKNONG2)`. Trạm đang nhập thì lấy
theo trang web đang mở, nên chụp nhầm tờ biên bản của trạm khác là app sẽ khớp
các dòng mục (c) vào **hầm của trạm này** — trạm kế bên cũng bán đúng loại nhiên
liệu đó với dung tích na ná, nên dòng nào cũng khớp trót lọt và tồn kho của **cả
hai trạm** cùng sai, không báo gì cả.

Nên sau khi bấm **"Đọc biên bản (AI)"**, app đối chiếu tên trạm in trên giấy với
trạm đang nhập. Không khớp thì **dừng luôn ở bước 1**, không dựng form rà soát:

```
⛔ Biên bản này không phải của trạm này
   Giấy ghi:    Trạm Đăk Nông 2 (DAKNONG2)
   Đang nhập cho: Trạm Đăk Nông 1 (DAKNONG1)
   Chọn lại hình biên bản, hoặc mở trang Tồn kho của đúng trạm đó
   để nhập biên bản này.
```

Đây là **chỗ duy nhất trong luồng nhập hàng chặn hẳn**, không phải cảnh báo
(ADR 0006). Các chỗ khác — dòng không khớp hầm, không tra được barem, trụ chạy —
đều là "app chưa tính ra được", và giấy vẫn lưu. Còn cái này thì chính tờ giấy
khai nó thuộc trạm khác: nhập ở đây không có cách hiểu nào là đúng, mà mở trang
Tồn kho của đúng trạm đó rồi nhập lại thì chẳng mất gì.

**Chỉ chặn khi chắc chắn.** Giấy kiểu cũ không in mã trạm, AI đọc không ra đầu
tờ, hay trạm chưa có trong danh sách nào cả → app **không nói gì**, nhập bình
thường. Danh sách trạm đem đối chiếu gồm cả **13 mã in trên biên bản chuẩn**
(`lib/imports/station-rosters.ts`), nên tờ của một trạm chưa cấu hình trong
database vẫn bị nhận ra là "không phải trạm này".

**Nút "Bỏ qua AI, nhập tay" vẫn dùng được** sau khi bị chặn — cố ý để vậy. Gõ tay
lại từng ô là đủ mệt để không ai lách bằng đường đó, và nó bảo đảm một lần AI đọc
sai đầu tờ không bao giờ khóa mất một chuyến hàng đã về thật.

### Dòng trên giấy thuộc hầm nào (cập nhật 12/08/2026)

Biên bản chuẩn ghi hầm là `1. DO 10K`, `2.E0 - 12K`, LAMDONG02 thì chỉ `DC - 9K`
— **không còn chữ HẦM**. Mỗi dòng mục (c) được **thang khớp hầm** (ADR 0004,
`lib/imports/binding-ladder.ts`) gán vào một hầm: theo số in trên dòng, hoặc theo
nhiên liệu + dung tích khi giấy không đánh số. Danh sách hầm để đối chiếu là
**database** khi trạm đã cấu hình, và **danh sách in trên giấy**
(`lib/imports/station-rosters.ts`) khi chưa — hàng về trạm chưa cấu hình vẫn khớp
được.

- **Khớp được** → đúng dòng của hầm đó: tra Barem, điền SL barem và Nhập vào hầm,
  xác nhận thì sinh phiếu nhập và tồn kho tăng.
- **Không khớp được** → dòng vẫn giữ nguyên chiều cao, nhiệt độ, SL sổ sách và
  hiện lý do tiếng Việt: *"Số hầm trùng trên biên bản"* (hai hầm cùng ghi `3.` như
  HTGDONGNAI), *"Nhiên liệu / dung tích không khớp cấu hình hầm"*, *"Không xác
  định được hầm"*. Dòng đó **không tra Barem, không sinh phiếu nhập** — nhưng
  **biên bản vẫn lưu được**: giấy là chứng từ pháp lý, một dòng chưa quy được về
  hầm không được chặn cả chuyến hàng.

Nhãn hầm hiển thị đúng như in trên giấy và **không sửa được trong form** — sửa
nhãn không phải việc của kế toán; sửa chiều cao thì dòng tra lại.

### Trụ chạy thì số đo hầm đáng ngờ (cập nhật 12/08/2026)

Mục (d) có mặt để chứng minh **không bán gì trong lúc nhập**. Vì vậy các dòng của
mục (d) là **trụ của trạm** (lấy từ `dispensers`, hoặc từ danh sách in trên giấy
khi trạm chưa cấu hình), không phải chỉ những trụ AI đọc ra: trụ nào AI bỏ sót
vẫn hiện thành **dòng trống** để nhân viên điền, chứ không biến mất.

`dispensers.tank_code` cho biết mỗi trụ hút từ hầm nào. Nên khi một trụ có chênh
lệch khác 0, app báo ngay **trên dòng hầm đó ở mục (c)**: *"Trụ 2 chạy 12 L trong
lúc nhập — số đo hầm này có thể sai"*. Nghĩa là trong lúc đo chiều cao thì xăng
dầu vẫn đang ra khỏi hầm, nên **số "Nhập vào hầm" của dòng đó không đáng tin**.

Đây là **cảnh báo, không phải khóa**: biên bản vẫn xác nhận và lưu được, vẫn sinh
phiếu nhập. Giấy là chứng từ pháp lý, người ký mới là người quyết định — app chỉ
có trách nhiệm nói ra điều nó thấy. Trạm chưa cấu hình trụ trong database thì
không biết trụ hút hầm nào, nên chỉ hiện chênh lệch đỏ ở mục (d), không gán vào
hầm nào cả.

### Barem: từ chiều cao ra số lít (cập nhật 13/08/2026)

Mục (c) không còn lấy số của AI đọc từ chữ viết tay nữa. Với **mỗi chiều cao (mm)**
trong bảng, app tra **Barem** của chính hầm đó — bảng chuẩn do Trường Thịnh phát
hành.

**Barem nằm ở trang tính của Trường Thịnh, app không giữ bản nào cả.** Mỗi lần tra
là đọc thẳng trang tính Google ngay lúc đó — không lưu vào database, server không
cache gì cả (ADR 0005). Nên **sửa một số trong trang tính thì chiều cao gõ tiếp theo
đã ăn số mới**: không cần lệnh, không cần developer, không cần deploy. Và không có
bản sao nào để lệch với bảng Barem trạm đang giữ trong tay. (Trong **một** form
đang mở, chiều cao nào đã tra rồi thì không hỏi lại — chiều cao trùng nhau giữa các
dòng là chuyện thường. Sửa trang tính lúc đang rà soát thì thấy ở chiều cao chưa
tra, hoặc mở lại form.)

- **SL barem trước/sau** = số lít Barem ghi cho chiều cao đó (khớp **đúng
  milimét**, không nội suy). Số AI đọc được trên giấy vẫn giữ nguyên trong
  `raw_extract`; nếu **lệch ≥ 1 lít** so với Barem thì hiện **đỏ** ngay dưới ô
  ("Giấy ghi …") để soát lại — chép sai số trong sổ trạm là chuyện có thật.
- **Nhập vào hầm (lít) = SL barem sau − SL barem trước** — tức số lít **hầm thực
  nhận**, không phải số nhà cung cấp khai. Số lượng trên phiếu giao của mặt hàng
  tương ứng hiện **bên cạnh để đối chiếu** ("Phiếu giao …"), giao thiếu là thấy
  ngay.
- **Mức hầm không tăng thì không điền gì.** Bằng 0 (hầm không nhận hàng) để trống,
  không báo lỗi. **Giảm** thì để trống ô và hiện số chênh **màu đỏ** — hầm tụt
  trong khi chênh lệch trụ bơm (mục d) bằng 0 là bất thường, phải dừng lại xem.
- **Chiều cao Barem không trả lời được** thì ô để trống kèm lý do tiếng Việt trên
  dòng: *"Ngoài phạm vi barem"*, *"Không có barem cho chiều cao này"*, *"Chưa có
  barem cho hầm này"* (trạm chưa gán tab trang tính cũng rơi vào trường hợp cuối).
  Biên bản **vẫn lưu được** — kế toán tự gõ số lít.
- **Không đọc được cả trang tính** — file bị siết chia sẻ, bị xóa, Google lỗi, hay
  một lần sửa làm vỡ cấu trúc (chèn cột) — thì mất Barem của **cả trạm** cùng lúc,
  nên form báo một dòng chung: *"Không đọc được trang tính barem — nhập tay và báo
  quản trị viên"*. Các ô SL barem để trống, kế toán tự gõ số lít, **biên bản vẫn
  lưu được**. Câu này khác *"Chưa có barem cho hầm này"* có chủ đích: lỗi ở tài
  liệu, việc của quản trị viên, không phải ở cái hầm.
- **Sửa chiều cao thì cả dòng tra lại**: hai ô SL barem và ô Nhập vào hầm. Nhờ vậy
  một lần đọc trang tính lỗi tạm thời tự hết khi kế toán sửa lại chiều cao.
- Mọi số app điền đều **gõ đè được**. Cái kế toán xác nhận mới là cái được lưu và
  cộng vào tồn kho; hầm không có số nhập thì không sinh phiếu. Xóa trắng ô thì
  app điền lại số của Barem — muốn hầm **không** sinh phiếu thì gõ `0`.
- Số đã lưu là **bản chụp tại thời điểm xác nhận**: sửa trang tính sau này **không**
  sửa biên bản cũ.

> ⚠️ **Trang tính Barem phải luôn để "bất kỳ ai có link đều xem được".** Trước đây
> đó chỉ là tiện lợi lúc nạp dữ liệu; nay nó là **phụ thuộc production** — siết
> chia sẻ (hoặc xóa/đổi chỗ file) là **mất Barem của toàn bộ các trạm cùng một
> lúc**, và mọi biên bản phải gõ tay số lít. Barem là bảng chuẩn đã in và treo ở
> từng trạm nên trong đó không có gì phải bảo mật.

Sửa trang tính rồi muốn biết có làm vỡ gì không: `pnpm barem:check` — fetch mọi tab
đã gán, in báo cáo lỗi nguồn (lít giảm khi chiều cao tăng, thiếu số lít, chiều cao
bị nhảy hoặc ghi hai lần, số lít không nguyên) + đối chiếu loại hàng/dung tích của
từng tab với bảng `dispensers`, và **không ghi gì cả**. Đường tra cứu chỉ thấy vài chiều cao được hỏi
nên không bao giờ phát hiện được những lỗi đó — lệnh này là chỗ duy nhất soi cả
bảng Barem.

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
  tài xế, xe bồn, `seal_no` (ô niêm chì gộp của biên bản chuẩn), và 4 mục a-d
  dạng JSON đúng như đã rà soát (`products`, `compartments`, `tank_checks`,
  `pump_checks`) + `raw_extract` (kết quả AI nguyên bản, để sau này đối chiếu
  "AI đọc gì" vs "người dùng xác nhận gì"). Biên bản lưu trước khi có `seal_no`
  giữ niêm chì trong `products` từng cột — **không migrate, không viết lại**.
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
| `/api/imports/extract`                 | POST   | AI đọc hình biên bản (`photos` + `stationId`) → JSON điền form + kết quả đối chiếu trạm (chưa lưu gì) |
| `/api/barem/lookup`                    | POST   | Tra một lô (mã hầm, chiều cao mm) → số lít hoặc lý do từ chối   |
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
  "34,5"→34.5, "141.008,78"→141008.78) + `tankCodeFromLabel` ("HẦM 2 12K"→`HAM_2`,
  nay chỉ còn dùng cho tiêu đề cột trang tính Barem).
- `lib/imports/binding-ladder.ts` — thang khớp một nhãn trên giấy về hầm/trụ, hoặc
  ra **lý do** không khớp được (ADR 0004); `lib/imports/tank-rows.ts` — ghép kết
  quả đó vào các dòng mục (c): hầm của trạm trước, dòng nào không khớp thì giữ
  nguyên số đo kèm lý do; `lib/imports/pump-rows.ts` — các dòng mục (d) (trụ của
  trạm, kể cả trụ AI không đọc ra) và `tankTaints`: trụ nào chạy thì dòng hầm nào
  ở mục (c) bị nghi ngờ.
- `lib/imports/goods-columns.ts` — đầu biên bản chuẩn: 4 cột `E0/EA/DO/DC` in sẵn
  (cột giấy kiểu cũ xếp sau), cột trống thì không lưu thành mặt hàng, và một số
  niêm chì cho cả biên bản (giấy cũ ghi theo cột thì gộp lại).
- `lib/imports/station-on-paper.ts` — đầu tờ biên bản khai trạm nào: khớp trạm
  đang nhập, khớp một trạm khác (chặn, ADR 0006), hay không đủ căn cứ. Thuần túy,
  không đọc database — phần đọc database nằm ở `lib/imports/station-check.ts`,
  dùng chung cho `/api/imports/extract` và `/api/imports/receipts`. Dùng lại
  `normalizeStationLabel` của `lib/matching/station-label.ts`.
- `lib/imports/station-rosters.ts` — danh sách hầm/trụ in sẵn trên 13 mẫu biên bản
  chuẩn (`docs/BB GIAONHANXD/`), chép tay đúng như in: số hầm suy ra theo thứ tự
  dòng có cờ `inferred`, HTGDONGNAI giữ nguyên hai hầm cùng ghi `3.`, và mã lấy
  theo giấy chứ không theo tên file (DAKNONG4 → `DAKNONGVK`). Không đọc database.
  `lib/imports/roster-check.ts` + `scripts/check-rosters.ts` (`pnpm roster:check`)
  đối chiếu danh sách đó với `dispensers` + hầm chỉ thấy qua số đo, in báo cáo và
  **không sửa bên nào** (ADR 0003).
- `lib/inventory/barem.ts` — đọc trang tính Barem, tra chiều cao → số lít, quy tắc
  tính số nhập; `lib/inventory/barem-form.ts` — mục (c) hiển thị gì: ô nào điền số
  nào, khi nào hiện số trên giấy màu đỏ, lấy số lượng phiếu giao nào để đối chiếu.
  `lib/inventory/barem-sheets.ts` — bảng gán trạm → tab trang tính (theo `gid`, đổi
  tên tab không ảnh hưởng) + link CSV; `lib/inventory/barem-fetch.ts` — định nghĩa
  duy nhất của "không đọc được trang tính": fetch CSV, quá 5 giây thì bỏ, trả về
  không phải CSV (file bị siết chia sẻ đáp 200 kèm trang đăng nhập Google) hay parse
  ra 0 hầm đều tính là không đọc được. `scripts/check-barem.ts` (`pnpm barem:check`)
  đọc qua đúng module đó, in báo cáo lỗi nguồn + đối chiếu `dispensers`, **không
  ghi gì**. Barem không có bảng nào trong database (ADR 0005).
- `components/inventory/import-cancel-button.tsx` — nút hủy.
- `lib/inventory/tank-ledger.ts` — `computeTankFlows`: gom nhập/bán theo hầm
  (bán = delta điện tử của các trụ map vào hầm qua `dispenser.tank_code`;
  delta âm bị bỏ qua — đó là lỗi dữ liệu đã có cờ review riêng).
- Trang: `app/(dashboard)/stations/[id]/inventory/page.tsx` (form + bảng phiếu +
  cột cân đối), `.../shifts/[shiftId]/page.tsx` (nút Nhập hàng).
- Tests: `tests/tank-ledger.test.ts`, `tests/bien-ban.test.ts` (parse số VN + map nhãn hầm,
  toàn bộ số liệu lấy từ 2 biên bản thật), `tests/barem.test.ts` (parse trang tính
  thật + tra cứu), `tests/barem-form.test.ts` (quy tắc điền mục c),
  `tests/binding-ladder.test.ts` + `tests/tank-rows.test.ts` (khớp nhãn giấy về hầm),
  `tests/station-on-paper.test.ts` (đầu tờ khai trạm nào),
  `tests/pump-rows.test.ts` (dòng mục d + cảnh báo trụ chạy),
  `tests/goods-columns.test.ts` (4 cột chuẩn + ô niêm chì gộp).

## 5. Chưa làm / chờ Trường Thịnh

1. **Đo que (tank dip) → lít.** Barem đã có và nhập hàng đã dùng (mục _Barem: từ
   chiều cao ra số lít_), nhưng số đo que vẫn là số thô: chiều cao ở đó do AI đọc
   từ ảnh que, **định dạng chưa chốt** ("01....500", "05....235") — Trường Thịnh
   sẽ chụp lại. Quy đổi một con số chưa đọc chắc chắn sẽ đưa tồn thực sai vào sổ,
   nên tạm dừng ở đây; xong việc đó mới so được tồn ước tính với tồn thực và bật
   cảnh báo chênh lệch.
2. **Chốt hệ quy chiếu cân đối: lít thực tế hay V15?** — hiện tồn kho cộng theo
   **lít thực tế**; nếu kế toán muốn theo V15 thì đổi một chỗ trong API tạo phiếu.
3. Ngưỡng chênh lệch chấp nhận (hao hụt tự nhiên/bay hơi) cho cảnh báo ở mục 1.
4. AI đọc tự động nội dung hóa đơn — ngoài phạm vi, làm sau nếu cần.
5. **Lỗi trên chính mẫu biên bản chuẩn** — chép nguyên như in, không tự sửa
   (ADR 0003), chờ Trường Thịnh trả lời: HTGDONGNAI đánh **hai hầm cùng số `3.`**
   (dòng thứ hai không khớp được hầm nào, không sinh phiếu nhập — đoán bừa một
   trong hai hầm còn tệ hơn); LAMDONG02 **không đánh số hầm**, app suy theo thứ
   tự dòng in và cần xác nhận; file `BBGIAONHANXD_DAKNONG4.docx` mang mã
   `(DAKNONGVK)` — app lấy mã trên giấy. `pnpm roster:check` in đủ các lỗi này.
