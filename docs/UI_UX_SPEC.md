# UI/UX Specification

## Visual system

- Thai-first interface.
- Dark-green left navigation with white labels and white SVG icons.
- Light-green top bar with dark-green text.
- White/near-white content background, rounded cards, subtle borders/shadows.
- Clinic logo and Thai/English names appear in login, public header, and admin shell.
- Use one reusable SVG icon system with `currentColor`; do not depend on icon fonts.

## Public and back-office entry points

- `/` is the customer-facing website and must not display the admin navigation.
- `/admin/login` is the canonical clinic-user login. It identifies the screen as the back-office system, offers password recovery, and links back to the customer website.
- `/admin` is the authenticated back-office Home. It greets the user, shows their clinic role, provides primary booking actions, and displays modules according to server-derived capabilities.
- `/login` is compatibility-only and redirects to `/admin/login` while preserving supported status/error parameters.
- Authentication and role checks remain server-side; the visual split between customer and admin routes is not an authorization control.

## Responsive navigation

- Desktop: persistent left navigation and top bar.
- Tablet: collapsible left navigation, content grid adjusts to two or three cards.
- Smartphone: off-canvas navigation, one-column forms/cards, sticky primary action only when it does not cover content.
- Avoid horizontal page scrolling. Data tables may become labeled cards or controlled horizontal scroll with fixed primary information.

## Main clinic navigation

- ภาพรวม
- ฝากเลี้ยง
  - รายการจองฝากเลี้ยง
  - เช็กอิน–เช็กเอาต์
  - ห้องพักแมว
  - ห้องพักสุนัข
- ทำหมัน
  - ปฏิทินคิวทำหมัน
  - รายการนัดทำหมัน
- การเงิน
- ผู้ใช้งาน
- ตั้งค่า

หน้าห้องพักแมวและสุนัขแสดงปุ่ม `+ เพิ่มห้องพัก` และ `− ลบห้องพัก` เฉพาะผู้ใช้ที่มี `ROOM_INVENTORY_MANAGE` การเพิ่มใช้เลขห้องถัดไปโดยอัตโนมัติ ส่วนการลบต้องเลือกห้อง ระบุเหตุผล และยืนยัน โดยอธิบายว่าระบบเก็บประวัติเดิมและไม่อนุญาตห้องที่กำลังเข้าพักหรือมีรายการจองค้างอยู่ หน้าปฏิทินทำหมันใช้ตารางรายเดือนวันอาทิตย์–เสาร์ แสดงจำนวนคิวต่อความจุ รายการสัตว์ วันหยุด คิวเต็ม และ overbook โดยไม่ใช้สีเพียงอย่างเดียวในการสื่อสถานะ

Only show permitted menu items, while server authorization remains mandatory.

## Back-office portal home

- `/admin` is the authenticated SaaS back-office portal, not the operational booking dashboard. Its visible brand name and logo come from the current tenant settings; the product shell must not hard-code a clinic or business identity.
- The exact `/admin` route uses a full-screen responsive background and a two-row header without the booking sidebar. The tenant logo and business names remain in the first row; system navigation and the signed-in account move to the second row. Entering a working module such as `/admin/bookings`, `/admin/rooms/*`, or `/admin/sterilization` restores that module's sidebar and operational shell.
- Use the approved background art for smartphone, tablet, and PC through responsive image sources; keep important actions readable over the artwork and preserve the dog/cat area rather than covering it with dense dashboard cards.
- The portal menu has `ระบบ POS`, `ฝากเลี้ยง–ทำหมัน`, `สำหรับพนักงาน`, `สำหรับสัตวแพทย์`, and capability-protected `การตั้งค่าสำหรับผู้ดูแลระบบ`.
- Do not duplicate the system menu as a second card grid in the portal hero. The second header row is the authoritative system switcher.
- `สำหรับสัตวแพทย์` is the umbrella label for future blood-analyzer results, referral documents, and other veterinarian-only clinical tools.
- Clinic identity, contact, logo, tax identity, PromptPay, user invitations, memberships, and future cross-module settings live only under `การตั้งค่าสำหรับผู้ดูแลระบบ`. The boarding/sterilization sidebar must not duplicate Settings or Users entries.
- OWNER administration pages expose three consistent controls in order: `กลับหน้าหลักระบบหลังบ้าน`, `เพิ่มผู้ใช้งาน`, and `การตั้งค่าสำหรับผู้ดูแลระบบ`. `/admin/users` and `/admin/settings` use a standalone administration layout rather than the boarding/sterilization sidebar.
- `ฝากเลี้ยง–ทำหมัน` and capability-protected system settings are active in the current release. Future modules display `เร็ว ๆ นี้` and do not link to placeholder pages.
- The signed-in account menu contains the session action only; OWNER configuration and user management are reached through the authoritative settings tab. Server membership checks and PostgreSQL RLS remain authoritative for every linked route.

