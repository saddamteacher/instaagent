# MAZZAA — landing page

Juda achchiq chipslar uchun premium scroll landing. Statik sayt: build kerak emas.

## Ishga tushirish

```bash
cd landing/mazzaa
python3 -m http.server 8080
```

Keyin brauzerda `http://localhost:8080` ni oching. Istalgan statik hostingga (Netlify, Vercel, Render static, GitHub Pages)
papkaning o'zini yuklash kifoya.

## Tuzilma

| Fayl | Vazifa |
|---|---|
| `index.html` | Bo'limlar: hero, scroll-film (5 sahna), achchiqlik shkalasi, afzalliklar, challenge, CTA |
| `styles.css` | Dizayn: qora + olov gradienti, Unbounded / Manrope shriftlari |
| `js/film.js` | Scroll-film dvigateli: kadrlar ketma-ketligi yoki canvas'dagi jonli sahna |
| `js/main.js` | GSAP ScrollTrigger + Lenis silliq scroll, loader, matn animatsiyalari, til, uchqunlar |
| `js/i18n.js` | O'zbekcha va ruscha matnlar |
| `scripts/make-frames.sh` | Flow videolarini WebP kadrlarga aylantiradi |
| `FLOW-PROMPTS.md` | Google Flow (Nano Banana + Veo 3.1) uchun sahna promptlari |

## Scroll-film qanday ishlaydi

`#film` bo'limi 700vh balandlikda, ichidagi canvas ekranga yopishib turadi. Scroll progressi (0→1) filmning vaqtiga aylanadi:

1. **Olov yoqildi**: gaz yonadi, tova qiziydi
2. **Kartoshka tovada**: chipslar tushib, yog'da shivillaydi
3. **OLOV!**: tova siltanadi, alanga ko'tariladi, chipslar havoda aylanadi
4. **Chili yomg'iri**: qalampir sepiladi, chipslar qizaradi
5. **Final**: logotip

Ikkita rejim bor:

- **Kadrlar rejimi.** `assets/frames/manifest.json` bo'lsa, Flow'da yaratilgan videoning kadrlari scroll bilan aylantiriladi
  (Apple uslubidagi image sequence). Katta ekranda 4K kadrlar, qolganida HD yuklanadi.
- **Jonli rejim.** Kadrlar bo'lmasa, butun sahna canvas'da real vaqtda chiziladi: olov, uchqun, tutun va yog' pufakchalari.
  Sayt videolarsiz ham to'liq ishlaydi.

Kadrlarni tayyorlash uchun `FLOW-PROMPTS.md` ga qarang.

## Sozlash

- Buyurtma havolalari: `index.html` dagi `#buy` bo'limidagi `href="#"` larni Telegram / Instagram manzillariga almashtiring.
- Matnlar: `js/i18n.js`.
- `prefers-reduced-motion` yoqilgan bo'lsa, silliq scroll va zarrachalar o'chadi.
