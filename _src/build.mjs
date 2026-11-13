// =============================================================================
//  Builds the homepage into one file PER LANGUAGE, and writes the sitemap.
//
//  node _src/build.mjs
//
//  WHY THIS EXISTS. The homepage used to be a single URL carrying all four
//  languages at once, hidden from each other with CSS and switched by script.
//  A reader saw one language; a crawler saw four at one address and had to
//  pick one of them to be "the" page. Arabic, Russian and Turkish searches
//  therefore had nothing of their own to find — and the hreflang tags pointed
//  all five alternates at that same single URL, which says nothing at all.
//
//  So: /, /ar/, /ru/, /tr/, each containing ONE language, each naming the
//  other three. The text still lives in one place — _src/home.html, with its
//  four translations side by side, which is the only way they get reviewed
//  against each other — and this script is what turns that into four pages.
//
//  THE SOURCE IS THE ONLY FILE YOU EDIT. index.html, ar/, ru/ and tr/ are
//  build output; an edit there is lost on the next run. The markers in the
//  source (@HEAD, @PICKER, @SCRIPT, @HOME@, @SRCONLY) are where this script
//  writes. Everything else is copied through untouched, which is why the
//  source stays readable as a page rather than becoming a template language.
//
//  If you ever want the build step gone, run it once and keep the four files:
//  the output is ordinary static HTML with nothing generated-looking in it.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SITE = 'https://kaskalba.com';

// Bump when the page's content changes; it is what <lastmod> reports, and a
// date that moves on every build teaches crawlers to ignore the field.
const LASTMOD = '2026-11-13';

// Order matters: it is the order of the rows in the picker.
const ORDER = ['ar', 'en', 'ru', 'tr'];

const LANGS = {
  // `path` is both the URL and the output directory. '/' is English because
  // the store listings and every printed link point at the bare domain, and
  // that address must keep answering with a page rather than a redirect.
  ar: {
    path: '/ar/', dir: 'rtl', name: 'العربية', ogLocale: 'ar_AR', pickerLabel: 'اللغة',
    title: 'تعلّم اللغة الليتوانية بالعربية — من الصفر إلى B2 | KasKalba',
    desc: 'تطبيق لتعلّم الليتوانية بشرح عربي: ٢٠ مستوى من A1 إلى B2، و٦٠ سيناريو محادثة تتكلّمها بصوتك، ونماذج امتحان الدولة وامتحان الدستور. ابدأ مجاناً بأوّل ٣ مستويات.',
  },
  en: {
    path: '/', dir: 'ltr', name: 'English', ogLocale: 'en_US', pickerLabel: 'Language',
    title: 'Learn Lithuanian from zero to B2 — KasKalba',
    desc: 'Learn Lithuanian in English — 20 levels from A1 to B2, 60 spoken scenarios with pronunciation practice, and mock state language and constitution exams. First 3 levels free.',
  },
  ru: {
    path: '/ru/', dir: 'ltr', name: 'Русский', ogLocale: 'ru_RU', pickerLabel: 'Язык',
    title: 'Литовский язык с нуля до B2 — KasKalba',
    desc: 'Литовский с объяснениями на русском: 20 уровней от A1 до B2, 60 разговорных сценариев вслух, пробные госэкзамен и экзамен по Конституции. Первые 3 уровня бесплатно.',
  },
  tr: {
    path: '/tr/', dir: 'ltr', name: 'Türkçe', ogLocale: 'tr_TR', pickerLabel: 'Dil',
    title: 'Sıfırdan B2’ye Litvanca öğrenin — KasKalba',
    desc: 'Türkçe anlatımla Litvanca: A1’den B2’ye 20 seviye, sesli konuştuğunuz 60 diyalog senaryosu ve devlet dil sınavı ile Anayasa sınavı denemeleri. İlk 3 seviye ücretsiz.',
  },
};

// Pages that are NOT per-language. They stay one URL carrying all four
// translations, on purpose: Play Console's privacy-policy field and both
// store descriptions point at these addresses, and a legal page does not
// need to rank — it needs to keep answering at the address already filed.
const SHARED_PAGES = ['/privacy', '/terms', '/delete-account'];

// --- the surgery ------------------------------------------------------------

