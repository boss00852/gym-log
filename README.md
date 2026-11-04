# Gym Log

แอปบันทึกการฝึกยิม (PWA ใช้คนเดียวบนมือถือ) — หน้าเว็บเป็นไฟล์สถิตล้วน (HTML/CSS/JS ไม่มี build step) host บน GitHub Pages
ส่วนฐานข้อมูลคือ Google Sheet โดยมี Google Apps Script เป็น JSON API คั่นกลาง

```
เบราว์เซอร์ (GitHub Pages)  ──POST text/plain {token, action, args}──▶  Apps Script Web App  ──▶  Google Sheet
        ▲  คิวออฟไลน์ + บันทึกอัตโนมัติ                                  ตรวจ token ก่อนทุกอย่าง      Log / REF / '64'–'69'
```

## โครงสร้าง repo

```
index.html  config.js  manifest.webmanifest  sw.js
css/app.css   js/*.js (ES modules)   icons/
apps-script/Code.gs  apps-script/appsscript.json
tests/server  tests/client   tools/ (สร้างไอคอน, เทียบหน้าจอ, smoke test)
```

## ข้อมูลในชีต (ไม่แตะของเดิม)

| แท็บ | หน้าที่ | แอปทำอะไรกับมัน |
|---|---|---|
| `Log` | 1 แถวต่อ 1 เซ็ต: `UpdatedAt, SessionId, Date, Time, Gym, Exercise, Kind, Set, Reps, Weight, Minutes, AvgHR, Note` | อ่าน/เขียน (สร้างให้เองถ้ายังไม่มี) |
| `REF` | A = ชื่อท่า, B = คำอธิบายท่า, C = `strength`/`cardio` | อ่าน และ **เพิ่มท่าใหม่ต่อท้ายเท่านั้น** |
| `'64'`–`'69'` | ชีตเก่า | **อ่านอย่างเดียว** (ใช้หา "ฝึกล่าสุด" ถ้า Log ยังไม่มีท่านั้น) |

วันที่เก็บเป็น ISO ค.ศ. (`2026-11-03`) แต่แสดงและแก้ไขเป็น `dd-MM-yyyy` ปี พ.ศ. (`03-11-2569`)

---

## ขั้นตอนติดตั้ง

### 1) ตั้งค่า Apps Script (ครั้งเดียว)

1. เปิด Google Sheet ของคุณ → เมนู **ส่วนขยาย (Extensions) → Apps Script**
2. ลบโค้ดเดิมในไฟล์ `Code.gs` แล้ววางเนื้อหาจาก [`apps-script/Code.gs`](apps-script/Code.gs) ทั้งไฟล์
3. (แนะนำ) ที่ **Project Settings** ติ๊ก *Show "appsscript.json" manifest file in editor* แล้วแทนที่เนื้อหาด้วย [`apps-script/appsscript.json`](apps-script/appsscript.json)
4. **สร้าง token** (สุ่มยาว ๆ) — รันในเครื่องคุณ:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   ถ้าไม่มี Node ให้ใช้ตัวสร้างรหัสผ่านใน password manager ความยาว 40 ตัวอักษรขึ้นไป
5. ที่ Apps Script: **Project Settings (⚙) → Script Properties → Add script property**
   - Property: `API_TOKEN`
   - Value: token ที่สุ่มได้ → Save
   - ถ้าไม่ตั้งค่านี้ API จะปฏิเสธทุกคำขอ (`unauthorized`)
6. **Deploy → New deployment → ประเภท Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (ความปลอดภัยอยู่ที่ token — ไม่มี token ที่ถูกต้องจะไม่ได้ข้อมูลใด ๆ)
   - กด Deploy แล้วอนุญาตสิทธิ์ (Google อาจขึ้น "unverified app" ให้กด Advanced → Go to … เพราะเป็นสคริปต์ของคุณเอง)
7. คัดลอก **Web app URL** (ลงท้าย `/exec`)
8. ทดสอบ: เปิด URL นั้นในเบราว์เซอร์ ต้องเห็น `{"ok":true,"service":"gymlog"}` (ไม่มีข้อมูลของคุณ)

