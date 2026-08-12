# TT Station Hub

Station management for Trường Thịnh, a petroleum distributor: what each Trạm sells
per ca, what it holds in its Hầm, what arrives by tanker, and what customers owe.

## Language

### Sites and equipment

**Trạm**:
A filling station. The unit everything else is attributed to — Ca, Hầm, Trụ, debts
and imports all belong to exactly one.
_Avoid_: site, depot, branch

**Hầm**:
An underground storage tank at a Trạm, holding one fuel. Identified by number
(`HAM_2`); its physical shape is unique, which is why it has its own Barem.
_Avoid_: bồn, tank (in Vietnamese-facing text), reservoir

**Trụ**:
A dispenser at a Trạm, drawing from one Hầm, carrying an electronic and usually a
mechanical totaliser.
_Avoid_: pump, nozzle

### Measurement

**Barem**:
The calibration table Trường Thịnh issues for a Hầm: the volume of fuel the tank
holds at each height, in millimetres. One per Hầm, because volume-per-millimetre
depends on the tank's shape.
_Avoid_: dip table, calibration chart, strapping table

**Chiều cao**:
The height of fuel in a Hầm, measured with a dip stick, in millimetres. The input
to a Barem lookup.
_Avoid_: dip, level, depth

**SL barem**:
The litres a Hầm holds at a given Chiều cao, according to its Barem. A measurement
of the tank.
_Avoid_: physical stock, actual volume

**SL sổ sách**:
The litres the books say a Hầm holds. What SL barem is checked against.
_Avoid_: expected stock, ledger volume

**Nhập vào hầm**:
The fuel a Hầm received on one delivery — the difference between its SL barem after
and before. The quantity that moves inventory.
_Avoid_: delivered quantity, receipt volume

### Deliveries

**Biên bản giao nhận**:
The paper handover report signed by the driver and the station worker for one
tanker trip. Records the Hầm heights before and after, the tanker compartments, the
Trụ totalisers, and the goods delivered.
_Avoid_: delivery note, handover form, receipt

**Phiếu nhập**:
One delivery into one Hầm, as recorded in the app. A Biên bản giao nhận produces one
per Hầm that received fuel.
_Avoid_: import record, goods receipt

**Biên bản chuẩn**:
The Biên bản giao nhận Trường Thịnh issues per Trạm, pre-printed with that Trạm's
own roster of Hầm and Trụ. Thirteen of them exist, one per Trạm; they share a
skeleton but not a labelling convention, so the roster a form prints is a claim
about the Trạm, checked against what the app holds rather than trusted outright.
_Avoid_: template, standard template, master form

### Fuels

**E0**:
Unblended petrol, and one of the fuels every Trạm stocks. **Not** E5 RON 92 —
that is EA, which is a different product.
_Avoid_: E5, RON 92, xăng sinh học

**EA**:
E5 petrol. A column on the Biên bản chuẩn that no Trạm stocks yet; Trường Thịnh
pre-printed it for a fuel they intend to carry.
_Avoid_: E0, A95
