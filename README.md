# BMP Booking

ระบบจองใหม่สำหรับคลินิกบ้านหมอปอยรักษาสัตว์ สร้างด้วย Next.js App Router, strict TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage และ Cloudflare Workers ผ่าน OpenNext/Wrangler

สถานะ repository ครอบคลุม Phase 0–9: ระบบฝากเลี้ยง/ห้อง/มัดจำ/เช็กอิน–เช็กเอาต์/การเงิน/ใบเสร็จ, ระบบนัดทำหมัน, Platform Owner และ Temporary Support Access foundation รวมถึงเครื่องมือ migration rehearsal และ release runbook แล้ว ระบบยังไม่ถือว่าพร้อม production จนกว่าจะเลือกกลยุทธ์ข้อมูลจริง, ซ้อม backup/restore ด้วย production-like project, ตั้ง production secrets/domain/monitoring และผ่าน clinic owner acceptance ตาม `docs/RELEASE_RUNBOOK.md`

## ข้อกำหนดเครื่องพัฒนา

- Node.js 22 ขึ้นไปและ npm
- Docker Desktop หรือ Docker Engine สำหรับ Supabase local
- Supabase CLI (ติดตั้งเป็น dev dependency แล้ว)

## เริ่มระบบ local

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:start
npm run db:reset
npm run dev
```

เปิด `http://localhost:3000` หลัง `supabase start` ให้คัดลอก local anon key และ service-role key จาก `npx supabase status -o env` ลง `.env.local` เท่านั้น ห้าม commit ไฟล์นี้

หยุด Supabase local ด้วย:

```powershell
npm run db:stop
```

## เส้นทางที่เปิดถึง Phase 9

- `/` — ตรวจจำนวนห้องว่าง ส่งคำขอจอง ตรวจสถานะ ส่งหลักฐานมัดจำ และขอเลื่อนวัน
- `/admin/login` — URL หลักสำหรับเข้าสู่ระบบหลังบ้านด้วยบัญชี Supabase Auth ที่ได้รับคำเชิญ (`/login` จะส่งต่อมายังหน้านี้เพื่อรองรับลิงก์เดิม)
- `/auth/set-password` — ตั้งรหัสผ่านใหม่หลังรับคำเชิญ
- `/auth/forgot-password` — ขออีเมลตั้งรหัสผ่านใหม่เมื่อคำเชิญหมดอายุหรือลืมรหัสผ่าน
- `/admin` — หน้า Home ของระบบหลังบ้านและ role-aware navigation หลังเข้าสู่ระบบสำเร็จ
- `/admin/rooms/cats` — ห้อง CAT01–CAT11 เริ่มต้น พร้อม date navigation, status overlay และปุ่ม OWNER เพิ่มเลขห้องถัดไป
- `/admin/rooms/dogs` — ห้อง DOG01–DOG07 เริ่มต้น พร้อม date navigation, status overlay และปุ่ม OWNER เพิ่มเลขห้องถัดไป
- `/admin/bookings` — ค้นหา/กรอง ตรวจรายละเอียด อนุมัติ/ปฏิเสธ ตรวจมัดจำ และพิจารณาคำขอเลื่อนวัน
- `/admin/bookings/new` — สร้างการจองหลายห้อง โดยกำหนดสัตว์ประจำแต่ละห้องและกรองห้องตามชนิดสัตว์
- `/admin/operations` — รายการรอเช็กอินทั้งหมดและ open stay ทุกห้อง พร้อมเช็กอิน/เช็กเอาต์แบบ transactional
- `/admin/finance` — ใบเสร็จ การพิมพ์ซ้ำ การคืนเงิน และสถานะเอกสาร
- `/admin/finance/receipts/{id}` — immutable receipt snapshot, refund matching-account และ void/reissue
- `/admin/finance/receipts/{id}/print` — หน้าพิมพ์ browser สำหรับกระดาษความกว้าง 80 มม.
- `/admin/settings` — OWNER เปิดใช้ Dynamic PromptPay QR โดยเลือกประเภทเลข กรอกเลขพร้อมเพย์จริง และชื่อผู้รับที่ต้องตรวจสอบ