## Operational check-in/out views

Tabs:

1. `รอเช็กอิน`
2. `กำลังเข้าพัก/รอเช็กเอาท์`
3. `ดำเนินการเสร็จแล้ว`

The first two tabs include:

- species filter buttons: แมว / สุนัข / ทั้งหมด;
- search by booking code, owner, phone, pet name, or room;
- columns: `รหัสการจอง | เจ้าของ | ชื่อสัตว์เลี้ยง | ห้องพัก | วันเข้า | วันออก | การทำงาน`;
- pet display such as `ชาไทย(แมว)`; multiple pets separated by clear lines, not comma-only dense text;
- responsive card representation on small screens.

## Booking detail modal/drawer

- Use a desktop modal or side panel and a full-screen mobile sheet.
- Show status, owner, animal details, dates, price/payment/health, room, notes, and history.
- Room field is a dropdown; options are same-species rooms valid for the booking period.
- Remove the separate assign-room button.
- Prevent duplicate submission while mutation is in progress.
- Show a precise conflict if another user took the room.

## Room screens

- Separate cat and dog menu screens.
- Header controls: previous day, today, selected date, next day.
- Legend with color, text, and icon.
- Cards show room code, operational/booking status, species icon, pet name badge, and booking code where relevant.
- Every actionable room card shows the pointer cursor on hover and opens its primary action with one click, Enter, or Space. Double-click must never be required.
- Card actions:
  - available: clicking anywhere in the card opens the back-office booking form with date, species, and room preselected;
  - held/pending: view request;
  - confirmed: view or permitted assignment action;
  - occupied: view animals/stay and checkout action;
  - cleaning/maintenance/disabled: view/change operational state if authorized.
- A pet-name badge inside a booked room is a separate keyboard-accessible action. It opens a quick-detail modal with the booking, owner, phone, recorded pet facts, stay dates, payment state, and notes without triggering the room-card action.
- Optional facts that were not collected for a boarding pet display `ยังไม่ได้ระบุ`; the UI must not infer sex, breed, or health information.
- The room-card booking form begins with the central patient-registry search. Staff can search by phone, owner name, pet name, or HN, choose several active pets belonging to one customer, and reuse the existing customer/pet IDs instead of creating duplicates. New-customer entry remains available when no match is found.
- The room-card booking form shows an editable THB nightly-rate field for each room, prefilled from the one-/two-animal standard. It has adjacent `สร้างคำขอจอง` and `เช็คอินทันที` actions. The direct action is available only in the room-card context; the general booking-list form keeps the review path.
- In the current Version 1 transaction boundary, a registry-linked room booking is created as a request first and is then checked in from the room card. `เช็คอินทันที` remains available for a newly entered customer; it must not be shown when the selected registry path is not supported atomically by the database function.
- When direct check-in uses LINE, show the single booking-group deposit input and explain the 500 THB minimum. Do not present or calculate a deposit per room.
- A held/pending or confirmed room card provides `เช็คอิน` beside the unchanged `ยกเลิก` and `บันทึกสถานะ` controls. The confirmation displays owner, pet, channel, date, room, and the actual group deposit received. PostgreSQL must approve the eligible pending unit and open the physical stay atomically; LINE still requires the single 500 THB booking-group deposit.
- The occupied-room modal shows the recorded owner/contact, pet, payment, dates, and notes before its `เช็คเอาท์` action. Checkout opens the normal charge/settlement confirmation and does not bypass early-checkout confirmation, final-group receipt rules, authorization, or the room-to-cleaning transition.
- The room checkout charge area uses repeatable rows. Each row has a dropdown for the approved food/medicine/IV/blood-test/flea-tick/vaccine/medical-service/other catalog and an exact THB amount. Staff can add or remove rows; choosing `อื่น ๆ` reveals a required item-description field. Payment method and checkout/receipt notes remain unchanged.
- Selecting PromptPay on the final booking-group checkout with a positive amount due provides a `สร้าง QR ตามยอดสุทธิ` action. The server-generated QR displays the exact amount, configured payee name, and masked target. Changing charges requires a new quote, and staff must check `ตรวจสอบแล้วว่าเงินเข้าบัญชี` before submission.
- Explain instead of rendering a QR when this is not the final room, the balance is zero, a refund is due, or Dynamic PromptPay is not configured. Never render the collection QR on the paid receipt.

