# Gym Log

แอปบันทึกการฝึกยิม (PWA ใช้คนเดียวบนมือถือ) — หน้าเว็บเป็นไฟล์สถิตล้วน (HTML/CSS/JS ไม่มี build step) host บน GitHub Pages
ส่วนฐานข้อมูลคือ Google Sheet โดยมี Google Apps Script เป็น JSON API คั่นกลาง

```
เบราว์เซอร์ (GitHub Pages)  ──POST text/plain {token, action, args}──▶  Apps Script Web App  ──▶  Google Sheet
        ▲  คิวออฟไลน์ + บันทึกอัตโนมัติ                                  ตรวจ token ก่อนทุกอย่าง      Log / Exercises / Places
```

## โครงสร้าง repo

```
index.html  config.js  manifest.webmanifest  sw.js
css/app.css   js/*.js (ES modules)   icons/
apps-script/Code.gs  Migrate.gs  View.gs  Setup.gs  appsscript.json
tests/server  tests/client   tools/ (สร้างไอคอน, เทียบหน้าจอ, smoke test)
```

## ข้อมูลในชีต (ไฟล์ใหม่ 3 แท็บ — ไฟล์เก่าเก็บเป็น backup ไม่ถูกแตะ)

| แท็บ | คอลัมน์ | แอปทำอะไรกับมัน |
|---|---|---|
| `Log` | 1 แถวต่อ 1 เซ็ต: `UpdatedAt, SessionId, Date, Time, Place, Exercise, Kind, Set, Reps, Weight, Minutes, AvgHR, Note, Distance, Source` | อ่าน/เขียน. `Distance` เก็บระยะทางที่ย้ายมาจากชีตเก่า (แอปยังไม่แสดง), `Source` = ชื่อชีตเก่าที่ข้อมูลย้ายมา (แถวที่แอปบันทึกเองจะว่าง) |
| `Exercises` | `Exercise, Description, Kind (strength/cardio), Rest` | อ่าน และ **เพิ่มท่าใหม่ต่อท้ายเท่านั้น**. `Rest` เช่น `~2 นาที` ถ้าเว้นว่างแอปใช้กฎตามชื่อท่าแทน |
| `Places` | `Place, Color, Note` | อ่าน และเพิ่มสถานที่ใหม่ต่อท้ายให้อัตโนมัติ (สีป้ายเหมือนกันทุกเครื่อง); จำนวนครั้งที่ไปคำนวณจาก `Log` |

แท็บทั้งสามสร้างหัวตารางให้เองถ้ายังไม่มี วันที่เก็บเป็น ISO ค.ศ. (`2026-11-03`) แต่แสดงและแก้ไขเป็น `dd-MM-yyyy` ปี พ.ศ. (`03-11-2569`)

---

## ขั้นตอนติดตั้ง

### ทางลัด (แนะนำ): วางไฟล์เดียว แล้วกดรัน `setup`

```bash
node tools/bundle.mjs <ID ของไฟล์เก่า>      # ได้ dist/gym-log-all.gs (ไม่ถูก commit)
```

1. เปิดชีตใหม่ → **ส่วนขยาย → Apps Script** → ลบโค้ดเดิม → วางเนื้อหา `dist/gym-log-all.gs` ทั้งไฟล์ → บันทึก (💾)
2. เลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์ → ดู **Execution log**: จะได้ **API token** (สุ่มให้) คัดลอกเก็บไว้ + แท็บ Log/Exercises/Places ถูกสร้าง + ตั้ง `OLD_BOOK_ID` ให้แล้ว (ลืมคัดลอก → รัน `showToken`)
3. เลือก **`migrateDryRun`** → Run → ดูสรุปใน log → แล้วเลือก **`migrateAll`** → Run
4. **Deploy → New deployment → Web app** (Execute as: Me, Who has access: Anyone) → คัดลอก URL `/exec` → ไปข้อ 3 (GitHub Pages) และ 4 (ใส่ URL + token ในแอป)

ข้อ 1–2 ด้านล่างเป็นวิธีเดียวกันแบบแยกไฟล์/ตั้ง property เอง

### 1) สร้างสเปรดชีตใหม่ + ตั้งค่า Apps Script (ครั้งเดียว)

1. สร้าง Google Sheet **ใหม่เปล่า ๆ** (ชื่อเช่น "Gym Log"; ไฟล์เก่า "WORKOUT RECORD" ปล่อยไว้เป็น backup ห้ามลบ) แล้วตั้งเขตเวลาเป็น **Asia/Bangkok** (ไฟล์ → การตั้งค่า)
2. เมนู **ส่วนขยาย (Extensions) → Apps Script** ลบโค้ดเดิม แล้วสร้างไฟล์ 2 ไฟล์:
   - `Code.gs` ← วางเนื้อหาจาก [`apps-script/Code.gs`](apps-script/Code.gs)
   - `Migrate.gs` ← วางเนื้อหาจาก [`apps-script/Migrate.gs`](apps-script/Migrate.gs) (ใช้ย้ายข้อมูลเก่าครั้งเดียว ใช้เสร็จลบทิ้งได้)
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