เมื่อเปิดใช้แล้ว หน้าเช็กเอาต์ห้องสุดท้ายจะแสดงปุ่มสร้าง QR ตามยอดสุทธิหลังรวมค่าใช้จ่ายและหักมัดจำ พนักงานต้องตรวจชื่อผู้รับ/ยอดและยืนยันว่าเงินเข้าจริงก่อนออกใบเสร็จ ระบบไม่แสดง QR เมื่อยอดเป็นศูนย์ ต้องคืนเงิน หรือยังไม่ใช่ห้องสุดท้ายของ booking group

- `/admin/settings` — แก้ชื่อ/ที่อยู่/เบอร์โทร/โลโก้ ข้อมูลภาษีแบบ opt-in และคำแนะนำการชำระเงิน เฉพาะ `OWNER`
- `/admin/sterilization` — ปฏิทินรายเดือนอาทิตย์–เสาร์ สีเขียว/แดง/ม่วง/ชมพู แสดงคิว วันหยุด และ audited override
- `/admin/sterilization/list` — ค้นหา ดูรายละเอียด อายุ/วัคซีน และเปลี่ยนสถานะตาม allowlist
- `/admin/sterilization/new` — รับนัดหลังบ้าน พร้อม custom species, sex, overbook acknowledgement
- `/admin/users` — เชิญผู้ใช้และจัดการบทบาท/สถานะสมาชิกคลินิก เฉพาะ `OWNER`
- `/platform` — Platform Owner tenant overview และสร้าง/เพิกถอน Temporary Support Access แบบจำกัด scope/เวลา
- `/support` — รายการ grant ของ Support Agent
- `/support/access/{grantId}` — support session แบบ read-only พร้อม banner และ audit linkage

สถานะห้องแสดงตามลำดับ `open physical stay > operational state > planned allocation > available` ดังนั้นห้องที่มี open stay จะไม่แสดงว่าว่างแม้วันออกตามแผนผ่านไปแล้ว การเปลี่ยน operational state ใช้ audited RPC พร้อม row lock/version check

## Database และ migrations

- migrations อยู่ใน `supabase/migrations/` และต้อง apply ตามลำดับ
- seed อยู่ใน `supabase/seed.sql` สร้าง tenant `baan-mhor-poy`, ห้อง `CAT01`–`CAT11` และ `DOG01`–`DOG07`
- seed ไม่สร้าง Auth user ปลอมและไม่มีข้อมูลลูกค้าจริง
- เงินเก็บเป็น integer satang เช่น 150 THB = `15000`
- ช่วงการเข้าพักเป็น half-open range `[check-in, check-out)` จึงออกวันที่ 3 และเข้าวันที่ 3 ต่อกันได้
- วันที่ใน booking code ใช้ `check_in_date`: `BMP-YYYYMMDD-{ROOM_CODE}-{NN}`
- room overlap ป้องกันด้วย PostgreSQL exclusion constraint และ `allocate_planned_room(...)` ล็อก booking/room ใน transaction
- tenant มาจาก booking และ authenticated membership เสมอ RPC ไม่รับ `tenant_id` จาก caller
- public API ใช้ service-only RPC แบบแคบ มี validation, request-size/origin checks, rate limiting และ idempotency โดยไม่คืนเลขห้องจริง
- การอนุมัติ การกันห้อง การปล่อยห้อง การยืนยันมัดจำ และการเลื่อนวันทำใน transactional database functions พร้อม audit log
- เช็กอินรับ “ยอดมัดจำรวมที่ถือไว้ต่อ booking group” และต้องไม่น้อยกว่ายอดที่ตรวจรับแล้ว เพื่อไม่บันทึกเงินซ้ำ
- เช็กเอาต์แต่ละห้องบันทึก charge facts, ปิด open stay, ปล่อย allocation และเปลี่ยนห้องเป็น `CLEANING`; ห้องสุดท้ายของกลุ่มจึงตัดยอดรวมและสร้างใบเสร็จกลุ่มหนึ่งใบใน transaction เดียว
- การพิมพ์/สร้าง artifact เกิดหลัง transaction; ความผิดพลาดด้านเอกสารไม่ทำให้สัตว์กลับไปครองห้อง
- เลขใบเสร็จสร้างแบบ atomic เป็น `BMP-RCP-YYYYMMDD-NNNN`; ใบที่ออกแล้วห้ามแก้ snapshot และการออกใหม่ใช้เลขใหม่
- หัวใบเสร็จแสดงที่อยู่และเบอร์โทรเป็นค่าเริ่มต้น ข้อมูลภาษี/เลขผู้เสียภาษี/เลขสาขาจะแสดงเฉพาะเมื่อ `OWNER` เปิดใช้และตั้งค่า และทุกค่าถูกเก็บใน immutable snapshot