> **ทุกครั้งที่แก้ `Code.gs`** ต้อง Deploy → *Manage deployments* → ✏️ → Version: *New version* → Deploy (URL เดิมไม่เปลี่ยน) ไม่งั้นเว็บจะยังเรียกโค้ดเวอร์ชันเก่า

### 2) ขึ้น GitHub Pages

1. สร้าง repo ชื่อ `gym-log` (**public** — บัญชีฟรีต้องเป็น public; โค้ดไม่มี secret จึงปลอดภัย)
2. อัปโหลดไฟล์ในโฟลเดอร์นี้ (ไม่ต้องอัปโหลด `node_modules/`, `tests/shots/`, `handoff/`):
   ```bash
   git init && git add . && git commit -m "Gym Log"
   git branch -M main
   git remote add origin https://github.com/<ชื่อผู้ใช้>/gym-log.git
   git push -u origin main
   ```
3. ที่ repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / folder: `/ (root)`** → Save
4. รอ 1–2 นาที จะได้ `https://<ชื่อผู้ใช้>.github.io/gym-log/`

### 3) เชื่อมแอปเข้ากับชีต

เปิดแอปบนมือถือ → จะเข้าหน้า **ตั้งค่าการเชื่อมต่อ** อัตโนมัติ

1. วาง **API URL** (`…/exec`) — หรือใส่ล่วงหน้าในไฟล์ [`config.js`](config.js) (`apiUrl`) ก็ได้ **แต่ห้ามใส่ token ในไฟล์นี้**
2. วาง **API token** (เก็บในเครื่องนี้เครื่องเดียว ใน localStorage ไม่ถูก commit)
3. กด **ทดสอบการเชื่อมต่อ** → ต้องขึ้น "เชื่อมต่อสำเร็จ · พบ N เซสชัน" → กด **บันทึก**

ตั้งค่าใหม่ภายหลังได้จากลิงก์ "ตั้งค่าการเชื่อมต่อ" ท้ายหน้าแรก

### 4) เพิ่มไปหน้าจอโฮม

- **iPhone (Safari):** ปุ่มแชร์ → *เพิ่มไปยังหน้าจอโฮม*
- **Android (Chrome):** เมนู ⋮ → *ติดตั้งแอป* / *เพิ่มไปยังหน้าจอหลัก*

เปิดจากไอคอนแล้วจะเต็มจอ ไม่มีแถบเบราว์เซอร์ และเปิดได้แม้ไม่มีสัญญาณ (ข้อมูลที่จดจะรอในคิวแล้วส่งเมื่อกลับมาออนไลน์)

---

## วิธีใช้ (สั้น ๆ)

- หน้าแรก: เซสชันล่าสุดก่อน โหลดทีละ 10 เลื่อนลงเพื่อโหลดเพิ่ม; ไอคอน/ปุ่ม "ดูทั้งหมดใน Google Sheet" เปิดแท็บ `Log`
- `+ เริ่มฝึกใหม่` → `+ เพิ่มท่า` → เลือก เวท/คาร์ดิโอ → ค้นหาหรือสร้างท่าใหม่
- กรอก `Reps` แล้วน้ำหนักว่าง → เติม kg ให้จากเซ็ตก่อนหน้า/ครั้งก่อน; kg ต่ำกว่าเซ็ตก่อนหน้าขึ้นสีส้ม
- บันทึกอัตโนมัติ — จุดเขียว = บันทึกแล้ว, ส้ม = รอส่ง/ออฟไลน์, แดง = ต้องตั้งค่า token
- แตะชิป วันที่/เวลา/สถานที่ ที่แถบบนเพื่อแก้ (เปลี่ยนวันที่จะอัปเดตทุกแถวของเซสชัน)
- จับเวลาพักอยู่ล่างจอ นับขึ้นจาก `00:00:00` ใช้เวลาจาก timestamp จึงไม่เพี้ยนเมื่อพับจอ; จะซ่อนเมื่อเซสชันมีแต่คาร์ดิโอ

## ความปลอดภัย

