# EXAMPLE — Ekilib · "Is your blood sugar a roller coaster?" (45 s, Spanish, illustrations + voice + animated chart)
#
# What it shows: a numbered list of six items, an animated glucose/insulin card, a before/after morph of a plate, a
# "save this reel" outro with the client's logo, and captions timed word by word from nine TTS sentences (one file per
# sentence). Every cut is derived from the voice with caps.word_time(); nothing is placed by eye.
#
# Work folder: img/ (13 illustrations, Nano Banana Pro with a style reference), vid/ (12 clips, Seedance/Kling; run
# `media.py frames .` to extract them), vo/v01-v09.mp3 (ElevenLabs v3, one sentence each), music/base.mp3 (Lyria),
# ref/ekilib_logo.png. Preview:  python reel.py --preview      Render:  python reel.py
import sys, os, math
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
STUDIO = os.environ.get('INVOKARD_STUDIO') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'scripts')
sys.path.insert(0, STUDIO)
from PIL import ImageDraw
import reelkit as rk
from reelkit import W, H, Reel, Captions, Still, blit, text_img, pill, lerp, clamp01, eo, eio, eback
import pieces as pz
from pieces import source, sfx

rk.set_base(os.environ.get('REEL_DIR', os.path.dirname(os.path.abspath(__file__))))
B = pz.BRANDS['lime'].activate()                       # Ekilib: navy / sky / lime, measured from the logo
reel = Reel('ekilib'); caps = Captions(size=70, y=1440, maxw=920); reel.caps = caps

# ---------------------------------------------------------------- voice and captions
T = dict(v01=0.30, v02=3.40, v03=9.70, v04=14.70, v05=19.35, v06=26.05, v07=29.95, v08=34.05, v09=38.55); TOTAL = 45.0
for k, t in T.items(): reel.vo(f'vo/{k}.mp3', t)
L = [('v01', 'Tu azúcar en sangre / no debería ser una *montaña* *rusa*.', 70),
     ('v02', 'Refrescos, bollería, *ultraprocesados*. / Pico de *glucosa*, pico de *insulina*, / y *bajón*.', 70),
     ('v03', 'La evidencia científica señala / a *seis* *aliados* / que mejoran tu sensibilidad / a la *insulina*.', 64),
     ('v04', '*Legumbres*. Pescado *azul*. Avena y cereales *integrales*.', 70),
     ('v05', 'Aceite de oliva *virgen* *extra*. Nueces y *almendras*. Y verduras *verdes*, / como espinacas y brócoli.', 64),
     ('v06', 'Y el *truco* que lo cambia todo: / no comas el carbohidrato *solo*.', 66),
     ('v07', 'Acompáñalo de *proteína* / o grasa *saludable*, / y el pico se *aplana*.', 66),
     ('v08', 'No hay alimento *milagro*. Funciona el *conjunto*, / y que puedas *mantenerlo*.', 66),
     ('v09', 'En *Ekilib* te ayudamos / a crear tu plan. *Guarda* este vídeo, / y bájate de la *montaña* *rusa*.', 64)]
for k, txt, size in L: caps.line(k, txt, f'vo/{k}.mp3', T[k], size=size)
wt = caps.word_time

# ---------------------------------------------------------------- cuts derived from the voice
T_JUNK = T['v02'] - 0.05; T_DIP = wt('v02', 3) - 0.12; T_TABLE = T['v03'] - 0.20; T_TABLE_CLIP = T_TABLE + 1.15
A = [T['v04'] - 0.15, T['v04'] + 1.07, T['v04'] + 2.27, T['v05'] - 0.12, T['v05'] + 1.93, T['v05'] + 3.63]   # spans from media.py voice
T_ALONE = T['v06'] - 0.20; T_MORPH = T['v07'] - 0.10; T_ENERGY = T['v08'] - 0.08; T_VISIT = T['v09'] - 0.15
T_END = wt('v09', 8) - 0.18