รีเซ็ตฐาน local จากศูนย์และรัน pgTAP:

```powershell
npm run db:reset
npm run db:test
```

รัน integration test สำหรับ RLS, concurrent allocation/check-in, checkout, receipt และ refund:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm run test:integration
```

## เชิญ Owner คนแรก

หลังตั้งค่า local/staging URL และ service-role key ใน `.env.local` แล้ว:

```powershell
npm run owner:invite -- --email owner@example.com --name "ชื่อเจ้าของคลินิก"
```

สคริปต์นี้เป็น server-only bootstrap แบบ idempotent: ส่ง Supabase Auth invitation เมื่อยังไม่มีผู้ใช้ และสร้าง/ตรวจ `OWNER` membership พร้อม audit trail ใน transaction เดียวให้ tenant จาก `DEFAULT_TENANT_SLUG` ห้ามนำ service-role key ไปใช้ใน browser

### เชื่อม Supabase Cloud บน Windows โดยไม่พิมพ์ key ใน command history

เปิด Dashboard → Project Settings → API Keys แล้วรัน:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-local-env.ps1
```

วาง Publishable/anon key และ Secret/service-role key ใน secure prompt ตามลำดับ สคริปต์สร้าง `.env.local`, สร้างค่า cron/rate-limit แบบสุ่ม และไม่แสดง key บนหน้าจอ จากนั้นตั้ง Supabase Auth URL Configuration ให้ Site URL เป็น `http://localhost:3000` และเพิ่ม Redirect URL `http://localhost:3000/auth/callback`

สำหรับ OWNER แรกที่ยืนยันไว้:

```powershell
npm run owner:invite -- --email admin@hug-paeng.com --name "OWNER"
```

ผู้รับต้องเปิดอีเมลเชิญและตั้งรหัสผ่านเอง ระบบไม่สร้างหรือเก็บรหัสผ่านใน application tables

หาก Supabase Auth email ถูกจำกัดความถี่ระหว่าง bootstrap สามารถตั้งรหัสผ่าน OWNER โดยตรงจากเครื่องผู้ดูแลได้โดยไม่ส่งอีเมล:

```powershell
npm run owner:set-password
```

คำสั่งจะรับรหัสผ่านและการยืนยันแบบซ่อน ใช้ `SUPABASE_SERVICE_ROLE_KEY` เฉพาะใน process ฝั่งเครื่องผู้ดูแล ยืนยันอีเมล และบันทึก audit event โดยไม่พิมพ์หรือเก็บรหัสผ่านลง application tables

หากบัญชีจากคำเชิญเก่าไม่มี Supabase email identity ให้รัน `scripts/repair-owner-email-identity.sql` เพียงครั้งเดียวใน Supabase SQL Editor แล้วจึงเข้าสู่ระบบหรือรัน `owner:set-password` อีกครั้ง SQL นี้ล็อกเป้าหมายด้วยอีเมล, tenant และบทบาท OWNER โดยไม่เปลี่ยน `user_id` หรือรหัสผ่าน

## Phase 9 migration rehearsal

ห้ามวาง export จริงใน source control โฟลเดอร์ `migration-data/` และ `migration-reports/` ถูก ignore แล้ว รัน validation พร้อม exception/reconciliation report ด้วย:

```powershell
npm run migration:rehearse -- --input-dir migration-data --strategy legacy_import --report migration-reports/rehearsal.json
```

หากเลือกเริ่มใหม่โดยใช้ seed เท่านั้น:

