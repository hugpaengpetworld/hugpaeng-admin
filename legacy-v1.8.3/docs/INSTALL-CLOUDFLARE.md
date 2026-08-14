# ติดตั้ง v1.7 บน bmpbooking.hug-paeng.com

ระบบใช้ Cloudflare Worker แสดงหน้าเว็บ, Google Apps Script เป็น Backend/API และ
Google Sheets เป็นฐานข้อมูลชั่วคราว หน้าเว็บเรียก `/api` บนโดเมนเดียวกัน แล้ว Worker
จึงเติมกุญแจลับก่อนส่งต่อไป Apps Script ลูกค้าและพนักงานจะไม่เห็นกุญแจนี้

## ส่วนที่ 1 — สำรองข้อมูล

1. ทำสำเนา Google Sheet ปัจจุบัน
2. สำรองโครงการ Apps Script ปัจจุบัน
3. อย่าลบ deployment เดิมจนกว่าจะทดสอบโดเมนใหม่สำเร็จ
4. อย่านำรหัสผ่าน, LINE token หรือ gateway key ใส่ GitHub
5. ตรวจว่า GitHub repository `bmpbooking-web` เป็น Private

## ส่วนที่ 2 — อัปเดต Apps Script เป็น v1.7

1. ทำสำเนา Google Sheet และสำรองโครงการ Apps Script ก่อน
2. วางทับไฟล์เดิมด้วยไฟล์ทั้งหมดในโฟลเดอร์ `src`
3. ตรวจว่ามีไฟล์ `10_ApiService.gs` และ `11_UpgradeV1_7.gs`
4. หากอัปเกรดจาก v1.6.x ให้รัน `upgradeSystemV1_7()` หนึ่งครั้ง ห้ามรัน `setupSystem()` ซ้ำ
5. ตรวจรหัสห้องในชีตว่าเป็น `CAT01–CAT11` และ `DOG01–DOG07`
6. เลือกฟังก์ชัน `configureCloudflareGateway` แล้วกด **Run** หนึ่งครั้ง

Execution log จะแสดงสองค่า:

```text
GAS_API_URL=https://script.google.com/macros/s/.../exec
GAS_GATEWAY_KEY=ค่ากุญแจแบบสุ่ม
```

เก็บทั้งสองค่าไว้ชั่วคราวและห้ามส่งในแชตสาธารณะหรือบันทึกลง GitHub

## ส่วนที่ 3 — Deploy Apps Script รุ่นใหม่

1. ไปที่ **Deploy → Manage deployments**
2. กดรูปดินสอของ Web app เดิม
3. Version เลือก **New version**
4. Execute as เลือกเจ้าของสคริปต์ และ Who has access เลือก **Anyone**
5. กด **Deploy** แล้วตรวจว่า URL `/exec` ตรงกับ `GAS_API_URL`

## ส่วนที่ 4 — นำหน้าเว็บขึ้น GitHub

นำ **ไฟล์ภายใน** โฟลเดอร์ `cloudflare-web` ไปไว้ที่รากของ repository
`hugpaengpetworld/bmpbooking-web` ให้ได้โครงสร้างนี้:

```text
public/
  index.html
  admin/
    index.html
src/
  worker.js
package.json
wrangler.jsonc
```

1. วางทับ placeholder `public/index.html` เดิม
2. อัปโหลดโฟลเดอร์ `public`, `src` และไฟล์ `package.json`, `wrangler.jsonc`
3. ตรวจว่าไม่มี `GAS_API_URL` หรือ `GAS_GATEWAY_KEY` อยู่ในไฟล์ GitHub
4. Commit เข้า branch `main`
5. รอ Cloudflare แจ้งว่า deployment สำเร็จ

## ส่วนที่ 5 — เพิ่ม Secrets ใน Cloudflare

1. เปิด Cloudflare → **Workers & Pages → bmpbooking-web**
2. ไปที่ **Settings → Variables and Secrets**
3. เพิ่ม Secret ชื่อ `GAS_API_URL` และวาง URL `/exec` จาก Apps Script
4. เพิ่ม Secret ชื่อ `GAS_GATEWAY_KEY` และวางกุญแจจาก Execution log
5. บันทึก แล้วสร้าง deployment ใหม่เพื่อให้ Worker ใช้ค่าล่าสุด

ต้องใช้ชื่อตัวแปรตรงตามนี้ทุกตัวอักษร และไม่ต้องใส่เครื่องหมายคำพูดรอบค่า

## ส่วนที่ 6 — ทดสอบ

1. เปิด `https://bmpbooking.hug-paeng.com` ในหน้าต่าง Incognito
2. ตรวจว่าชื่อและโลโก้คลินิกโหลดจาก Google Sheets ได้
3. กดตรวจห้องว่างด้วยวันที่ทดสอบ
4. เปิด `https://bmpbooking.hug-paeng.com/admin/` และทดลองเข้าสู่ระบบ
5. ตรวจหน้าภาพรวม ห้องแมว ห้องสุนัข ทำหมัน และออกจากระบบ

จากนั้นสร้างรายการทดสอบหนึ่งรายการและตรวจว่าแถวถูกเพิ่มใน Google Sheet จริง

## หากพบข้อความ “ยังไม่ได้ตั้งค่าการเชื่อมต่อ”

- ตรวจว่าเพิ่ม Secrets ทั้งสองค่าใน Production
- ตรวจว่า `GAS_API_URL` ลงท้ายด้วย `/exec` ไม่ใช่ `/dev`
- ตรวจว่า deployment Apps Script รุ่นล่าสุดมี `10_ApiService.gs` และ `11_UpgradeV1_7.gs`
- หากรัน `rotateCloudflareGatewayKey()` ต้องแก้ `GAS_GATEWAY_KEY` ใน Cloudflare ให้ตรงกัน

## การอัปเดตหน้าเว็บครั้งต่อไป

แก้ไฟล์ต้นฉบับใน `src/*.html` แล้วรัน:

```bash
npm run build:cloudflare
npm test
npm run check
```

จากนั้น commit ผลลัพธ์ที่สร้างใหม่ ห้าม commit secret หรือข้อมูลลูกค้า
