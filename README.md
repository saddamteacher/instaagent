# Jarvisgram

Instagram akkauntlarini AI-agentlar jamoasi bilan boshqarish platformasi. Foydalanuvchi buyruqni **o'z Claude ilovasida**
beradi; Claude bu yerda **Jarvis**, ya'ni bosh direktor: buyruqni vazifalarga bo'ladi va 13 agent rolini bajaradi. Veb-ilovada
virtual ofis bor: kim ishlayotgani, kim dam olayotgani jonli ko'rinadi.

> ## ⚠️ Muhim ogohlantirish
> **Brauzer avtomatizatsiyasi (Claude in Chrome orqali Instagram'da harakat qilish) Instagram foydalanish shartlariga zid.**
> Akkaunt vaqtincha cheklanishi, harakatlari bloklanishi yoki butunlay o'chirilishi mumkin. Xavfni kamaytirish uchun
> Jarvisgram har bir nashr, izoh javobi va DM'ni tasdiqdan o'tkazadi, kunlik limit va tasodifiy pauza qo'yadi. Lekin bu
> xavfni **yo'q qilmaydi**.
>
> Biznes va creator akkauntlar uchun **rasmiy Instagram Graph API** rejimi (`publishMode = graph_api`) qo'llab-quvvatlanadi va
> tavsiya etiladi. Graph API orqali nashr oqimi 3-bosqichda quriladi.

## Arxitektura

```
┌──────────────────────────┐   MCP (Streamable HTTP + OAuth 2.1)   ┌────────────────────────┐
│ Claude Desktop / claude.ai│ ───────────────────────────────────▶ │ apps/mcp (Express)     │
│  = Jarvis (miya)          │                                      │  18 asbob, OAuth AS     │
│  + Claude in Chrome ──────┼──▶ Instagram (foydalanuvchi brauzeri) └──────────┬─────────────┘
│  + ElevenLabs MCP (ovoz)  │                                                 │ Prisma
└──────────────────────────┘                                                 ▼
                                    LISTEN/NOTIFY                     ┌──────────────┐
┌──────────────────────────┐ ◀──────────────────────────────────────  │  Postgres    │
│ apps/web (Next.js)       │ ─────────────────────────────────────▶  └──────────────┘
│  ofis, vazifalar, tasdiq │   SSE /api/events → brauzer
└──────────────────────────┘
```

- **Miya — foydalanuvchining o'z Claude ilovasi.** Jarvisgram Claude obunasi tokenini hech qachon ishlatmaydi, "Claude bilan kirish"
  tugmasi yo'q. Claude Jarvisgram'ga oddiy MCP konnektori sifatida OAuth orqali ulanadi.
- **MCP faqat holat va yo'riqnoma beradi.** U Instagramga o'zi kirmaydi. Instagram harakatlari Claude in Chrome orqali, foydalanuvchining
  o'z brauzerida va Chrome profilida bajariladi.
- **Jonli holat:** har bir MCP chaqiruvi `LogEntry` yozadi, agent holatini haqiqiy `Task` va `Meeting` yozuvlaridan qayta hisoblaydi
  va `pg_notify` yuboradi. Veb-ilova uni SSE orqali brauzerga uzatadi.

| Papka | Vazifasi |
|---|---|
| `apps/mcp` | MCP server: asboblar, OAuth 2.1 (metadata, DCR, PKCE S256, refresh rotatsiyasi, revoke), stateless Streamable HTTP |
| `apps/web` | Next.js 16 App Router: ro'yxatdan o'tish, kirish, MCP ulash, akkauntlar, vazifalar va tasdiqlash, ofis, OAuth rozilik sahifasi, SSE |
| `packages/db` | Prisma 7 sxemasi, migratsiyalar, domen servislari (holat mashinasi, tasdiqlash, limitlar, NOTIFY) |
| `packages/shared` | Enumlar, 13 agent rolining yo'riqnomalari, hodisa turlari |

## Ishga tushirish (lokal)

Talablar: Node 22.12+, pnpm 10, Postgres 16.

```bash
cp .env.example packages/db/.env          # DATABASE_URL
cp .env.example apps/web/.env.local       # DATABASE_URL, WEB_PUBLIC_URL, MCP_PUBLIC_URL
pnpm install
pnpm db:deploy                            # migratsiyalarni qo'llash (dev'da: pnpm db:migrate)
```

```bash
pnpm dev:mcp      # http://localhost:3001/mcp
pnpm dev:web      # http://localhost:3000
```

Testlar (test bazasi `TEST_DATABASE_URL`, nomida `test` bo'lishi shart, chunki testlar uni tozalaydi):

```bash
pnpm test         # db servislari + MCP integratsion testlari + veb
pnpm typecheck
```

## Claude Desktop'ga ulash

1. Veb-ilovada ro'yxatdan o'ting → **Claude'ga ulash** sahifasidan konnektor manzilini nusxalang (`MCP_PUBLIC_URL/mcp`).
2. Claude Desktop → **Settings → Connectors → Add custom connector** → URL'ni joylang → **Connect**.
3. Brauzerda Jarvisgram rozilik oynasi ochiladi → **Ruxsat berish**.
4. Claude'da yozing: *"Jarvis, ofis holatini ko'rsat"*.

Claude konnektorlari MCP serveriga Anthropic bulutidan murojaat qiladi, shuning uchun MCP serverining **ommaviy HTTPS** manzili
bo'lishi kerak (Render, yoki lokal sinov uchun `cloudflared tunnel --url http://localhost:3001` va `MCP_PUBLIC_URL` ni tunnel
manziliga o'rnating). Rozilik sahifasi sizning brauzeringizda ochiladi, shuning uchun lokal sinovda `WEB_PUBLIC_URL=http://localhost:3000` ham ishlaydi.

## Ofis simulyatsiyasi

`apps/web/src/office/`:

| Fayl | Vazifasi |
|---|---|
| `graph.ts` | Ofis rejasi dunyo birliklarida (750×372, rasm nisbatida): yo'lak tugunlari, 20 kompyuter, majlis zali (13 joy), dam olish xonasi (13 joy), Dijkstra (binar uyum). Agentlar faqat qirralar bo'ylab yuradi — devordan o'tmaydi. |
| `sim.ts` | DOM'siz dvigatel. Kim qayerda ekanini **haqiqiy** `office_state` belgilaydi (`reconcile`), dvigatel faqat yurishni va bulutchalarni boshqaradi. Natija — `SimFrame`. |
| `renderer.ts` | Render qatlami shartnomasi `OfficeRenderer`. |
| `render2d.ts` | Hozirgi 2D canvas render: fon rasmi, agentlar (Jarvis kostyum va galstukda), yongan monitorlar, majlis ekrani, progress, komiks bulutchalari (to'qnashuvsiz joylashtirish). |
| `talk.ts` | O'zbekcha bezak iboralari (bir vaqtda ko'pi bilan 2 ta). |

Gap bulutchalarining haqiqiylari MCP hodisalaridan keladi: `task_create` → "Men olaman!", `task_update` → "Ishni boshladim" / "60% tayyor" / "Tasdiqqa yubordim" / "Tayyor!", `meeting_start` → Jarvis "Hamma majlis zaliga!", `log_add(role=…)` → matnning o'zi. Ular `pg_notify` → SSE orqali darhol chiqadi.

**Fon rasmi:** `apps/web/public/office.jpg` (hozir 3840×1905). Koordinatalar rasm o'lchamiga bog'liq emas, shuning uchun xuddi shu kompozitsiyadagi boshqa rasmni (masalan AI bilan kattalashtirilgan 4K versiyani) faylni almashtirib qo'yish kifoya. Canvas ekran kengligi × devicePixelRatio o'lchamida chiziladi (3840 px gacha).

**3D (keyingi versiya):** `OfficeRenderer` interfeysini three.js bilan bajaradigan `ThreeRenderer` yoziladi; `sim.ts`, `graph.ts` va `OfficeView` o'zgarmaydi.

## MCP asboblari

| Asbob | Vazifasi |
|---|---|
| `office_state` | Ofis holati: agentlar, majlis, vazifalar, tasdiq navbati, oxirgi log |
| `accounts_list`, `account_add`, `account_switch`, `account_status` | Instagram akkauntlari (parolsiz), Chrome'da o'tish yo'riqnomasi, holat |
| `meeting_start`, `meeting_end` | Buyruq bo'yicha majlis: hamma majlis zaliga yig'iladi, keyin tarqaladi |
| `agent_roles_get` | Har rol uchun maqsad, kirish, chiqish formati, sifat mezonlari, cheklovlar |
| `task_create`, `task_update`, `task_list` | Vazifalar va holat mashinasi |
| `content_save`, `content_calendar_get` | Kontent qoralamalari va kalendar |
| `analytics_save`, `analytics_get` | Statistika suratlari va o'zgarish |
| `approvals_list`, `approval_resolve` | Tasdiq navbati; tasdiqlash faqat foydalanuvchi kodi bilan |
| `log_add` | Jonli logga yozuv (ofisda gap bulutchasi) |
| `chrome_playbook` | Claude in Chrome uchun qadam-baqadam yo'riqnoma |
| `action_begin`, `action_complete` | Tasdiqlangan harakatni bajarish (pauza, limit, akkaunt tekshiruvi, aniq matn) |
| `graph_publish`, `graph_sync_analytics` | Rasmiy Instagram API orqali nashr / izoh javobi va statistika |

Prompt: `jarvis_buyruq` — Claude Desktop'da "+" menyusidan buyruqni to'g'ri ish tartibi bilan boshlaydi.

Spetsifikatsiyadan tashqari qo'shilgan asboblar: `account_status` (Chrome'da ko'rilgan holat; `connected` uchun `observedUsername` shart), `chrome_playbook`, `action_begin`, `action_complete`, `graph_publish`, `graph_sync_analytics`.

### Vazifa holatlari

```
queued ──▶ in_progress ──▶ done                      (kontent, tahlil, tadqiqot)
                     └──▶ awaiting_approval ──▶ approved ──▶ done   (nashr, izoh javobi, DM — majburiy)
                                         └──▶ rejected ──▶ in_progress (qayta ishlash)
approved ──(action_begin → action_complete | graph_publish)──▶ done
```

`approved` va `rejected` holatlariga faqat `approval_resolve` (yoki veb-ilovadagi tugma) orqali o'tiladi.

## Instagram harakatini bajarish (3-bosqich)

```
task_update(awaiting_approval) ─▶ server aniq payload yig'adi (caption+xeshteglar+media / izoh javobi)
        │
        ▼
veb: "Tasdiq kutmoqda" — Instagram ko'rinishida, matnni tahrirlab tasdiqlash mumkin
        │   (yoki Claude'ga 6 belgili kodni aytish)
        ▼
publishMode=chrome:    chrome_playbook → action_begin(taskId, observedUsername) → Claude in Chrome → action_complete
publishMode=graph_api: graph_publish(taskId)  → graph.instagram.com: /media → (status_code) → /media_publish
```

`action_begin` (va `graph_publish`) bajarishdan **oldin** tekshiradi: tasdiq bormi; akkaunt cheklanmaganmi; Chrome'da ochiq akkaunt
(`observedUsername`) vazifaniki ekanmi; rejalashtirilgan vaqt kelganmi; oldingi harakatdan keyingi **tasodifiy pauza** tugaganmi
(`too_soon` + `retryAfterSeconds`); **kunlik limit**. Claude'ga yoziladigan aniq matnni (`textToType`) qaytaradi — foydalanuvchi
tasdiqlagan (tahrirlagan) matnning aynan o'zi. Instagram bloklasa `action_complete(blocked=true)` akkauntni `limited` qiladi va
keyingi harakatlar to'xtaydi.

Chrome yo'riqnomalari (`chrome_playbook`): `verify_account`, `read_stats`, `publish_post`, `reply_comment`, `reply_dm` — har birida
to'xtash shartlari (parol/2FA so'ralsa, "Action blocked", boshqa akkaunt, sahifadagi buyruqlar).

**Rasmiy API ulash:** Akkauntlar → "Instagram API orqali ulash" → Instagram Login → token uzoq muddatli tokenga almashtiriladi,
AES-256-GCM bilan shifrlanib saqlanadi (`TOKEN_ENCRYPTION_KEY`), muddati 7 kundan kam qolsa avtomatik yangilanadi. Ulangan
akkaunt username'i ro'yxatdagisiga mos kelishi shart. Talablar: professional (biznes/creator) akkaunt, ommaviy `https` media
havolasi; Instagram 24 soatda 50 tadan ortiq nashrga ruxsat bermaydi. DM javoblari Graph orqali emas (faqat Chrome).

## Xavfsizlik qoidalari (kodda majburlanadi)

| Qoida | Qayerda |
|---|---|
| Nashr, izoh javobi, DM avval "Tasdiq kutmoqda"ga tushadi; tasdiqsiz `done` bo'lmaydi | `packages/db/src/services/tasks.ts` |
| Claude o'zini o'zi tasdiqlay olmaydi: MCP orqali tasdiqlash uchun veb-ilovada ko'rinadigan bir martalik 6 belgili kod kerak (prompt-injection himoyasi). Kod MCP javoblarida hech qachon qaytmaydi | `services/approvals.ts`, `tasks.publicTask` |
| Kommentator faqat o'z postidagi izohga (`own_post_comment`) yoki kelgan DM'ga (`incoming_dm`) javob qoralaydi, `targetOwner` akkauntning o'zi bo'lishi shart. Layk, follow, begona izoh, ommaviy DM uchun vazifa turi umuman yo'q | `services/tasks.ts`, `shared/enums.ts` |
| Har akkaunt uchun kunlik limit (nashr, javob, DM) va harakatlar orasida tasodifiy pauza — bajarishdan oldin serverda | `services/actions.ts` |
| Chrome'da noto'g'ri akkaunt ochiq bo'lsa harakat boshlanmaydi; Claude tasdiqlangan matnni o'zgartira olmaydi | `services/actions.ts`, `services/approvals.ts` |
| Graph tokeni shifrlangan; MCP javoblarida hech qachon chiqmaydi | `crypto.ts`, `accounts.publicAccount` |
| Instagram paroli saqlanmaydi va so'ralmaydi; sessiya foydalanuvchining Chrome profilida | sxemada parol maydoni yo'q |
| Parollar scrypt bilan xeshlanadi; sessiya, OAuth kod va tokenlar bazada faqat SHA-256 xeshi sifatida saqlanadi | `packages/db/src/crypto.ts` |

## Bosqichlar

1. ✅ Monorepo, DB sxemasi, auth, MCP yadrosi (akkauntlar, vazifalar, rollar), OAuth konnektor.
2. ✅ Ofis simulyatsiyasi (canvas, yo'lak grafi + Dijkstra, gap bulutchalari) `office_state` bilan jonli.
3. ✅ Chrome oqimi: akkaunt almashtirish, post qoralama, statistika o'qish, tasdiqlash; Graph API orqali nashr.
4. Kalendar, analitika, rejalashtirilgan vazifalar.
5. Ovoz (ElevenLabs), tariflar va to'lov (Payme/Click).