```powershell
npm run migration:rehearse -- --strategy clean_seed --report migration-reports/clean-seed.json
```

การ stage metadata ของ rehearsal ต้องใช้ `MIGRATION_DATABASE_URL` แบบ server-only และ `--stage true --tenant-slug baan-mhor-poy` เครื่องมือนี้จงใจไม่เขียน business records จนกว่าจะได้รับไฟล์ export จริงและอนุมัติ mapping/exception report

## Quality checks

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
```

`npm test` จะรัน unit tests และข้าม integration tests อัตโนมัติเมื่อไม่มี `TEST_DATABASE_URL` ส่วน CI จะเปิด Supabase local และรันทั้ง pgTAP/RLS/concurrency tests

## ตัวแปรระบบสำหรับ Phase 3–9

สร้างค่าความลับแบบสุ่มอย่างน้อย 32 ตัวอักษรสำหรับ `RATE_LIMIT_HASH_SECRET` และ `CRON_SHARED_SECRET` ห้ามใช้ค่าตัวอย่างใน production ส่วนการแจ้งเตือน LINE ต้องตั้ง `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_CHANNEL_SECRET` ฝั่ง server เท่านั้น

ตั้ง LINE webhook URL เป็น `https://<โดเมน>/api/line/webhook` ระบบจะตรวจ `x-line-signature` จาก raw request body ก่อนอ่าน payload ปัจจุบัน webhook รับและตรวจสอบ event ได้ แต่ flow แจ้งเตือนขาออกทำผ่าน outbox

## Cloudflare local preview และ deploy

คัดลอก `.dev.vars.example` เป็น `.dev.vars` และใส่เฉพาะค่าของ environment ที่ต้องการ จากนั้น:

```powershell
npm run preview:cloudflare
```

การ deploy ต้องตั้ง secrets ผ่าน Cloudflare/Wrangler ภายนอก source control แล้วจึงใช้ `npm run deploy:cloudflare` Production Worker ใช้ custom domain `admin.hug-paeng.com`; การ deploy ซ้ำต้องใช้คำสั่งที่ล็อก production target และยืนยันโดยตั้งใจเท่านั้น

Production ใช้ Supabase project `dghipgebiioxphbbyvxp`, Cloudflare account `dd0c01bdf56fa7bba2e915d0522a9666`, Worker `bmp-booking-production` และโดเมน `https://admin.hug-paeng.com` เท่านั้น สร้างไฟล์ secret ที่ถูก ignore และตรวจ CLEAN_SEED แบบ read-only ด้วย:

```powershell
npm.cmd run env:production:configure
npm.cmd run production:clean-audit
```

เก็บ LINE production credentials ผ่าน secure prompt โดยไม่แสดงค่าบนหน้าจอหรือ command history:

```powershell
npm.cmd run env:production:line
```

ห้ามคัดลอก `.env.production.local` เข้า Git หรือส่งค่าภายในผ่านแชต คำสั่ง deploy production จะหยุดทันทีถ้า target ไม่ตรงหรือ LINE production credentials ยังว่าง และต้องยืนยันโดยตั้งใจทุกครั้ง:

```powershell
npm.cmd run deploy:cloudflare:production -- -ConfirmProductionDeploy
```

หลังโดเมนใช้งานได้และ Supabase Auth URL Configuration ถูกตั้งค่าครบแล้ว จึงเชิญ OWNER แรกด้วยคำสั่งที่ล็อก production และอีเมลไว้โดยเฉพาะ:

```powershell
npm.cmd run owner:invite:production -- -ConfirmProductionInvite
```

สำหรับ environment staging ที่อนุมัติแล้ว ให้ใช้คำสั่งซึ่งล็อกเป้าหมายไว้กับ Worker และ Supabase CLEAN staging โดยเฉพาะ:

```powershell
npm.cmd run deploy:cloudflare:staging -- -AppUrl https://bmp-booking-staging.hugpaeng-petworld.workers.dev
npm.cmd run gate5:smoke
npm.cmd run gate5:smoke -- --verify-scheduled-cron
```

