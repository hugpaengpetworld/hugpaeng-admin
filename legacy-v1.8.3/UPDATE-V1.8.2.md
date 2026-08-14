# อัปเดตระบบเป็น V1.8.2

รุ่นนี้แก้หน้าจอ **เช็กอิน–เช็กเอาท์ → ดำเนินการเสร็จแล้ว** ให้มีคอลัมน์ดังนี้

`รหัสการจอง | เจ้าของ | ชื่อสัตว์เลี้ยง | ห้องพัก | วันเข้า | วันออก | ระยะเวลา | Option`

คอลัมน์ `Option` มีไอคอนเครื่องพิมพ์สำหรับเปิดใบเสร็จขนาด 80 มม.

## Google Sheets

- ไม่ต้องเพิ่ม ลบ หรือสลับคอลัมน์
- ถ้าเคยรัน `upgradeSystemV1_8()` สำเร็จและมีชีต `ใบเสร็จ` กับ `รายการใบเสร็จ` แล้ว ไม่ต้องรันซ้ำ

## 1. อัปเดต Apps Script

วิธีที่ปลอดภัยที่สุดคือวางทับไฟล์ในโฟลเดอร์ `src` ทั้งหมด โดยต้องมีไฟล์เหล่านี้รวมอยู่ด้วย:

- `00_Config.gs`
- `05_AdminService.gs`
- `10_ApiService.gs`
- `13_ReceiptService.gs`
- `AdminClient.html`
- `CommonClient.html`
- `Icons.html`

จากนั้นไปที่ **Deploy → Manage deployments → Edit → Version: New version → Deploy**

> การกด Run หรือบันทึกโค้ดอย่างเดียวไม่ทำให้ URL `/exec` ใช้โค้ดรุ่นใหม่

## 2. อัปเดต GitHub และ Cloudflare

วางทับโฟลเดอร์ `cloudflare-web` จากแพ็กเกจนี้ โดยเฉพาะไฟล์:

- `cloudflare-web/src/worker.js`
- `cloudflare-web/public/index.html`
- `cloudflare-web/public/admin/index.html`
- `cloudflare-web/wrangler.jsonc`

Commit ไปที่ branch ที่ Cloudflare เชื่อมอยู่ แล้วรอให้ deployment สำเร็จ

## 3. ทดสอบ

1. ออกจากระบบหลังบ้านแล้วเข้าสู่ระบบใหม่ เพื่อรับ session และสิทธิ์รุ่นใหม่
2. กด `Ctrl+F5` หรือเปิดหน้าต่างไม่ระบุตัวตน
3. เปิด **เช็กอิน–เช็กเอาท์ → ดำเนินการเสร็จแล้ว**
4. ตรวจว่ามีคอลัมน์ `ระยะเวลา` และ `Option`
5. กดไอคอนเครื่องพิมพ์ แล้วตรวจหน้าตัวอย่างใบเสร็จ

หากยังขึ้นข้อความว่าไม่อนุญาตให้เรียกคำสั่ง แสดงว่า Apps Script URL `/exec` ที่ตั้งไว้ใน `GAS_API_URL` ยังชี้ไป deployment รุ่นเก่า หรือยังไม่ได้เลือก **New version** ตอน Deploy