const attrEsc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const textEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Find where the element opened at `from` closes, counting nested tags of the
// same name. A non-greedy ".*?</p>" would stop at the first close it met,
// which is only correct until someone nests one.
function endOfElement(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}(\\s[^>]*)?>`, 'gi');
  re.lastIndex = from;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === '/') {
      if (depth === 0) return m.index + m[0].length;
      depth--;
    } else {
      depth++;
    }
  }
  throw new Error(`unclosed <${tag}> at ${from}`);
}

// Delete every element marked for a language we are not building.
function dropOtherLanguages(html, keep) {
  for (const lang of ORDER) {
    if (lang === keep) continue;
    const open = new RegExp(`<([a-zA-Z][\\w-]*)((?:[^>]*)\\slang-${lang})(\\s[^>]*)?>`);
    for (;;) {
      const m = open.exec(html);
      if (!m) break;
      const end = endOfElement(html, m[1], m.index + m[0].length);
      html = html.slice(0, m.index) + html.slice(end);
    }
  }
  // The kept language no longer needs its marker.
  html = html.replace(new RegExp(`\\s+lang-${keep}(?=[\\s>])`, 'g'), '');
  // Removing a block off its own line leaves the indentation behind.
  return html.replace(/^[ \t]+\r?\n/gm, '');
}

// --- the generated pieces ---------------------------------------------------

function headFor(lang) {
  const L = LANGS[lang];
  const lines = [
    `<link rel="canonical" href="${SITE}${L.path}" />`,
    // Every page lists all four plus x-default, and every page is listed by
    // the other three. hreflang is only believed when it is reciprocal.
    ...ORDER.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${LANGS[l].path}" />`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
    `<meta property="og:url" content="${SITE}${L.path}" />`,
    `<meta property="og:locale" content="${L.ogLocale}" />`,
    ...ORDER.filter((l) => l !== lang).map(
      (l) => `<meta property="og:locale:alternate" content="${LANGS[l].ogLocale}" />`
    ),
    `<meta property="og:title" content="${attrEsc(L.title)}" />`,
    `<meta property="og:description" content="${attrEsc(L.desc)}" />`,
    `<title>${textEsc(L.title)}</title>`,
    `<meta name="description" content="${attrEsc(L.desc)}" />`,
  ];
  if (lang === 'en') lines.push(ROOT_REDIRECT);
  return lines.join('\n');
}

// Only on '/'. A visitor arriving at the bare domain from a store listing or
// a printed link gets their own language if they have not already chosen one
// — and whatever they choose from the picker is remembered, so this never
// overrules a decision. It runs in <head> so nothing is painted twice.
//
// It cannot strand a crawler: Googlebot reports en-US and so stays here, and
// every language is reachable as a plain link from every page regardless.
const ROOT_REDIRECT = `<script>
(function () {
  // Whitelist, not just a prefix check: the value comes out of storage, and
  // only these four may ever be pasted into a path.
  var KNOWN = { ar: 1, en: 1, ru: 1, tr: 1 };
  var saved = null;
  try { saved = localStorage.getItem('kaskalba-lang') || localStorage.getItem('lingolt-lang'); } catch (e) {}
  // A choice already made is OBEYED, not merely read as "stop guessing".
  // Someone who picked Arabic and later opens the bare domain — from the
  // store listing, from a printed link — wants Arabic, not this page.
  if (saved && KNOWN[saved]) {
    if (saved !== 'en') location.replace('/' + saved + '/');
    return;
  }
  var tags = navigator.languages || [navigator.language || ''];
  for (var i = 0; i < tags.length; i++) {
    var l = String(tags[i]).slice(0, 2).toLowerCase();
    if (l === 'en') return;
    if (KNOWN[l]) { location.replace('/' + l + '/'); return; }
  }
})();
</script>`;

const GLOBE =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>';
const CHEV =
  '<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const TICK =
  '<svg class="tick" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';

function pickerFor(lang) {
  const rows = ORDER.map((l) => {
    const here = l === lang ? ' aria-current="page"' : '';
    return `        <li><a href="${LANGS[l].path}" hreflang="${l}"${here}><span>${LANGS[l].name}</span>${TICK}</a></li>`;
  }).join('\n');
  return `<div class="lang" id="lang">
      <button class="lang-btn" id="langTrigger" type="button"
              aria-haspopup="true" aria-expanded="false" aria-label="${attrEsc(LANGS[lang].pickerLabel)}">
        ${GLOBE}<span>${LANGS[lang].name}</span>${CHEV}
      </button>
      <ul class="lang-menu" id="langMenu">
${rows}
      </ul>
    </div>`;
}

// All that is left of the old script: opening and closing the panel, and
// remembering a choice so '/' stops guessing. The switching itself is the
// browser following a link now.
const PICKER_JS = `<script>
  var wrap = document.getElementById('lang');
  var trigger = document.getElementById('langTrigger');

  function setOpen(open) {
    if (open) wrap.setAttribute('data-open', ''); else wrap.removeAttribute('data-open');
    trigger.setAttribute('aria-expanded', String(open));
  }

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!wrap.hasAttribute('data-open'));
  });
  // Outside click and Escape. A panel that only closes by pressing the same
  // button again is the other half of feeling clumsy.
  document.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  // Choosing a language is a decision; '/' must not second-guess it later.
  Array.prototype.forEach.call(document.querySelectorAll('.lang-menu a'), function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('kaskalba-lang', a.getAttribute('hreflang')); } catch (e) {}
    });
  });
</script>`;