คำสั่ง `gate5:smoke` หลักสร้างข้อมูล Auth/booking/check-in/payment/receipt สังเคราะห์ จึงรันได้เฉพาะเมื่ออนุมัติให้ล้าง staging กลับเป็น CLEAN_SEED หลังทดสอบแล้วเท่านั้น ห้ามใช้กับ production ส่วนโหมด `--verify-scheduled-cron` สร้างและลบเฉพาะ outbox event สังเคราะห์หนึ่งรายการเพื่อยืนยัน scheduled handler จริง

`custom-worker.ts` เพิ่ม scheduled handler ให้ OpenNext worker และ `wrangler.jsonc` เรียกทุกหนึ่งนาทีเพื่อหมดเวลามัดจำและส่ง outbox โดย route ภายในตรวจ `CRON_SHARED_SECRET` ซ้ำเสมอ สามารถทดสอบ preview cron ด้วย endpoint ของ Wrangler `/cdn-cgi/handler/scheduled` หลังตั้ง `.dev.vars`

## Staging database release test บน Windows

เมื่อต้องตรวจ integration tests กับ Supabase staging โดยไม่บันทึกรหัสฐานข้อมูลลงไฟล์ ให้ link โปรเจกต์ด้วย Supabase CLI แล้วรัน:

```powershell
npm.cmd run test:integration:staging
```

วางเฉพาะ **รหัสผ่าน Database** ในช่องลับที่ PowerShell แสดง สคริปต์จะสร้าง Session pooler URI จากโปรเจกต์ที่ link ไว้และ percent-encode อักขระพิเศษให้อัตโนมัติ ค่า `TEST_DATABASE_URL` จะอยู่เฉพาะใน process ระหว่างการทดสอบและถูกลบทันทีเมื่อจบ การรัน pgTAP ทั้งชุดยังต้องใช้ `supabase test db` บน Docker/WSL หรือ job `database` ใน GitHub Actions Linux ตาม `.github/workflows/quality.yml`

ชุด integration ใช้ test timeout 20 วินาทีและ hook timeout 30 วินาทีเพื่อรองรับ network latency ของ Supabase Cloud โดย unit tests ยังคงใช้ timeout เริ่มต้นของ Vitest

ตรวจบัญชี fixture ที่อาจตกค้างแบบ read-only โดยกรองเฉพาะ Auth email ที่ลงท้ายด้วย `@example.invalid`:

```powershell
npm.cmd run test-fixtures:audit
```

คำสั่ง audit ไม่ลบหรือแก้ไขข้อมูล การลบ fixture ต้องตรวจ UUID และได้รับอนุมัติแยกต่างหาก

> หมายเหตุ: session cookie refresh ใช้ `src/middleware.ts` แบบ Edge Middleware ชั่วคราว เพราะ OpenNext 1.20.2 ยังไม่รองรับ Node.js Proxy ของ Next.js 16 การตรวจสิทธิ์จริงไม่ได้พึ่ง middleware แต่บังคับซ้ำใน server data layer, PostgreSQL RPC และ RLS ห้ามเปลี่ยนกลับเป็น `proxy.ts` จนกว่า OpenNext จะรองรับและ `npm run build:cloudflare` ผ่าน

## ขอบเขตและความปลอดภัย

- `legacy-v1.8.3/` เป็น read-only behavioral reference เท่านั้น
- ห้ามนำ GAS URL, Google Sheets persistence, password/session เดิม หรือ gateway key กลับมาใช้
- public/anonymous role ไม่มี broad table reads/writes
- RLS เปิดบน tenant-owned/exposed tables; privileged allocation ใช้ authenticated database RPC
- health facts แยกจากข้อมูลสัตว์ทั่วไปและ deny direct STAFF access จนกว่าจะมีสิทธิ์แบบเจาะจงที่อนุมัติแล้ว
- Storage bucket เป็น private และ object path ต้องขึ้นต้นด้วย tenant UUID
- ห้าม commit `.env*`, `.dev.vars`, secrets, exports, uploads หรือ customer data

อ่าน [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) และเอกสารใน [docs](docs) ก่อนเปลี่ยน behavior ที่กระทบราคา ความจุ สิทธิ์ หรือข้อมูลจริง
