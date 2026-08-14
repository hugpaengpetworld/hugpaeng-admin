# Prompt สำหรับเริ่มใน Codex Desktop

เปิดและอ่าน `AGENTS.md`, `PROJECT_HANDOFF.md` และเอกสารทั้งหมดใน `docs/` ตามลำดับที่กำหนดก่อนทำการเปลี่ยนแปลงใด ๆ จากนั้นตรวจสอบ repository และรายงานว่าในโฟลเดอร์มีเพียงชุด handoff หรือมีโค้ดระบบใหม่อยู่แล้ว

เป้าหมายคือสร้าง BMP Booking ใหม่โดยไม่ใช้ Google Apps Script และ Google Sheets ใช้ Next.js App Router + strict TypeScript + Tailwind CSS + Supabase PostgreSQL/Auth/Storage และ deploy ไป Cloudflare Workers ผ่าน OpenNext/Wrangler ระบบต้องเป็น multi-tenant ตั้งแต่โครงสร้างข้อมูล แต่คลินิกบ้านหมอปอยเป็น tenant แรก

ให้เริ่มเฉพาะ Phase 0 และ Phase 1 จาก `docs/IMPLEMENTATION_PLAN.md` ก่อน:

1. สร้างโครงโปรเจกต์และเครื่องมือคุณภาพ
2. ออกแบบ migrations, enums/check constraints, RLS, seed และ transactional database functions ขั้นต้น
3. สร้าง tests สำหรับกฎราคา ความจุสัตว์ สถานะการจอง และการกันห้องซ้อน
4. ทำ `.env.example` โดยไม่มี secret จริง
5. อัปเดต README วิธีรัน local และ Supabase
6. รัน format, lint, typecheck, tests และ production build

ยังไม่ต้องสร้างหน้าจอทั้งหมด และห้ามคัดลอก persistence/auth/session/API gateway จาก `legacy-v1.8.3/` มาใช้ ให้ใช้ legacy เพื่อเทียบชื่อฟิลด์ พฤติกรรม และ edge cases เท่านั้น

ก่อนลงมือ ให้สรุป:

- สิ่งที่เข้าใจจากข้อกำหนด
- โครงสร้างไฟล์ที่กำลังจะสร้าง
- สมมติฐานที่ย้อนกลับได้
- เรื่องใดที่ต้องถามก่อนเพราะกระทบราคา ความปลอดภัย หรือข้อมูล

เมื่อ Phase 0–1 เสร็จ ให้หยุดและส่งผลตรวจสอบพร้อมรายการไฟล์ที่เปลี่ยน เพื่อรออนุมัติก่อนทำ Phase ถัดไป