// --- structured data --------------------------------------------------------
//
//  Read OUT of the finished page rather than written beside it. Google's rule
//  for FAQ markup is that it must match what the visitor sees; the surest way
//  to satisfy that is to have no second copy of the text to fall out of step.
//  Same for the screenshots and the store links — they are whatever the page
//  actually links to.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const plainText = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => (e in ENTITIES ? ENTITIES[e] : m))
    .replace(/\s+/g, ' ')
    .trim();

function faqFrom(html) {
  const section = html.match(/<section id="faq">([\s\S]*?)<\/section>/);
  if (!section) return [];
  const out = [];
  for (const d of section[1].matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)) {
    const q = d[1].match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    if (!q) continue;
    const answer = d[1].replace(/<summary[^>]*>[\s\S]*?<\/summary>/, '');
    const question = plainText(q[1]);
    const text = plainText(answer);
    if (question && text) out.push({ question, text });
  }
  return out;
}

function structuredData(lang, html) {
  const L = LANGS[lang];
  const abs = (u) => SITE + u;
  const shots = [...new Set([...html.matchAll(/src="(\/img\/[^"]+\.webp)"/g)].map((m) => m[1]))]
    .filter((u) => !u.includes('logo'))
    .map(abs);
  const stores = [
    ...new Set(
      [...html.matchAll(/href="(https:\/\/(?:play\.google\.com|apps\.apple\.com)[^"]+)"/g)].map(
        (m) => m[1]
      )
    ),
  ];

  const app = {
    '@type': 'MobileApplication',
    name: 'KasKalba',
    url: abs(L.path),
    description: L.desc,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Android, iOS',
    // The languages the app EXPLAINS in. The language it teaches is below.
    inLanguage: ORDER,
    about: { '@type': 'Language', name: 'Lithuanian', alternateName: 'lt' },
    image: abs('/img/og-image.png'),
    screenshot: shots,
    installUrl: stores,
    downloadUrl: stores,
    // The download is free; what is sold sits inside it. No aggregateRating:
    // the App Store listing has no ratings yet, and inventing one is the kind
    // of claim that costs a listing.
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: {
      '@type': 'Organization',
      name: 'KasKalba',
      url: SITE + '/',
      logo: abs('/img/logo.webp'),
      sameAs: ['https://facebook.com/KasKalbaLt', 'https://instagram.com/kaskalbalt'],
    },
  };

  const graph = [app];
  const faq = faqFrom(html);
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.text },
      })),
    });
  }

  // `<` escaped so a "</script>" can never appear inside the block and end it
  // early — the one way a JSON-LD island breaks the page around it.
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1)
    .replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// --- build ------------------------------------------------------------------

const source = readFileSync(join(HERE, 'home.html'), 'utf8');

for (const marker of ['<!-- @HEAD -->', '<!-- @JSONLD -->', '<!-- @PICKER -->', '<!-- @SCRIPT -->', '@HOME@']) {
  if (!source.includes(marker)) throw new Error(`source is missing ${marker}`);
}

for (const lang of ORDER) {
  const L = LANGS[lang];
  let out = dropOtherLanguages(source, lang);
  // The structured data is read from the page AFTER the other three languages
  // are gone, so it describes this page and only this one.
  const ld = structuredData(lang, out);
  out = out
    .replace(/^.*@SRCONLY.*\r?\n/gm, '')
    .replace('<html lang="en" dir="ltr" class="en">', `<html lang="${lang}" dir="${L.dir}">`)
    .replace('<!-- @HEAD -->', headFor(lang))
    .replace('<!-- @JSONLD -->', ld)
    .replace('<!-- @PICKER -->', pickerFor(lang))
    .replace('<!-- @SCRIPT -->', PICKER_JS)
    .replaceAll('@HOME@', L.path);

  for (const left of ['@HEAD', '@JSONLD', '@PICKER', '@SCRIPT', '@HOME@', '@SRCONLY', 'lang-ar', 'lang-en', 'lang-ru', 'lang-tr']) {
    if (out.includes(left)) throw new Error(`${lang}: ${left} survived the build`);
  }

  const dest = L.path === '/' ? join(ROOT, 'index.html') : join(ROOT, L.path.slice(1, -1), 'index.html');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`${L.path.padEnd(5)} -> ${dest.slice(ROOT.length + 1).padEnd(16)} ${(out.length / 1024).toFixed(1)} KB`);
}

// --- sitemap ----------------------------------------------------------------

const alternates = [
  ...ORDER.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${LANGS[l].path}"/>`),
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`,
].join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by _src/build.mjs — do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${ORDER.map(
  (l) => `  <url>
    <loc>${SITE}${LANGS[l].path}</loc>
${alternates}
    <lastmod>${LASTMOD}</lastmod>
  </url>`
).join('\n')}
${SHARED_PAGES.map(
  (p) => `  <url>
    <loc>${SITE}${p}</loc>
    <lastmod>${LASTMOD}</lastmod>
  </url>`
).join('\n')}
</urlset>
`;

writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
console.log(`      -> sitemap.xml      ${ORDER.length + SHARED_PAGES.length} urls`);