# ---------------------------------------------------------------- shots
reel.shot(0.0, T_JUNK, source('montana', 'img/montana.png', speed=1.38, z=(1.08, 1.12), c=(.5, .40)))
reel.shot(T_JUNK, T_DIP, Still('img/montana.png', z=(2.05, 2.35), c0=(.47, .33), c1=(.47, .32)))     # reframe: the pastry cart
reel.shot(T_DIP, T_TABLE, source('bajon', 'img/bajon.png', start=0.4, z=(1.0, 1.05)))
reel.shot(T_TABLE, T_TABLE_CLIP, Still('img/mesa.png', z=(1.16, 1.06)))                              # still, then the clip: 4 s longer without slowing it
reel.shot(T_TABLE_CLIP, A[0], source('mesa', 'img/mesa.png', z=(1.06, 1.0)))
ITEMS = [('legumbres', 'LEGUMBRES', 'Fibra soluble + proteína vegetal'), ('pescado', 'PESCADO AZUL', 'Omega-3 · 2-3 veces por semana'),
         ('avena', 'AVENA E INTEGRALES', 'Betaglucanos que regulan la glucemia'), ('aove', 'ACEITE DE OLIVA VIRGEN EXTRA', 'Tu grasa principal · polifenoles'),
         ('frutos', 'NUECES Y ALMENDRAS', 'Magnesio y grasas insaturadas'), ('verduras', 'VERDURAS VERDES', 'Mucho volumen, muy baja carga glucémica')]
A_END = A[1:] + [T_ALONE]
for i, (key, name, benefit) in enumerate(ITEMS):
    reel.shot(A[i], A_END[i], source(key, f'img/{key}.png', start=0.25, z=(1.14, 1.24), c=(.5, .46)))
    reel.ov(A[i], A_END[i], pz.list_item(B, i + 1, 6, name, benefit))
reel.shot(T_ALONE, T_MORPH, Still('img/plato_solo.png', z=(1.07, 1.0)))
reel.shot(T_MORPH, T_ENERGY, source('morph', 'img/plato_combi.png', start=0.45, speed=1.12, z=(1.0, 1.0)))
reel.shot(T_ENERGY, T_VISIT, source('energia', 'img/energia.png', speed=1.08, z=(1.04, 1.10), c=(.5, .45)))
reel.shot(T_VISIT, T_END, source('consulta', 'img/consulta.png', start=0.3, z=(1.10, 1.16), c=(.5, .42)))
reel.shot(T_END, TOTAL, pz.outro_save(B, 'img/montana.png', 'ref/ekilib_logo.png', title='Guarda este reel', sub='y envíaselo a quien lo necesite',
                                      cta='Pide tu cita · ekilib.es', note=('Contenido divulgativo. No sustituye la valoración', 'individual de tu profesional sanitario.')))

# ---------------------------------------------------------------- layers
GRAD = pz.bottom_gradient(B)
reel.ovs.insert(0, (0.0, T_END, lambda c, tl, dur, t: c.alpha_composite(GRAD)))                       # under everything else
reel.ov(0.0, T_JUNK, pz.headline(B, 'SENSIBILIDAD A LA INSULINA', '¿Tu azúcar es una', 'MONTAÑA RUSA?'))

JUNK = [('Refrescos', 0), ('Bollería', 1), ('Ultraprocesados', 2)]
def junk(c, tl, dur, t):
    for k, (txt, wi) in enumerate(JUNK):
        s = wt('v02', wi) - 0.05
        if t >= s:
            q = clamp01((t - s) / 0.3)
            blit(c, pill(txt, 'black', 56, B.white, B.alert, padx=32, pady=14, shadow=18), W / 2, 250 + k * 112, lerp(0.6, 1, eback(q)), clamp01(q * 2))
reel.ov(T_JUNK, T_DIP, junk)

