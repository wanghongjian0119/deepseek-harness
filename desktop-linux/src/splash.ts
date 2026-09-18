/**
 * Launch splash for the desktop shell.
 *
 * The Electron window shows this page while the bundled `dsh web` backend
 * boots, then `main.ts` replaces it with the served GUI URL. Everything is
 * inline — markup, CSS, the whale mark and the wordmark as SVG paths — because
 * the page must paint before the backend, its payload, or any bundle exists;
 * a `data:` URL is also the only document the shell can load with no origin of
 * its own.
 *
 * The status line is the whole interface between the two processes: the main
 * process evaluates {@link splashStatusScript} over `webContents` at each boot
 * stage, and the page's `window.dshSplash.status` swaps the text with a short
 * crossfade. The page reads no other input and calls nothing back.
 * @module @deepseek-ai/dsh-desktop-linux/splash
 */

/** Prefix that turns {@link SPLASH_HTML} into a loadable, self-contained document. */
const DATA_URL_PREFIX = 'data:text/html;charset=utf-8,'

/**
 * The splash document: one page, no external resource.
 *
 * Inlined rather than shipped as a file so the packaged shell has no path to
 * resolve and no asset to copy. It is deliberately not indented — the markup is
 * worth reading as markup.
 */
const SPLASH_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepSeek Harness</title>
<style>
  :root{
    /* DeepSeek brand blue, sampled from desktop-linux/build/icons/256x256.png */
    --brand:#4D6BFE;
    --brand-soft:rgba(77,107,254,.55);
    --abyss:#02040A;
    --pale:#E9EFFF;
    --muted:rgba(176,197,242,.62);
    --font: "Inter","Noto Sans","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC",
            "PingFang SC","Microsoft YaHei","DejaVu Sans",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{
    background:var(--abyss);color:var(--pale);font-family:var(--font);
    overflow:hidden;-webkit-font-smoothing:antialiased;
  }

  /* ---------- the water column ---------- */
  .sea{position:fixed;inset:0;overflow:hidden}
  .water{
    position:absolute;inset:0;
    background:linear-gradient(180deg,
      #16386F 0%, #102A58 12%, #0B1C3E 30%, #071229 48%, #050F22 68%, #030814 86%, #02050D 100%);
    opacity:0;animation:water-in 1.1s ease-out forwards;
  }
  .sun{
    position:absolute;left:50%;top:-46%;width:116%;height:80%;transform:translateX(-50%);
    background:radial-gradient(50% 50% at 50% 50%,rgba(122,158,255,.36),rgba(74,112,236,.12) 42%,transparent 68%);
    opacity:0;animation:fade-in 1.4s .25s ease-out forwards;
  }
  /* caustics — the light that a moving surface casts on the underside of water */
  .caustics{
    position:absolute;left:-24%;right:-24%;top:-12%;height:64%;
    background-repeat:repeat;
    background-image:
      radial-gradient(closest-side,rgba(150,188,255,.24),transparent 100%),
      radial-gradient(closest-side,rgba(120,165,255,.18),transparent 100%),
      radial-gradient(closest-side,rgba(176,206,255,.15),transparent 100%);
    background-size:340px 210px,470px 300px,260px 170px;
    background-position:0 0,120px 60px,200px 120px;
    filter:blur(18px);mix-blend-mode:screen;opacity:0;
    -webkit-mask-image:linear-gradient(180deg,#000 0,rgba(0,0,0,.32) 46%,transparent 84%);
    mask-image:linear-gradient(180deg,#000 0,rgba(0,0,0,.32) 46%,transparent 84%);
    animation:caustics 34s linear infinite, fade-in 2.4s .4s ease-out forwards;
  }
  @keyframes caustics{
    from{background-position:0 0,120px 60px,200px 120px}
    to{background-position:340px 210px,590px 360px,460px 290px}
  }
  .vignette{
    position:absolute;inset:0;
    background:radial-gradient(80% 68% at 50% 40%,transparent 44%,rgba(1,3,8,.50) 100%);
  }

  /* shafts of surface light, slowly swaying */
  .ray{
    position:absolute;top:-20%;height:145%;width:210px;
    transform-origin:50% 0;mix-blend-mode:screen;filter:blur(15px);
    background:linear-gradient(180deg,rgba(168,198,255,.70),rgba(95,135,255,.16) 44%,transparent 80%);
    -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 44%,#000 56%,transparent 100%);
    mask-image:linear-gradient(90deg,transparent 0,#000 44%,#000 56%,transparent 100%);
    opacity:0;animation:ray-in 2s .2s ease-out forwards, sway 21s ease-in-out infinite alternate;
  }
  .ray.r1{left:12%;width:150px;--tilt:-16deg;--peak:.30;animation-delay:1.6s,0s}
  .ray.r2{left:45%;width:230px;--tilt:1.5deg;--peak:.44}
  .ray.r3{left:79%;width:150px;--tilt:15deg;--peak:.26;animation-delay:1.8s,0s}

  /* drifting plankton — the water moves past the whale, so the whale never
     has to leave the frame to feel like it is swimming */
  .plankton{
    position:absolute;inset:0 -62%;
    background-repeat:repeat;will-change:transform;
    animation-name:flow;animation-timing-function:linear;animation-iteration-count:infinite;
  }
  @keyframes flow{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-1 * var(--tile)),0,0)}}
  .plankton.near{
    --tile:180px;
    background-image:
      radial-gradient(1.3px 1.3px at 24px 40px,rgba(226,238,255,.50),transparent 70%),
      radial-gradient(1px 1px at 96px 122px,rgba(200,220,255,.34),transparent 70%),
      radial-gradient(1.7px 1.7px at 148px 22px,rgba(216,232,255,.42),transparent 70%),
      radial-gradient(1px 1px at 62px 168px,rgba(190,214,255,.28),transparent 70%);
    background-size:180px 190px;animation-duration:34s;
  }
  .plankton.mid{
    --tile:300px;
    background-image:
      radial-gradient(2.1px 2.1px at 60px 70px,rgba(140,178,255,.34),transparent 70%),
      radial-gradient(1.5px 1.5px at 210px 190px,rgba(170,200,255,.26),transparent 70%),
      radial-gradient(2.4px 2.4px at 250px 60px,rgba(120,160,255,.30),transparent 70%);
    background-size:300px 260px;animation-duration:62s;
  }
  .plankton.far{
    --tile:460px;
    background-image:
      radial-gradient(3px 3px at 120px 140px,rgba(110,150,255,.20),transparent 72%),
      radial-gradient(2.4px 2.4px at 350px 320px,rgba(130,170,255,.16),transparent 72%);
    background-size:460px 420px;animation-duration:104s;filter:blur(1px);
  }

  /* marine snow: out-of-focus particles in front of the lens — the single cue
     that reads as "underwater footage" rather than "starfield" */
  .bokeh{
    position:absolute;inset:0 -85%;filter:blur(6px);mix-blend-mode:screen;opacity:0;
    background-repeat:repeat;background-size:720px 640px;
    background-image:
      radial-gradient(17px 17px at 120px 180px,rgba(152,192,255,.17),transparent 100%),
      radial-gradient(27px 27px at 520px 430px,rgba(120,165,255,.13),transparent 100%),
      radial-gradient(12px 12px at 300px 300px,rgba(196,220,255,.15),transparent 100%),
      radial-gradient(34px 34px at 660px 600px,rgba(120,165,255,.10),transparent 100%);
    animation:bokeh-drift 150s linear infinite, fade-in 3s .8s ease-out forwards;
  }
  @keyframes bokeh-drift{from{background-position:0 0}to{background-position:-720px 0}}

  /* ---------- the whale ---------- */
  .stage{
    position:relative;height:100%;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
  }
  .hero{display:flex;flex-direction:column;align-items:center;transform:translateY(-1vh);position:relative}

  .whale-wrap{position:relative;display:flex;align-items:center;justify-content:center}
  .whale-enter{opacity:0;animation:whale-in 1.5s .5s cubic-bezier(.22,.7,.28,1) forwards}
  .whale-drift{animation:drift 27s ease-in-out infinite}
  .whale-bob{animation:bob 8.5s ease-in-out infinite}
  .whale-bob svg{
    display:block;width:min(46vw,52vh,444px);height:auto;color:var(--brand);
    filter:drop-shadow(0 0 28px rgba(77,107,254,.44)) drop-shadow(0 12px 70px rgba(50,86,220,.38));
  }
  /* the light the whale reflects back up into the water */
  .halo{
    position:absolute;left:50%;top:50%;width:min(64vw,72vh,640px);height:min(26vw,30vh,260px);
    transform:translate(-50%,-50%);
    background:radial-gradient(50% 50% at 50% 50%,rgba(77,107,254,.22),transparent 68%);
    filter:blur(28px);pointer-events:none;opacity:0;animation:fade-in 2s .8s ease-out forwards;
  }

  /* sonar — "deep seek" made audible, twice per cycle */
  .ping{
    position:absolute;left:50%;top:50%;width:min(46vw,52vh,444px);aspect-ratio:1;
    translate:-50% -50%;border-radius:50%;filter:blur(2px);opacity:0;pointer-events:none;
    background:radial-gradient(closest-side,transparent 90%,rgba(134,168,255,.5) 95%,rgba(134,168,255,.5) 98%,transparent 100%);
    animation:ping 6s cubic-bezier(.2,.6,.35,1) infinite;
  }
  .ping.p2{animation-delay:3s}
  @keyframes ping{
    0%{transform:scale(.34);opacity:0}
    16%{opacity:.30}
    100%{transform:scale(1.45);opacity:0}
  }

  @keyframes whale-in{
    from{opacity:0;transform:translate3d(-120px,14px,0) scale(.94)}
    to{opacity:1;transform:translate3d(0,0,0) scale(1)}
  }
  @keyframes drift{0%,100%{transform:translate3d(-16px,0,0)}50%{transform:translate3d(16px,0,0)}}
  @keyframes bob{
    0%,100%{transform:translateY(-9px) rotate(-1.4deg)}
    50%{transform:translateY(9px) rotate(1.4deg)}
  }

  /* ---------- brand lockup ---------- */
  .brand{
    margin-top:clamp(26px,4.4vh,52px);
    display:flex;align-items:center;
    height:26px;color:var(--pale);
    opacity:0;animation:rise 1s 1.05s cubic-bezier(.22,.7,.28,1) forwards;
  }
  .brand svg{display:block;height:26px;width:auto}

  .status{
    margin-top:16px;font-size:13px;line-height:20px;letter-spacing:.02em;
    color:var(--muted);opacity:0;
    animation:rise 1s 1.2s cubic-bezier(.22,.7,.28,1) forwards;
  }
  .status span{transition:opacity .18s ease}

  /* the echo-sounder return: one pulse travelling a hairline */
  .echo{
    position:relative;margin-top:24px;width:236px;height:1px;border-radius:1px;
    background:rgba(156,184,244,.20);overflow:hidden;opacity:0;
    animation:fade-in 1.2s 1.45s ease-out forwards;
  }
  .echo::after{
    content:"";position:absolute;top:-1.5px;left:0;width:64px;height:4px;border-radius:4px;
    background:linear-gradient(90deg,transparent,rgba(140,172,255,.9) 52%,#EAFFFF);
    box-shadow:0 0 12px rgba(120,158,255,.75);
    animation:sweep 2.6s cubic-bezier(.55,0,.45,1) infinite;
  }
  @keyframes sweep{
    0%{transform:translateX(-70px)}
    100%{transform:translateX(240px)}
  }

  @keyframes water-in{from{opacity:0}to{opacity:1}}
  @keyframes fade-in{from{opacity:0}to{opacity:1}}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes ray-in{from{opacity:0}to{opacity:var(--peak,.14)}}
  @keyframes sway{
    from{transform:rotate(calc(var(--tilt,0deg) - 1.6deg))}
    to{transform:rotate(calc(var(--tilt,0deg) + 1.6deg))}
  }

  /* ---------- quality floor ---------- */
  @media (max-width:680px){
    .whale-bob svg{width:min(64vw,300px)}
    .ray{display:none}
  }
  @media (prefers-reduced-motion:reduce){
    .water,.sun,.ray,.caustics,.halo,.brand,.status,.echo,.bokeh{opacity:1;animation:none}
    .ray.r1{opacity:.30}.ray.r2{opacity:.44}.ray.r3{opacity:.26}
    .whale-enter{opacity:1;animation:none;transform:none}
    .whale-drift,.whale-bob{animation:none}
    .plankton{animation:none}
    .ping{animation:none;opacity:.22;transform:scale(1.5)}
    .echo::after{animation:none;transform:translateX(86px)}
  }
</style>
</head>
<body>
  <div class="sea">
    <div class="water"></div>
    <div class="sun"></div>
    <div class="caustics"></div>
    <div class="ray r1"></div>
    <div class="ray r2"></div>
    <div class="ray r3"></div>
    <div class="plankton far"></div>
    <div class="plankton mid"></div>
    <div class="plankton near"></div>
    <div class="bokeh"></div>
    <div class="vignette"></div>
  </div>

  <div class="stage">
    <div class="hero">
      <div class="halo"></div>
      <div class="whale-wrap">
        <div class="ping"></div>
        <div class="ping p2"></div>
        <div class="whale-enter">
        <div class="whale-drift">
          <div class="whale-bob">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="none" role="img" aria-label="DeepSeek">
  <defs>
    <linearGradient id="whaleDepth" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#6480FF"/>
      <stop offset="0.55" stop-color="#4D6BFE"/>
      <stop offset="1" stop-color="#3A57E6"/>
    </linearGradient>
  </defs>
  <path fill="url(#whaleDepth)" d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z"/>
</svg>
          </div>
        </div>
      </div>
      </div>

      <div class="brand">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 143 23" fill="none" role="img" aria-label="DeepSeek">
<path d="M78.6784 18.6813H77.1077V16.2462H78.6784C79.6513 16.2462 80.6341 16.0037 81.2672 15.3298C81.9009 14.6559 82.14 13.6222 82.14 12.589C82.14 11.5559 81.9109 10.5222 81.2672 9.84884C80.6246 9.17496 79.6513 8.93245 78.6784 8.93245C77.7056 8.93245 76.7227 9.17496 76.0885 9.84884C75.4549 10.5227 75.2157 11.5559 75.2157 12.589V22.5899H72.4604V6.50684H75.2157V7.53106H75.7209C75.7756 7.46792 75.8304 7.41428 75.8857 7.36064C76.5752 6.73146 77.6307 6.50684 78.6684 6.50684C80.2944 6.50684 81.9193 6.91138 82.9849 8.03451C84.0499 9.15764 84.4265 10.8826 84.4265 12.5991C84.4265 14.3156 84.0404 16.0316 82.9849 17.1637C81.9288 18.2958 80.2944 18.6824 78.6784 18.6824V18.6813Z" fill="currentColor"/>
<path d="M36.7486 6.93999H38.3188V9.37511H36.7486C35.7752 9.37511 34.7929 9.61762 34.1593 10.2915C33.5256 10.9654 33.287 11.9991 33.287 13.0323C33.287 14.0654 33.5167 15.0986 34.1593 15.7725C34.8019 16.4463 35.7752 16.6888 36.7486 16.6888C37.722 16.6888 38.7049 16.4463 39.3385 15.7725C39.9722 15.0986 40.2108 14.0654 40.2108 13.0323V3.02246H42.9655V19.115H40.2108V18.0908H39.7056C39.6503 18.1534 39.5955 18.2076 39.5402 18.2612C38.8513 18.8898 37.7952 19.115 36.7576 19.115C35.1321 19.115 33.5066 18.711 32.4416 17.5879C31.3766 16.4648 31 14.7393 31 13.0233C31 11.3073 31.3856 9.5908 32.4416 8.45873C33.5066 7.3356 35.1321 6.93999 36.7486 6.93999Z" fill="currentColor"/>
<path d="M56.7855 12.8145V13.794H49.4483V11.8445H54.3151C54.2051 11.1348 53.948 10.4699 53.4887 9.98433C52.8277 9.28363 51.8079 9.03218 50.7982 9.03218C49.7886 9.03218 48.7688 9.28363 48.1078 9.98433C47.4468 10.685 47.2076 11.7545 47.2076 12.8151C47.2076 13.8756 47.4462 14.9535 48.1078 15.6452C48.7688 16.337 49.788 16.5979 50.7982 16.5979C51.8085 16.5979 52.8277 16.3465 53.4887 15.6452C53.5804 15.5463 53.6631 15.4385 53.7458 15.3306H56.4642C56.2256 16.1755 55.849 16.9393 55.2796 17.5322C54.1777 18.6911 52.479 19.1135 50.7982 19.1135C49.1175 19.1135 47.4188 18.7 46.3169 17.5322C45.215 16.3644 44.811 14.5852 44.811 12.8151C44.811 11.0449 45.2061 9.25681 46.3169 8.09792C47.4283 6.93903 49.1175 6.5166 50.7982 6.5166C52.479 6.5166 54.1777 6.93009 55.2796 8.09792C56.3904 9.26575 56.7855 11.0449 56.7855 12.8151V12.8145Z" fill="currentColor"/>
<path d="M70.6151 12.8145V13.794H63.2779V11.8445H68.1447C68.0341 11.1348 67.7776 10.4699 67.3183 9.98433C66.6573 9.28363 65.6375 9.03218 64.6278 9.03218C63.6181 9.03218 62.5984 9.28363 61.9374 9.98433C61.2763 10.685 61.0372 11.7545 61.0372 12.8151C61.0372 13.8756 61.2758 14.9535 61.9374 15.6452C62.5984 16.337 63.6181 16.5979 64.6278 16.5979C65.6375 16.5979 66.6573 16.3465 67.3183 15.6452C67.4105 15.5463 67.4927 15.4385 67.5748 15.3306H70.2938C70.0546 16.1755 69.678 16.9393 69.1086 17.5322C68.0067 18.6911 66.3081 19.1135 64.6278 19.1135C62.9476 19.1135 61.2484 18.7 60.1465 17.5322C59.0446 16.3644 58.6406 14.5852 58.6406 12.8151C58.6406 11.0449 59.0357 9.25681 60.1465 8.09792C61.2579 6.93903 62.9471 6.5166 64.6278 6.5166C66.3086 6.5166 68.0067 6.93009 69.1086 8.09792C70.22 9.26575 70.6151 11.0449 70.6151 12.8151V12.8145Z" fill="currentColor"/>
<path d="M92.2781 19.1146C93.9589 19.1146 95.657 18.8721 96.7589 18.1804C97.8607 17.4886 98.2653 16.437 98.2653 15.3949C98.2653 14.3528 97.8697 13.2922 96.7589 12.6094C95.657 11.9266 93.9583 11.6746 92.2781 11.6746C91.5612 11.6746 90.9002 11.5757 90.4319 11.3153C89.9637 11.0454 89.7893 10.6414 89.7893 10.2369C89.7893 9.83234 89.9547 9.41941 90.4319 9.15846C90.9002 8.88858 91.626 8.79917 92.3418 8.79917C93.0576 8.79917 93.7834 8.89808 94.2528 9.15846C94.721 9.42835 94.8954 9.83234 94.8954 10.2369H97.6959C97.6959 9.19422 97.3383 8.13424 96.3375 7.45142C95.3368 6.76861 93.803 6.5166 92.2786 6.5166C90.7543 6.5166 89.2211 6.75911 88.2197 7.45142C87.219 8.14318 86.8603 9.19422 86.8603 10.2369C86.8603 11.2796 87.2184 12.3395 88.2197 13.0224C89.2205 13.7052 90.7538 13.9572 92.2786 13.9572C93.0682 13.9572 93.941 14.0561 94.464 14.3165C94.9881 14.5774 95.1714 14.9903 95.1714 15.3949C95.1714 15.7994 94.9881 16.2124 94.464 16.4733C93.941 16.7337 93.1419 16.8326 92.3524 16.8326C91.5629 16.8326 90.7543 16.7337 90.2397 16.4733C89.7256 16.2129 89.5323 15.7994 89.5323 15.3949H86.2998C86.2998 16.4376 86.6943 17.4975 87.8063 18.1804C88.9171 18.8632 90.5979 19.1146 92.2786 19.1146H92.2781Z" fill="currentColor"/>
<path d="M112.094 12.8145V13.794H104.757V11.8445H109.624C109.514 11.1348 109.257 10.4699 108.798 9.98433C108.136 9.28363 107.117 9.03218 106.106 9.03218C105.095 9.03218 104.077 9.28363 103.416 9.98433C102.755 10.685 102.517 11.7545 102.517 12.8151C102.517 13.8756 102.755 14.9535 103.416 15.6452C104.077 16.337 105.097 16.5979 106.106 16.5979C107.116 16.5979 108.136 16.3465 108.798 15.6452C108.889 15.5463 108.972 15.4385 109.054 15.3306H111.772C111.533 16.1755 111.157 16.9393 110.588 17.5322C109.486 18.6911 107.787 19.1135 106.106 19.1135C104.425 19.1135 102.727 18.7 101.625 17.5322C100.524 16.3644 100.12 14.5852 100.12 12.8151C100.12 11.0449 100.515 9.25681 101.625 8.09792C102.737 6.93903 104.427 6.5166 106.106 6.5166C107.786 6.5166 109.486 6.93009 110.588 8.09792C111.699 9.26575 112.093 11.0449 112.093 12.8151L112.094 12.8145Z" fill="currentColor"/>
<path d="M125.924 12.8145V13.794H118.586V11.8445H123.453C123.344 11.1348 123.086 10.4699 122.627 9.98433C121.966 9.28363 120.947 9.03218 119.936 9.03218C118.926 9.03218 117.907 9.28363 117.246 9.98433C116.585 10.685 116.346 11.7545 116.346 12.8151C116.346 13.8756 116.585 14.9535 117.246 15.6452C117.907 16.337 118.927 16.5979 119.936 16.5979C120.946 16.5979 121.966 16.3465 122.627 15.6452C122.719 15.5463 122.801 15.4385 122.884 15.3306H125.602C125.363 16.1755 124.987 16.9393 124.418 17.5322C123.316 18.6911 121.617 19.1135 119.936 19.1135C118.256 19.1135 116.558 18.7 115.456 17.5322C114.354 16.3644 113.949 14.5852 113.949 12.8151C113.949 11.0449 114.344 9.25681 115.456 8.09792C116.566 6.93903 118.256 6.5166 119.936 6.5166C121.617 6.5166 123.315 6.93009 124.418 8.09792C125.529 9.26575 125.924 11.0449 125.924 12.8151V12.8145Z" fill="currentColor"/>
<path d="M130.524 3.02246H127.77V19.115H130.524V3.02246Z" fill="currentColor"/>
<path d="M135.227 12.4374L139.744 19.1136H136.337L131.819 12.4374L136.337 7.07324H139.744L135.227 12.4374Z" fill="currentColor"/>
<g clip-path="url(#dsh-wordmark-clip)">
  <path d="M26.5174 3.39471C26.235 3.2567 26.1137 3.52006 25.9487 3.65346C25.8923 3.69659 25.8446 3.75294 25.7969 3.80469C25.3846 4.24516 24.9027 4.53439 24.2737 4.49989C23.3536 4.44814 22.5682 4.73737 21.8735 5.44119C21.7258 4.57349 21.2353 4.0554 20.4889 3.72304C20.0985 3.55054 19.7034 3.37746 19.4297 3.00197C19.2388 2.73459 19.1865 2.43673 19.091 2.14289C19.0301 1.96579 18.9697 1.78466 18.7656 1.75418C18.5442 1.71968 18.4574 1.90541 18.3705 2.06067C18.0232 2.69549 17.8887 3.39471 17.9019 4.10313C17.9324 5.6965 18.6051 6.96556 19.9421 7.86834C20.0939 7.97184 20.133 8.07535 20.0852 8.22658C19.9938 8.53766 19.8857 8.83955 19.7903 9.15063C19.7293 9.34901 19.6384 9.39271 19.4257 9.30588C18.692 8.9994 18.0583 8.54571 17.4982 7.99772C16.5477 7.07827 15.6881 6.06336 14.6162 5.26869C14.3644 5.08296 14.1125 4.91045 13.8521 4.746C12.7584 3.68394 13.9952 2.81164 14.2816 2.70814C14.5812 2.60003 14.3857 2.22857 13.4179 2.23317C12.4502 2.2372 11.5646 2.56151 10.4359 2.99335C10.2708 3.05832 10.0972 3.10547 9.91951 3.14457C8.8954 2.95022 7.83162 2.90709 6.72069 3.03245C4.62877 3.26533 2.95777 4.25436 1.72954 5.94261C0.254043 7.97184 -0.0932678 10.2777 0.33167 12.6824C0.778458 15.2171 2.07225 17.3153 4.06008 18.9558C6.12152 20.6567 8.49577 21.4905 11.2047 21.3306C12.8498 21.2358 14.6812 21.0155 16.7473 19.2669C17.2682 19.5262 17.8151 19.6297 18.7219 19.7074C19.4205 19.7723 20.0933 19.6729 20.6143 19.5648C21.4302 19.3923 21.3739 18.6367 21.0789 18.4981C18.6874 17.3843 19.2124 17.8374 18.7351 17.4706C19.9501 16.033 21.8063 13.4776 22.379 9.99821C22.4353 9.61409 22.5072 9.073 22.4986 8.76192C22.494 8.57216 22.5377 8.49856 22.7545 8.47671C23.3536 8.40771 23.935 8.24383 24.4692 7.94999C26.0188 7.10357 26.6439 5.71318 26.7911 4.04678C26.8129 3.79204 26.7865 3.52869 26.5174 3.39471ZM13.0143 18.3946C10.6964 16.5724 9.5722 15.9726 9.10816 15.9985C8.67402 16.0244 8.75222 16.5212 8.84768 16.8449C8.94773 17.1646 9.07768 17.3849 9.25996 17.6655C9.38589 17.8512 9.47272 18.1272 9.13404 18.3348C8.38766 18.7965 7.08985 18.1796 7.0289 18.1491C5.51833 17.2595 4.25559 16.0853 3.36546 14.4793C2.50581 12.9337 2.0067 11.2753 1.92447 9.50542C1.90262 9.07818 2.02855 8.92695 2.45406 8.84932C3.01413 8.74582 3.59144 8.72397 4.15093 8.80619C6.51656 9.15178 8.53027 10.2092 10.2185 11.8848C11.1822 12.8388 11.9114 13.979 12.6623 15.0929C13.461 16.2757 14.3201 17.4027 15.4144 18.3268C15.8008 18.6505 16.109 18.8966 16.404 19.0783C15.5144 19.1778 14.0297 19.1991 13.0143 18.3958V18.3946ZM14.1252 11.2489C14.1252 11.0591 14.277 10.9079 14.4679 10.9079C14.511 10.9079 14.5501 10.9165 14.5852 10.9292C14.6329 10.9464 14.6766 10.9723 14.7111 11.0114C14.7721 11.0718 14.8066 11.158 14.8066 11.2489C14.8066 11.4386 14.6548 11.5899 14.4639 11.5899C14.273 11.5899 14.1252 11.4386 14.1252 11.2489ZM17.5759 13.0188C17.3545 13.1096 17.1331 13.1873 16.9203 13.1959C16.5903 13.2131 16.2303 13.0791 16.0348 12.9153C15.7312 12.6605 15.5139 12.5179 15.423 12.0734C15.3839 11.8837 15.4057 11.5899 15.4402 11.4214C15.5185 11.0585 15.4316 10.8257 15.1757 10.614C14.9676 10.4415 14.7025 10.3938 14.4115 10.3938C14.3029 10.3938 14.2034 10.3461 14.1292 10.3076C14.0079 10.2472 13.9078 10.096 14.0033 9.91023C14.0338 9.84985 14.1815 9.70322 14.216 9.67734C14.6111 9.45251 15.0665 9.52612 15.488 9.6946C15.8784 9.85445 16.174 10.1477 16.5989 10.5623C17.033 11.0631 17.1112 11.2011 17.3585 11.5772C17.554 11.871 17.7317 12.1729 17.8536 12.5185C17.9272 12.7341 17.8317 12.9107 17.5759 13.0188Z" fill="currentColor"/>
</g>
<defs>
  <clipPath id="dsh-wordmark-clip">
    <rect width="26.634" height="19.6" fill="white" transform="translate(0.163086 1.75)"/>
  </clipPath>
</defs>
</svg>
      </div>
      <div class="status"><span id="dsh-status-text">正在启动&hellip;</span></div>
      <div class="echo"></div>
    </div>
  </div>

  <script>
    (function () {
      var text = document.getElementById('dsh-status-text');
      var pending = 0;
      window.dshSplash = {
        status: function (next) {
          if (typeof next !== 'string' || text === null) return;
          clearTimeout(pending);
          text.style.opacity = '0';
          pending = setTimeout(function () {
            text.textContent = next;
            text.style.opacity = '1';
          }, 180);
        }
      };
    })();
  </script>
</body>
</html>`

/**
 * The splash page as a `data:` URL, for `BrowserWindow.loadURL`.
 *
 * Encoded with `encodeURIComponent`, so CSS `#`/`%` and the SVG paths survive
 * the URL. The result is roughly 35 KB, far below Chromium's URL cap.
 */
export const LOADING_HTML = DATA_URL_PREFIX + encodeURIComponent(SPLASH_HTML)

/**
 * Build the expression that advances the splash status line.
 *
 * Evaluated in the page's main world, which is where `window.dshSplash` lives;
 * `contextIsolation` keeps the preload world separate and does not apply here.
 * The optional call tolerates a window that has already navigated to the GUI.
 * @param text - the boot stage to display, in the shell's interface language.
 * @returns a JavaScript expression the renderer evaluates to set the status line.
 */
export function splashStatusScript(text: string): string {
  return `window.dshSplash?.status(${JSON.stringify(text)})`
}