### 2) ย้ายข้อมูลจากไฟล์เก่า (ครั้งเดียว — ไฟล์เก่าถูก "อ่านอย่างเดียว")

1. เปิดไฟล์เก่า "WORKOUT RECORD" แล้วคัดลอก **ID** จาก URL (ข้อความระหว่าง `/d/` กับ `/edit`)
2. ที่ Apps Script ของไฟล์ใหม่: **Project Settings → Script Properties** เพิ่ม `OLD_BOOK_ID` = ID นั้น (ไม่ฝัง ID ไว้ในโค้ด)
3. เลือกฟังก์ชัน `migrateDryRun` → **Run** (ครั้งแรก Google จะขออนุญาตเข้าถึงสเปรดชีต) → ดู **Execution log** ว่าจำนวนเซสชัน/แถวและคำเตือนสมเหตุสมผล (ยังไม่เขียนข้อมูลใด ๆ)
4. เลือก `migrateAll` → **Run** → ได้แท็บ `Log` (ข้อมูลเก่าทั้งหมด), `Exercises` (ท่า + คำอธิบายจาก REF เดิม + เวลาพัก; ท่าที่อยู่ในประวัติแต่ไม่มีใน REF จะถูกเติมต่อท้าย) และ `Places` (ว่าง)
5. ตรวจดู: ข้อมูลเก่าแต่ละวัน = 1 เซสชัน, ไม่ระบุสถานที่/เวลา, คอลัมน์ `Source` บอกว่ามาจากชีตไหน (`64`–`69`)
   - รัน `migrateAll` ซ้ำได้ ไม่ซ้ำข้อมูล (ข้ามชีตที่ย้ายแล้ว)
   - ถ้าผลไม่ถูกใจ รัน `clearMigrated` (ลบเฉพาะแถวที่ `Source` ไม่ว่าง — แถวที่แอปบันทึกเองไม่ถูกแตะ) แล้วย้ายใหม่
   - ท่าที่ถูกเติมให้อัตโนมัติจะไม่มีคำอธิบาย ใส่เองที่คอลัมน์ `Description` ได้

### 3) ขึ้น GitHub Pages

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

### 4) เชื่อมแอปเข้ากับชีต

เปิดแอปบนมือถือ → จะเข้าหน้า **ตั้งค่าการเชื่อมต่อ** อัตโนมัติ

1. วาง **API URL** (`…/exec`) — หรือใส่ล่วงหน้าในไฟล์ [`config.js`](config.js) (`apiUrl`) ก็ได้ **แต่ห้ามใส่ token ในไฟล์นี้**
2. วาง **API token** (เก็บในเครื่องนี้เครื่องเดียว ใน localStorage ไม่ถูก commit)
3. กด **ทดสอบการเชื่อมต่อ** → ต้องขึ้น "เชื่อมต่อสำเร็จ · พบ N เซสชัน" → กด **บันทึก**

ตั้งค่าใหม่ภายหลังได้จากลิงก์ "ตั้งค่าการเชื่อมต่อ" ท้ายหน้าแรก

### 5) เพิ่มไปหน้าจอโฮม

- **iPhone (Safari):** ปุ่มแชร์ → *เพิ่มไปยังหน้าจอโฮม*
- **Android (Chrome):** เมนู ⋮ → *ติดตั้งแอป* / *เพิ่มไปยังหน้าจอหลัก*

เปิดจากไอคอนแล้วจะเต็มจอ ไม่มีแถบเบราว์เซอร์ และเปิดได้แม้ไม่มีสัญญาณ (ข้อมูลที่จดจะรอในคิวแล้วส่งเมื่อกลับมาออนไลน์)

---

## หน้า `View` — อ่านด้วยตา

แท็บ `Log` เก็บ 1 แถวต่อเซ็ต (เหมาะกับวิเคราะห์ แต่อ่านยาก) สคริปต์จึงสร้างแท็บ **`View`** ให้อ่านง่าย: 1 แถวต่อ 1 ท่า เรียงใหม่สุดก่อน

| วันที่ | เวลา | สถานที่ | ท่า | Set 1 | Set 2 | Set 3 | Set 4 | … | Reps รวม | โน้ต |
|---|---|---|---|---|---|---|---|---|---|---|
| 03-11-2569 | 17:17 | ยิมหลัก | Bench press | 13×38 | 12×38 | 8×36 | 8×36 | | 41 | ไหล่ตึง |

- ช่อง Set เป็น `reps×kg`; คาร์ดิโอใช้ช่อง Set 1–3 เป็น `30 นาที` / `HR 130` / `1.9 กม.`
- วันที่ (พ.ศ.) เวลา สถานที่ แสดงเฉพาะแถวแรกของเซสชัน และสลับสีพื้นหลังทีละเซสชัน
- **อ่านอย่างเดียว** — สร้างทับทุกครั้ง แก้ข้อมูลที่แท็บ `Log` หรือในแอป (ถ้าพยายามแก้ใน View ชีตจะเตือน)
- อัปเดต 3 แบบ: เมนู **Gym Log → อัปเดตหน้า View ตอนนี้** (ตอนเปิดชีต), รัน `rebuildView` ใน Apps Script, หรือรัน `installViewTrigger` ครั้งเดียวให้อัปเดตเองทุก 5 นาที (เฉพาะเมื่อมีการบันทึกใหม่) — เลิกด้วย `removeViewTrigger`