def g_bad(x): return 0.24 + 0.70 * math.exp(-((x - 0.30) / 0.10) ** 2) - 0.20 * math.exp(-((x - 0.66) / 0.12) ** 2)
def i_bad(x): return 0.14 + 0.62 * math.exp(-((x - 0.41) / 0.12) ** 2)
def g_mix(a):
    return lambda x: 0.24 + lerp(0.70, 0.17, a) * math.exp(-((x - lerp(0.30, 0.40, a)) / lerp(0.10, 0.26, a)) ** 2) - 0.20 * (1 - a) * math.exp(-((x - 0.66) / 0.12) ** 2)
CARD = pz.Card(B)
w_glu, w_ins, w_dip = wt('v02', 5), wt('v02', 8), wt('v02', 10)
def dip(c, tl, dur, t):
    o = CARD.draw(c, clamp01(tl / 0.45), 'DESPUÉS DE COMERLOS', legend=(('glucosa', B.alert), ('insulina', B.light)))
    if not o: return
    CARD.curve(c, o, i_bad, eio(clamp01((t - (w_ins - 0.55)) / 1.4)), B.light, 9)
    CARD.curve(c, o, g_bad, eio(clamp01((t - (w_glu - 0.55)) / 1.5)), B.alert, 11)
    if t >= w_dip - 0.05:
        q = clamp01((t - (w_dip - 0.05)) / 0.3)
        blit(c, pill('BAJÓN', 'black', 40, B.white, B.alert, padx=22, pady=9, shadow=12), o[0] + 0.66 * CARD.plot[2] + 150,
             o[1] + (1 - g_bad(0.66)) * CARD.plot[3] - 10, lerp(0.5, 1, eback(q)), clamp01(q * 2))
reel.ov(T_DIP, T_TABLE, dip)

w_six, w_imp = wt('v03', 5), wt('v03', 8)
def table(c, tl, dur, t):
    blit(c, pill('SEGÚN LA EVIDENCIA CIENTÍFICA', 'black', 32, B.white, B.dark, padx=26, pady=12, tracking=3, shadow=12), W / 2, 236,
         lerp(0.85, 1, eback(clamp01(tl / 0.35))), clamp01(tl / 0.25))
    if t >= w_six - 0.1:
        q = clamp01((t - (w_six - 0.1)) / 0.4); blit(c, text_img('6 ALIADOS', 'black', 128, B.dark), W / 2, 352, lerp(0.6, 1, eback(q)), clamp01(q * 2))
    if t >= w_imp - 0.1:
        q = clamp01((t - (w_imp - 0.1)) / 0.35)
        blit(c, pill('mejoran tu sensibilidad a la insulina', 'black', 40, B.accent_text, B.accent, padx=28, pady=12, shadow=14), W / 2, 468, lerp(0.8, 1, eback(q)), clamp01(q * 2))
reel.ov(T_TABLE, A[0], table)

w_carb, w_prot, w_fat, w_peak = wt('v06', 10), wt('v07', 2), wt('v07', 4), wt('v07', 8)
def plate(c, tl, dur, t):
    o = CARD.draw(c, clamp01(tl / 0.45), 'EL TRUCO · TU CURVA DE GLUCOSA')
    if not o: return
    a = eio(clamp01((t - (w_peak - 0.75)) / 1.5))                                                     # 0 = alone · 1 = combined
    CARD.curve(c, o, g_mix(a), eio(clamp01((t - (w_carb - 0.5)) / 1.3)), pz.mix(B.alert, B.accent, a), 12)
    if t >= w_carb - 0.1 and a < 0.5:
        q = clamp01((t - (w_carb - 0.1)) / 0.3)
        blit(c, pill('carbohidrato solo', 'black', 38, B.white, B.alert, padx=22, pady=9, shadow=12), o[0] + CARD.plot[2] * 0.72, o[1] + 40,
             lerp(0.6, 1, eback(q)), clamp01(q * 2) * (1 - clamp01(a * 3)))
    if a >= 0.5:
        q = clamp01((a - 0.5) / 0.3)
        blit(c, pill('+ proteína o grasa saludable', 'black', 36, B.accent_text, B.accent, padx=22, pady=9, shadow=12), o[0] + CARD.plot[2] * 0.60, o[1] + 34, lerp(0.6, 1, eback(q)), q)
    for k, (txt, s) in enumerate([('Proteína', w_prot - 0.05), ('Grasa saludable', w_fat - 0.05)]):
        if t >= s:
            q = clamp01((t - s) / 0.3)
            blit(c, pill(txt, 'black', 44, B.dark_deep, (255, 255, 255, 245), padx=26, pady=12, dot=B.accent, shadow=16), 290 + k * 440, 1200, lerp(0.6, 1, eback(q)), clamp01(q * 2))
