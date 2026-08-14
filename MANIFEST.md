# Handoff Manifest

ชุดส่งมอบนี้ใช้เริ่มสร้าง BMP Booking ใหม่โดยไม่ใช้ Google Apps Script หรือ Google Sheets

## เอกสารหลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `AGENTS.md` | กติกาถาวร ข้อห้าม ลำดับการอ่าน และ Definition of Done สำหรับ Codex |
| `PROJECT_HANDOFF.md` | สรุปผลิตภัณฑ์ สถาปัตยกรรม และข้อกำหนดล่าสุดที่มีอำนาจสูงสุด |
| `CODEX_START_PROMPT.md` | Prompt พร้อมใช้สำหรับเริ่มงานใน Codex Desktop |
| `README.md` | วิธีเปิดและใช้งานชุดส่งมอบ |
| `.env.example` | ชื่อตัวแปรแวดล้อมที่ต้องใช้ โดยไม่มี secret จริง |

## เอกสารใน `docs/`

- `PRODUCT_REQUIREMENTS.md` — ขอบเขตและ user flows
- `BUSINESS_RULES.md` — ราคา ความจุ มัดจำ การเลื่อน และกฎบริการ
- `STATE_MACHINES.md` — สถานะและ transition ที่อนุญาต
- `ARCHITECTURE.md` — โครงสร้างระบบใหม่และขอบเขตโมดูล
- `DATA_MODEL.md` — ตาราง ความสัมพันธ์ ดัชนี และข้อบังคับข้อมูล
- `RBAC_AND_SECURITY.md` — tenant isolation, RLS, roles และ Support Access
- `UI_UX_SPEC.md` — เมนู responsive, สี, ตาราง, modal และสถานะ
- `API_CONTRACT.md` — server/API boundaries และรูปแบบข้อผิดพลาด
- `MIGRATION_PLAN.md` — วิธีเปลี่ยนจาก GAS/Sheets แบบตรวจสอบย้อนกลับได้
- `IMPLEMENTATION_PLAN.md` — ลำดับ phase และจุดหยุดขออนุมัติ
- `ACCEPTANCE_TESTS.md` — เกณฑ์รับงานและกรณีทดสอบสำคัญ
- `DECISIONS.md` — บันทึกการตัดสินใจที่เปลี่ยนข้อกำหนด
- `OPEN_QUESTIONS.md` — เรื่องที่ต้องถามก่อนกระทบข้อมูลจริง ค่าใช้จ่าย หรือสิทธิ์
- `LEGACY_AUDIT.md` — สิ่งที่พบจาก v1.8.3 และสิ่งที่ห้ามยกมาใช้ต่อ

## ซอร์สเดิม

`legacy-v1.8.3/` เป็นสำเนาอ้างอิงแบบอ่านอย่างเดียวของระบบเดิม ห้ามแก้ ห้าม deploy และห้ามนำรูปแบบ persistence/auth/session/API gateway ไปใช้ในระบบใหม่

ไฟล์ต้นฉบับที่ตรวจสอบ:

- ชื่อ: `BMP-Booking-GAS-v1.8.3(1).rar`
- SHA-256: `ce23e1906f256643e43d5a60a3d7a4dc355930e8fa32e46e876f4499ea0327c4`
- จำนวนไฟล์ใน archive: 51

## สิ่งที่ยังไม่รวม

- ข้อมูลจริงจาก Google Sheets
- secret, token, password หรือ production credentials
- โค้ดระบบใหม่ที่สร้างจาก Next.js/Supabase
- การ migrate หรือแก้ไขระบบ production

รายการเหล่านี้ตั้งใจไม่รวมเพื่อป้องกันข้อมูลรั่วและให้ Codex เริ่มจาก migration/test ที่ตรวจสอบได้