## เข้าสู่ระบบด้วย Google (แทนการวาง token)

ปุ่ม "เข้าสู่ระบบด้วย Google" ในหน้าตั้งค่า: กดล็อกอินครั้งเดียวต่อเครื่อง ไม่ต้องคัดลอก token เซิร์ฟเวอร์ตรวจ Google ID token (aud ตรง Client ID, อีเมลยืนยันแล้ว, ตรงกับเจ้าของสคริปต์หรือ `ALLOWED_EMAIL`) แล้วออก session token อายุ 180 วัน เก็บเฉพาะค่าแฮชไว้ใน Script Property `SESSIONS` (ล็อกอินค้างได้สูงสุด 20 เครื่อง) ส่วน API token แบบเดิมยังใช้ได้เป็นทางสำรอง

### ตั้งค่าครั้งเดียว (Google Cloud Console — ฟรี ไม่ต้องผูกบัตร)

1. เปิด https://console.cloud.google.com → สร้างโปรเจกต์ใหม่ (ชื่อเช่น "Gym Log")
2. **APIs & Services → OAuth consent screen** (หรือ *Google Auth Platform*): User type = **External**, ตั้งชื่อแอป "Gym Log", ใส่อีเมลติดต่อ — ไม่ต้องเพิ่ม scope พิเศษ แล้วเพิ่มบัญชีของคุณใน **Test users** (ปล่อยเป็นโหมด Testing ได้ เพราะไม่ได้ใช้ refresh token)
3. **Credentials → Create credentials → OAuth client ID** → ชนิด **Web application** → *Authorized JavaScript origins* ใส่ `https://boss00852.github.io` (ไม่มี path ไม่มี `/` ท้าย; จะเพิ่ม `http://localhost:4173` สำหรับทดสอบในเครื่องด้วยก็ได้) → Create → คัดลอก **Client ID** (ลงท้าย `.apps.googleusercontent.com`; เป็นค่าสาธารณะ ไม่ใช่ความลับ)
4. ใส่ Client ID ใน [`config.js`](config.js) (`googleClientId`) แล้ว push
5. ที่ Apps Script: สร้างไฟล์รวมใหม่ `node tools/bundle.mjs "" <CLIENT_ID>` → วางทับแล้วกดรัน **`setup`** (จะตั้ง `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL` และขอสิทธิ์ UrlFetch) → **Deploy → Manage deployments → ✏️ → New version → Deploy** (URL เดิม)
6. เปิดแอป → ตั้งค่าการเชื่อมต่อ → กด **Sign in with Google**

ฟังก์ชันดูแลระบบใน Apps Script: `listSessions` (ดูจำนวนเครื่องที่ล็อกอินอยู่), `revokeSessions` (ให้ทุกเครื่องล็อกอินใหม่), `disableLegacyToken` (ปิด API token แบบเดิม เหลือเฉพาะ Google)

## วิธีใช้ (สั้น ๆ)

- หน้าแรก: เซสชันล่าสุดก่อน โหลดทีละ 10 เลื่อนลงเพื่อโหลดเพิ่ม; ไอคอน/ปุ่ม "ดูทั้งหมดใน Google Sheet" เปิดแท็บ `Log`
- `+ เริ่มฝึกใหม่` → `+ เพิ่มท่า` → เลือก เวท/คาร์ดิโอ → ค้นหาหรือสร้างท่าใหม่ (คีย์บอร์ดไม่เด้งเอง แตะช่องค้นหาเมื่ออยากพิมพ์)
- การ์ดแต่ละท่ามีป้าย **ท่าที่ N** (ลำดับในเซสชัน) และ **ขยายทีละใบ**: ใบที่กำลังทำแสดงเต็ม ใบอื่นย่อเหลือชื่อ + ตารางเซ็ต (ซ่อนเวลาพัก คำอธิบาย ฝึกล่าสุด โน้ต ปุ่ม ± Set และสรุป) แตะการ์ดที่ย่อเพื่อกลับมาแก้ไข
- ตอนกรอก แอปเลื่อนหน้าให้ตารางเซ็ตและปุ่ม ± Set อยู่เหนือคีย์บอร์ดและแผงจับเวลาเสมอ
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
| ท่าใหม่ไม่มีคำอธิบาย | ใส่คำอธิบายเองที่คอลัมน์ Description ของแท็บ `Exercises` (แอปจะไม่เขียนคอลัมน์ B ให้) |

## ขั้นถัดไป (ยังไม่ทำ)

- ปรับหน้า View ตามที่ Boss อยากอ่าน (เช่น จัดกลุ่มตามวัน/ท่า, สรุปรายสัปดาห์)
- ช่องกรอกระยะทางในหน้าคาร์ดิโอ (ตอนนี้คอลัมน์ `Distance` เก็บเฉพาะค่าที่ย้ายมา)
