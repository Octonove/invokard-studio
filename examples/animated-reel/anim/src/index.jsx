// The drawn parts of the animated-reel example. Three compositions, 1080x1920 at 30 fps:
//   Headline  transparent: a kinetic title whose letters fall into place on springs, and an underline that draws itself
//   Counters  transparent: a card whose numbers count up, filled with props sent by reel.py (what the reel contains)
//   EndCard   opaque: brand gradient, drifting particles (seeded, the same on every render) and the call to action
import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, random, registerRoot, spring, useCurrentFrame, useVideoConfig}
  from 'invokard-studio';
import {loadFont} from 'invokard-studio/google-fonts/Outfit';

const {fontFamily} = loadFont('normal', {weights: ['600', '800'], subsets: ['latin']});
const NAVY = '#1E3A5F', DEEP = '#0F2238', CORAL = '#CE6E61', CREAM = '#FFF4E8';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};

const Headline = ({words = ['Drawn', 'with', 'code']}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  let letter = 0;
  const line = interpolate(frame, [26, 54], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{alignItems: 'center', paddingTop: 330}}>
      {words.map((word, i) => (
        <div key={i} style={{display: 'flex', fontFamily, fontWeight: 800, fontSize: 176, lineHeight: 1.02,
          color: i === words.length - 1 ? CORAL : CREAM, textShadow: '0 12px 44px rgba(0,0,0,0.38)'}}>
          {[...word].map((ch, j) => {
            const s = spring({frame: frame - 3 * letter++, fps, config: {damping: 12, stiffness: 170}});
            return (
              <span key={j} style={{display: 'inline-block', opacity: Math.min(1, s * 1.6),
                transform: `translateY(${(1 - s) * 150}px) rotate(${(1 - s) * (j % 2 ? 14 : -14)}deg)`}}>{ch}</span>
            );
          })}
        </div>
      ))}
      <svg width={640} height={70} style={{marginTop: 18, overflow: 'visible'}}>
        <path d="M12 46 Q 170 4 320 34 T 628 26" fill="none" stroke={CORAL} strokeWidth={18} strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - line} />
      </svg>
    </AbsoluteFill>
  );
};

const Counters = ({title = 'In this reel', items = [{label: 'sentences', value: 4}]}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const card = spring({frame, fps, config: {damping: 15, stiffness: 140}});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', paddingBottom: 260}}>
      <div style={{width: 820, padding: '54px 64px 30px', borderRadius: 52, background: '#FFFCF7',
        boxShadow: '0 34px 90px rgba(0, 0, 0, 0.38)', transform: `translateY(${(1 - card) * 260}px) scale(${0.8 + 0.2 * card})`,
        opacity: Math.min(1, card * 1.5)}}>
        <div style={{fontFamily, fontWeight: 800, fontSize: 62, color: NAVY, marginBottom: 26}}>{title}</div>
        {items.map((item, i) => {
          const s = spring({frame: frame - 10 - 9 * i, fps, config: {damping: 18, stiffness: 120}});
          const count = Math.round(item.value * Math.min(1, s));
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', marginBottom: 26, opacity: Math.min(1, s * 1.4),
              transform: `translateX(${(1 - s) * -90}px)`}}>
              <div style={{width: 150, fontFamily, fontWeight: 800, fontSize: 92, color: i === items.length - 1 ? CORAL : NAVY,
                fontVariantNumeric: 'tabular-nums'}}>{count}</div>
              <div style={{fontFamily, fontWeight: 600, fontSize: 50, color: '#4B5563'}}>{item.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard = ({title = 'Montage + animation', sub = 'One script · Invokard Studio', url = 'github.com/Octonove/invokard-studio'}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = spring({frame: frame - 4, fps, config: {damping: 14}});
  const u = spring({frame: frame - 16, fps, config: {damping: 16}});
  return (
    <AbsoluteFill style={{background: `radial-gradient(120% 80% at 50% 30%, ${NAVY} 0%, ${DEEP} 70%)`}}>
      {Array.from({length: 70}, (_, i) => {
        const x = random(`x${i}`) * width, y0 = random(`y${i}`) * height, r = 4 + random(`r${i}`) * 14;
        const y = ((y0 - frame * (1.2 + random(`v${i}`) * 3)) % height + height) % height;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: r, height: r, borderRadius: r,
          background: i % 5 === 0 ? CORAL : CREAM, opacity: 0.15 + random(`o${i}`) * 0.45}} />;
      })}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily}}>
        <div style={{fontWeight: 800, fontSize: 112, lineHeight: 1.05, color: CREAM, maxWidth: 900,
          transform: `scale(${0.6 + 0.4 * t})`, opacity: Math.min(1, t * 1.5)}}>{title}</div>
        <div style={{marginTop: 34, fontWeight: 600, fontSize: 52, color: CORAL, opacity: u,
          transform: `translateY(${(1 - u) * 40}px)`}}>{sub}</div>
        <div style={{marginTop: 70, padding: '22px 44px', borderRadius: 60, background: CREAM, color: NAVY, fontWeight: 800,
          fontSize: 40, opacity: u, transform: `scale(${0.8 + 0.2 * u})`}}>{url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const size = {width: 1080, height: 1920, fps: 30};
registerRoot(() => (
  <>
    <Composition id="Headline" component={Headline} durationInFrames={105} {...size} />
    <Composition id="Counters" component={Counters} durationInFrames={90} {...size} />
    <Composition id="EndCard" component={EndCard} durationInFrames={120} {...size} />
  </>
));