reel.ov(T_ALONE, T_ENERGY, plate)

w_mir, w_whole, w_keep = wt('v08', 3), wt('v08', 4), wt('v08', 8)
_mir = text_img('Alimento milagro', 'black', 72, B.dark)
def energy(c, tl, dur, t):
    q = clamp01(tl / 0.35); blit(c, _mir, W / 2, 262, lerp(0.85, 1, eback(q)), clamp01(q * 2))
    if t >= w_mir - 0.25:                                                                             # strike-through
        s = eo(clamp01((t - (w_mir - 0.25)) / 0.35)); x0 = W / 2 - _mir.width / 2 + 6
        ImageDraw.Draw(c).line((x0, 268, x0 + (_mir.width - 12) * s, 268), fill=B.alert + (255,), width=12)
    if t >= w_whole - 0.1:
        q2 = clamp01((t - (w_whole - 0.1)) / 0.4)
        blit(c, pill('FUNCIONA EL CONJUNTO', 'black', 62, B.accent_text, B.accent, padx=32, pady=14, r=22, shadow=20), W / 2, 384, lerp(0.6, 1, eback(q2)), clamp01(q2 * 2))
    if t >= w_keep - 0.1:
        q3 = clamp01((t - (w_keep - 0.1)) / 0.35)
        blit(c, pill('…y que puedas mantenerlo', 'black', 44, B.white, B.dark, padx=28, pady=12, shadow=16), W / 2, 492, lerp(0.8, 1, eback(q3)), clamp01(q3 * 2))
reel.ov(T_ENERGY, T_VISIT, energy)
reel.ov(T_VISIT, T_END, lambda c, tl, dur, t: blit(c, pill('TU PLAN, CONTIGO', 'black', 36, B.white, B.dark, padx=28, pady=12, tracking=3, shadow=12),
                                                  W / 2, 250, lerp(0.85, 1, eback(clamp01(tl / 0.35))), clamp01(tl / 0.25)))

# ---------------------------------------------------------------- sound
reel.sfx(sfx('coaster'), 0.05, 0.30)
for t_, g in [(T_JUNK, .32), (T_DIP, .32), (T_TABLE, .34), (T_ALONE, .34), (T_ENERGY, .32), (T_VISIT, .30), (T_END, .34)]: reel.sfx(sfx('whoosh'), t_ - 0.12, g)
for _, wi in JUNK: reel.sfx(sfx('pop'), wt('v02', wi) - 0.05, 0.30)
for a_ in A: reel.sfx(sfx('pop'), a_ + 0.02, 0.34)
reel.sfx(sfx('pop'), w_six - 0.1, 0.36); reel.sfx(sfx('pop'), w_whole - 0.1, 0.34)
reel.sfx(sfx('shimmer'), T_MORPH + 0.05, 0.36); reel.sfx(sfx('chime'), w_peak + 0.35, 0.40); reel.sfx(sfx('chime'), T_END + 0.3, 0.30)

if __name__ == '__main__':
    os.makedirs(rk.P('review'), exist_ok=True); os.makedirs(rk.P('out'), exist_ok=True)
    if '--preview' in sys.argv:
        n = 28; reel.preview([round(TOTAL * (i + 0.5) / n, 2) for i in range(n)], 'review/preview.jpg', cols=7, scale=0.22); print('review/preview.jpg')
    else:
        reel.render('out/reel.mp4', TOTAL, music='music/base.mp3', music_gain=0.24); reel.cover(1.2, 'out/cover.jpg'); print('ok -> out/reel.mp4')
