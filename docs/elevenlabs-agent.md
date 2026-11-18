# ElevenLabs ovozli agent (veb-ofis, ixtiyoriy)

Ofis sahifasidagi **🎙 Ovoz bilan** tugmasi ElevenLabs Agents platformasidagi agentga ulanadi. Agent gapingizni tinglaydi,
buyruqni aniqlashtiradi va `jarvis_buyruq` client tool'i orqali uni Jarvisgram **buyruqlar qutisi**ga yozadi. Agent Instagram'da
hech narsa qilmaydi va vazifa yaratmaydi — buyruqni Jarvis (sizning Claude ilovangiz) `due_list` orqali olib bajaradi.

## 1. Agent yaratish (ElevenLabs → Agents → New agent)

- **Til:** o'zbek (yoki rus), ovozni o'zingiz tanlang.
- **Birinchi xabar:** `Assalomu alaykum! Jarvisgram ofisiga qanday buyruq berasiz?`
- **System prompt:**

```
Sen Jarvisgram ofisining qabulxona yordamchisisan. Vazifang — foydalanuvchidan Instagram akkauntlari bo'yicha
buyruqni eshitib, uni qisqa va aniq bitta gapga keltirish va jarvis_buyruq tool'i bilan yozish.
- Agar buyruq noaniq bo'lsa, bitta aniqlashtiruvchi savol ber (qaysi akkaunt, qachongacha, qanday format).
- Yozishdan oldin buyruqni ovoz chiqarib takrorla va tasdiq so'ra. Faqat foydalanuvchi "ha" desa tool'ni chaqir.
- Hech narsani o'zing bajarma, nashr qilma, va'da berma. "Buyruq qutiga yozildi, Jarvis Claude'da bajaradi" de.
- Parol, karta raqami yoki shaxsiy ma'lumot so'rama va qabul qilma.
```

## 2. Client tool qo'shish (Agent → Tools → Add tool → Client)

Nomi koddagi bilan **aynan bir xil** bo'lishi shart:

```json
{
  "type": "client",
  "name": "jarvis_buyruq",
  "description": "Foydalanuvchi tasdiqlagan buyruqni Jarvisgram buyruqlar qutisiga yozadi.",
  "expects_response": true,
  "parameters": {
    "type": "object",
    "properties": {
      "buyruq": { "type": "string", "description": "Buyruqning to'liq matni, o'zbek tilida, bitta gap" }
    },
    "required": ["buyruq"]
  }
}
```

"Wait for response" yoqilgan bo'lsin — shunda agent "qutiga yozildi" javobini eshitib, foydalanuvchiga aytadi.

## 3. Jarvisgram sozlamalari

| O'zgaruvchi | Qayerda | Izoh |
|---|---|---|
| `ELEVENLABS_AGENT_ID` | web | Agent ID (`agent_...`) |
| `ELEVENLABS_API_KEY` | web (ixtiyoriy) | Yopiq (private) agent uchun: server signed URL oladi, kalit brauzerga chiqmaydi |

Ovozli buyruq **Pro** va **Agentlik** tariflarida yoqiladi. Mikrofonga ruxsat brauzerda so'raladi.
