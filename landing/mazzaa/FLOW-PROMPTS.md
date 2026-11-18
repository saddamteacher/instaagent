# MAZZAA — Google Flow uchun promptlar

Saytdagi scroll-film 5 sahnadan iborat. Har bir sahna Flow'da **Veo 3.1 → Frames to Video** bilan yaratiladi:
boshlang'ich kadr (start) va oxirgi kadr (end) **Nano Banana**'da oldindan chiziladi. Bitta sahnaning oxirgi kadri
keyingi sahnaning boshlang'ich kadri bo'ladi, shuning uchun scroll paytida film uzilmasdan, bitta uzun kadrdek oqadi.

## Scroll uchun muhim qoidalar

- **Montaj yo'q.** Har bir sahna bitta uzluksiz kadr bo'lsin: "single continuous shot, no cuts".
- **Kamera sekin va silliq.** Faqat sekin push-in yoki dolly. Tez panorama scroll'da tebranib ko'rinadi.
- **Kompozitsiya markazda.** Tova kadr markazida tursin: telefonda 16:9 video yon tomonlardan kesiladi.
- **Matn yo'q.** Videoda yozuv bo'lmasin, matnni sayt o'zi qo'yadi.
- **Format:** 16:9, 8 soniya. Yuklab olishda Flow'dagi eng yuqori sifatni tanlang (4K bo'lsa 4K, bo'lmasa 1080p).

## 0. Uslub (har bir promptning oxiriga qo'shing)

```
Premium TV commercial, photorealistic, shot on ARRI Alexa 35, 50mm lens, shallow depth of field,
pitch-black studio kitchen background, dramatic orange and red rim light from fire, glowing embers in the air,
high contrast, rich blacks, slow motion feel, 4K, no text, no logos, single continuous shot, no cuts.
```

Chipslar shakli logotipdagidek bo'lsin: **kvadrat, to'lqinsimon (ridged) yupqa kartoshka chipslari**.
Flow'da logotip rasmini (`assets/logo.png`) **Ingredient** sifatida yuklang, model chips shakli va rangini shundan oladi.

---

## 1-qadam: Nano Banana'da kalit kadrlar (K0–K5)

| Kadr | Prompt |
|---|---|
| **K0** | Close-up of an empty black carbon-steel frying pan on a gas stove, the burner just ignited with a ring of small blue flames under the pan, a chef in a black chef jacket stands behind (only torso and hands visible, face out of frame), pan centered in frame, dark moody kitchen. |
| **K1** | Same pan and chef, hot oil shimmering inside the pan with tiny bubbles, chef's hand holding a bowl of thin square ridged raw potato slices above the pan, blue burner flames below, pan centered. |
| **K2** | Same pan, full of pale golden square ridged potato chips frying in bubbling oil, light steam rising, chef's hand gripping the pan handle, warm orange glow, pan centered. |
| **K3** | Same pan mid-toss: a huge burst of orange fire erupts from the pan (flambé), dozens of golden square ridged chips flying and flipping in the air through the flames, sparks everywhere, chef holding the handle, pan centered. |
| **K4** | Same pan, chips now deep golden, chef's hand sprinkling red chili flakes and chili powder from above, a red spice dust cloud lit by fire, two whole red chili peppers lying on top of the chips, pan centered. |
| **K5** | Extreme close-up of glowing golden-red spicy square ridged chips covered in red chili flakes, flying toward the camera, black background with floating embers, cinematic final hero shot. |

Har birini 4 variantda chiqaring, eng yaxshisini tanlang. Keyingi kadrda oldingi tanlangan kadrni **reference**
qilib bering, shunda tova, oshpaz va yorug'lik bir xil qoladi.

---

## 2-qadam: Veo 3.1 → Frames to Video (5 ta sahna, har biri 8 s)

**Sahna 1 · Olov yoqildi** (start K0 → end K1)
```
The gas burner flares to life with a soft whoosh, blue flames ring under the black pan, heat haze rises,
the chef pours a thin stream of oil into the pan, oil spreads and starts to shimmer. Slow push-in toward the pan.
```

**Sahna 2 · Kartoshka tovada** (start K1 → end K2)
```
The chef drops thin square ridged potato slices one by one into the hot oil, each slice lands with a small splash
and sizzles, bubbles form around the slices, steam begins to rise, the slices slowly turn pale golden.
Camera slowly cranes down closer to the pan.
```

**Sahna 3 · OLOV!** (start K2 → end K3)
```
The chef jerks the pan upward in one strong toss, a massive column of orange flambé fire bursts out of the pan,
golden chips fly up and flip in slow motion through the flames, sparks and embers explode outward,
the fire lights the whole scene in orange. Camera holds steady with a very slow push-in.
```

**Sahna 4 · Chili yomg'iri** (start K3 → end K4)
```
The flames calm down, chips fall back into the pan, the chef sprinkles bright red chili flakes and chili powder
from above like rain, a red dust cloud drifts through the warm light, two whole red chili peppers drop onto the chips.
Slow motion, camera slowly tilts down to look into the pan.
```

**Sahna 5 · Final** (start K4 → end K5)
```
A few spicy golden-red chips lift out of the pan and float toward the camera in slow motion,
the background fades to pure black with glowing embers drifting upward, final hero product moment.
Camera pushes in smoothly.
```

Agar sahna yoqmasa, **Extend** emas, shu sahnani qayta yarating: Extend kadrlar orasidagi moslikni buzadi.

---

## 3-qadam: Saytga qo'yish

1. Flow'dan 5 ta videoni yuklab oling: `s1.mp4 … s5.mp4`.
2. Ularni `landing/mazzaa/` papkasiga ko'chiring va ishga tushiring:

   ```bash
   scripts/make-frames.sh -n 300 --4k s1.mp4 s2.mp4 s3.mp4 s4.mp4 s5.mp4
   ```

   Skript videolarni birlashtiradi, 300 ta WebP kadr chiqaradi (HD 1920px va 4K 3840px)
   va `assets/frames/manifest.json` yozadi. Sayt manifestni ko'rib, o'zi kadrlar rejimiga o'tadi.
3. Kadrlar soni va sifati: `-n` ko'proq bo'lsa harakat silliqroq, lekin sayt og'irlashadi.
   300 kadr HD taxminan 30–45 MB bo'ladi. 4K faqat katta ekranlarda (2300px dan yuqori) yuklanadi.

Kadrlar rejimida sayt matnli bo'limlarni videoga teng bo'lib qo'yadi: har bir sahna filmning 1/5 qismi.
Shuning uchun 5 ta sahnani taxminan bir xil uzunlikda (8 s) qiling.