- ตรวจ token ก่อนทุกคำสั่ง ถ้าไม่ตรงตอบ `{ok:false,error:'unauthorized'}` โดยไม่คืนข้อมูล; `doGet` ตอบแค่ `{ok:true,service:'gymlog'}`
- โค้ดใน repo ไม่มี token/secret; token อยู่ใน Script Property (ฝั่งเซิร์ฟเวอร์) และ localStorage ของมือถือคุณ
- ถ้า token รั่ว: เปลี่ยนค่า `API_TOKEN` ใน Script Properties แล้วใส่ค่าใหม่ในแอป (ไม่ต้อง deploy ใหม่)
- client เรียก API ด้วย `fetch` แบบ `POST` + `text/plain` ไม่มี custom header และไม่ส่ง credentials (จึงไม่มี CORS preflight)
- service worker แคชเฉพาะไฟล์สถิตของเว็บเรา **ไม่แคชการเรียก API**
- ค่าจากชีตแสดงด้วย `textContent` เสมอ และฝั่งเซิร์ฟเวอร์ตั้งฟอร์แมตข้อความล้วนก่อนเขียน กันค่าขึ้นต้น `=` ถูกตีเป็นสูตร
- การเขียนซ้ำเมื่อ retry: ทุกคำสั่งเขียนมี `opId`; เซิร์ฟเวอร์จำไว้ 6 ชั่วโมงและตอบ ok โดยไม่เขียนซ้ำ

## พัฒนา / ทดสอบ

```bash
npm install
npm test                 # เซิร์ฟเวอร์ (mock SpreadsheetApp) + ไคลเอนต์ (jsdom) — ไม่แตะชีตจริง
npm run serve            # http://localhost:4173
node tools/shots.mjs     # screenshot 390x844 เทียบกับ handoff/screens → tests/shots/ (ซ้าย=ดีไซน์ ขวา=แอป)
node tools/smoke.mjs     # เบราว์เซอร์จริง: service worker / แคช / ออฟไลน์
node tools/make-icons.mjs
```

ทดสอบทั้งหมดใช้ชีตจำลอง ไม่มีขั้นตอนไหนเขียนลงชีตจริง การลองกับชีตจริงให้ทำเองหลังติดตั้งตามข้างบน (แนะนำให้ทำสำเนาชีตไว้ก่อน)

### อัปเดตเว็บแล้วมือถือยังเห็นของเก่า

service worker เสิร์ฟจากแคชก่อนแล้วอัปเดตเบื้องหลัง → เปิดแอปครั้งถัดไปจะได้เวอร์ชันใหม่ ถ้าต้องการบังคับ ให้เพิ่มเลขเวอร์ชัน `CACHE` ใน [`sw.js`](sw.js)
และถ้าเพิ่มไฟล์ JS ใหม่ ให้เพิ่มชื่อไฟล์ในรายการ `SHELL` ด้วย

## แก้ปัญหา

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| ทดสอบแล้วขึ้น "token ไม่ถูกต้อง" | token ในแอปไม่ตรงกับ Script Property `API_TOKEN` (ระวังช่องว่างหน้า/หลัง) |
| "เซิร์ฟเวอร์ตอบรูปแบบไม่ถูกต้อง" | deploy ไม่ได้ตั้ง *Anyone*, URL ไม่ลงท้าย `/exec`, หรือยังไม่ได้ New version หลังแก้โค้ด |
| "ติดต่อเซิร์ฟเวอร์ไม่ได้" | ไม่มีอินเทอร์เน็ต หรือ URL ผิด |
| ท่าใหม่ไม่มีคำอธิบาย | ใส่คำอธิบายเองที่คอลัมน์ B ของแท็บ `REF` (แอปจะไม่เขียนคอลัมน์ B ให้) |

## ขั้นถัดไป (ยังไม่ทำ)

- แท็บ `View` ที่สคริปต์สร้างให้อัตโนมัติจาก `Log` เป็นหน้าตา 2 แถวต่อท่า (Reps บน / kg ล่าง) สำหรับอ่านด้วยตา — `Log` ยังเป็นแหล่งข้อมูลจริง
- ย้ายข้อมูลจากชีตเก่า '64'–'69' เข้า `Log` (ตอนนี้อ่านเฉพาะ "ฝึกล่าสุด")