Status colors:

- available `#C8EAD1`;
- pending `#F7D081`;
- confirmed/occupied `#FD464A`;
- blocking operational states neutral gray.

## Sterilization calendar

- Month selection with Thai month name and Gregorian year presentation consistent with date policy.
- Under four: green.
- Exactly four: red/full.
- More than four: purple/overbooked.
- Each animal row is clickable and uses the requested prefix/name/sex convention.
- Every actionable day card and animal row shows the pointer cursor. One click opens the create form or the animal detail respectively; double-click must never be required.
- Clicking the remaining area of a calendar day opens the back-office sterilization form with that date preselected. Clicking an animal row opens a quick-detail modal instead and shows the recorded owner, phone, channel, pet identity, species, sex, breed, weight, age, vaccination, appointment state, and notes.
- The sterilization create form begins with the central patient-registry search. Staff can search by phone, owner name, pet name, or HN, select one existing pet, and reuse the existing customer/pet IDs; the form still permits new-customer entry when no match exists.
- Overbook action displays explicit warning and records acknowledgement.

## Forms and dates

- User-facing date copy is `DD-MM-YYYY` everywhere.
- Native date picker values remain ISO; format only at UI boundaries.
- Never parse a displayed date by splitting based on browser locale.
- Labels remain visible; placeholders are examples, not replacements for labels.
- Required/optional state is explicit in Thai.
- Conditional fields appear immediately after selection and receive focus appropriately.

## Feedback states

- Skeleton or loading label for list navigation and server fetches.
- Empty state explains why no records appear and offers the permitted next action.
- Success toast does not replace persisted status rendering.
- Validation errors attach to fields and summarize at form start.
- Conflict errors offer refresh/reselect, never silently retry a financial or room mutation.
- Raw exception, SQL, enum, or stack trace must never appear to end users.

## Receipt print view

- The 80 mm receipt header shows the snapshotted clinic address and telephone number.
- Hide tax-information heading, tax identification number, and branch number by default.
- Render the snapshotted tax section only when an OWNER enabled it and supplied the configured values in Settings.
- A multi-room group is printed as one receipt with room/pet-specific lines and one group deposit deduction.

## Customer and patient registry

- `/admin/customers` is the central registry entry. Search supports phone, owner name, pet name, and HN without placing customer data in the URL.
- Results show one customer with their pets and separate HNs. Staff may select several existing pets, add another pet, start a boarding booking, or start sterilization for one eligible pet.
- New-customer creation collects customer contact data once and renders repeatable pet sections. Success, duplicate-phone, validation, empty, forbidden, and retryable error states are explicit.
- Registry controls and links are rendered only for effective capabilities, while server/RLS/RPC/Storage remain authoritative.

## Accessibility

- Keyboard-accessible navigation, modals, dropdowns, date controls, and cards.
- Focus trap and focus return for modals.
- Visible focus indicator.
- Sufficient contrast, including white text on status backgrounds.
- Do not rely on red/green alone.
- Meaningful button text and accessible names for icon-only controls.
