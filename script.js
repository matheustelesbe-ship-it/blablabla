(() => {
  'use strict';

  /* ------------------------------------------------------------------
     Config
     ------------------------------------------------------------------ */
  const CONFIG = {
    // Booking requests are e-mailed to this address through FormSubmit.co.
    // At hand-over, change it to the practice address: ct.carident@gmail.com
    bookingEmail: 'matheustelesbe@gmail.com',
    // While true, "new patient" requests are blocked with an explanation.
    patientStop: true,
    timeZone: 'Europe/Brussels',
    // Day index (0 = Sunday) → [opens, closes] in minutes after midnight.
    hours: { 1: [480, 1080], 2: [480, 1080], 3: [480, 1080], 5: [480, 1080] },
  };

  const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* ------------------------------------------------------------------
     Open / closed status (always in Belgian time)
     ------------------------------------------------------------------ */
  function brusselsNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return {
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
      mins: Number(get('hour')) * 60 + Number(get('minute')),
      iso: `${get('year')}-${get('month')}-${get('day')}`,
    };
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  function updateStatus() {
    const { day, mins } = brusselsNow();
    const today = CONFIG.hours[day];
    const isOpen = !!today && mins >= today[0] && mins < today[1];
    let text;
    if (isOpen) {
      text = `Nu open · tot ${hhmm(today[1])}`;
    } else {
      for (let i = 0; i < 8; i++) {
        const d = (day + i) % 7;
        const h = CONFIG.hours[d];
        if (!h || (i === 0 && mins >= h[0])) continue;
        const when = i === 0 ? 'vandaag' : i === 1 ? 'morgen' : DAY_NAMES[d];
        text = `Gesloten · opent ${when} om ${hhmm(h[0])}`;
        break;
      }
    }
    $$('[data-status]').forEach((el) => {
      el.classList.toggle('is-open', isOpen);
      $('[data-status-text]', el).textContent = text;
    });
    $$('.hours__table tr').forEach((tr) => tr.classList.toggle('is-today', Number(tr.dataset.day) === day));
  }
  updateStatus();
  setInterval(updateStatus, 60_000);

  /* ------------------------------------------------------------------
     Header, mobile action bar, active nav link
     ------------------------------------------------------------------ */
  const header = $('[data-header]');
  const actionbar = $('[data-actionbar]');
  const hero = $('.hero');
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    actionbar.classList.toggle('is-visible', y > hero.offsetHeight * 0.6);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const navLinks = $$('.nav a');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => sectionObserver.observe(s));

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  const menuToggle = $('[data-menu-toggle]');
  const menu = $('[data-mobile-menu]');
  const menuIsOpen = () => menuToggle.getAttribute('aria-expanded') === 'true';

  function setMenu(open) {
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) {
      menu.hidden = false;
      void menu.offsetWidth; // commit the hidden state so the transition runs
      menu.classList.add('is-open');
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (!menuIsOpen()) menu.hidden = true; }, 260);
    }
  }
  menuToggle.addEventListener('click', () => setMenu(!menuIsOpen()));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuIsOpen()) { setMenu(false); menuToggle.focus(); }
  });
  matchMedia('(min-width: 1181px)').addEventListener('change', (e) => { if (e.matches && menuIsOpen()) setMenu(false); });

  /* ------------------------------------------------------------------
     Scroll reveal
     ------------------------------------------------------------------ */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  $$('[data-reveal]').forEach((el) => revealObserver.observe(el));

  /* ------------------------------------------------------------------
     Treatments: accordion + cursor-following preview (desktop only)
     ------------------------------------------------------------------ */
  $$('.titem').forEach((item) => {
    const btn = $('.titem__head', item);
    const body = $('.titem__body', item);
    body.inert = true;
    btn.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      body.inert = !open;
      if (open) floatPreview.hide();
    });
  });

  const floatPreview = (() => {
    const el = $('[data-tfloat]');
    const list = $('[data-tlist]');
    const noop = { hide() {} };
    if (!el || !finePointer || reduceMotion) return noop;

    const img = $('img', el);
    const H = 210; // preview height, keeps the image vertically centred on the cursor
    let x = 0, y = 0, tx = 0, ty = 0, rot = 0, scale = 0.9, targetScale = 0.9;
    let raf = 0, visible = false, placed = false;

    const frame = () => {
      const dx = tx - x;
      x += dx * 0.16;
      y += (ty - y) * 0.16;
      rot += (Math.max(-8, Math.min(8, dx * 0.05)) - rot) * 0.18;
      scale += (targetScale - scale) * 0.2;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
      const settled = Math.abs(dx) < 0.1 && Math.abs(ty - y) < 0.1 && Math.abs(targetScale - scale) < 0.002;
      raf = !visible && settled ? 0 : requestAnimationFrame(frame);
    };
    const run = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const show = (src) => {
      if (img.getAttribute('src') !== src) img.src = src;
      visible = true; targetScale = 1;
      el.classList.add('is-visible');
      run();
    };
    const hide = () => {
      visible = false; targetScale = 0.9;
      el.classList.remove('is-visible');
    };

    list.addEventListener('pointermove', (e) => {
      tx = e.clientX + 32;
      ty = e.clientY - H / 2;
      if (!placed) { x = tx; y = ty; placed = true; }
      const item = e.target.closest('.titem');
      const overHead = e.target.closest('.titem__head');
      if (item && overHead && !item.classList.contains('is-open')) show(item.dataset.img);
      else hide();
      run();
    });
    list.addEventListener('pointerleave', () => { hide(); placed = false; });
    addEventListener('scroll', hide, { passive: true });
    return { hide };
  })();

  /* ------------------------------------------------------------------
     First-aid card flip
     ------------------------------------------------------------------ */
  const flip = $('[data-flip]');
  if (flip) {
    const [front, back] = $$('.flip__face', flip);
    const label = $('[data-flip-label]');
    back.inert = true;
    const toggleFlip = () => {
      const flipped = flip.classList.toggle('is-flipped');
      front.inert = flipped;
      back.inert = !flipped;
      label.textContent = flipped ? 'Toon de voorkant' : 'Draai de kaart om';
    };
    $('[data-flip-btn]').addEventListener('click', toggleFlip);
    front.addEventListener('click', toggleFlip);
    back.addEventListener('click', toggleFlip);
  }

  /* ------------------------------------------------------------------
     Booking dialog
     ------------------------------------------------------------------ */
  const dialog = $('[data-booking]');
  const form = $('[data-booking-form]');
  const submitBtn = $('[data-submit]');
  const statusEl = $('[data-form-status]');
  const stopNotice = $('[data-stop-notice]');
  const dateInput = form.elements.datum;
  let closeTimer = 0;

  const showView = (name) => $$('[data-view]', dialog).forEach((v) => { v.hidden = v.dataset.view !== name; });

  function openBooking() {
    if (menuIsOpen()) setMenu(false);
    clearTimeout(closeTimer);
    dateInput.min = brusselsNow().iso;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    void dialog.offsetWidth;
    dialog.classList.add('is-open');
  }

  function closeBooking() {
    if (!dialog.open || !dialog.classList.contains('is-open')) return;
    dialog.classList.remove('is-open');
    const duration = reduceMotion ? 0 : (matchMedia('(max-width: 900px)').matches ? 420 : 240);
    closeTimer = setTimeout(() => dialog.close(), duration);
  }

  dialog.addEventListener('close', () => {
    dialog.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (!$('[data-view="success"]', dialog).hidden) resetForm();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeBooking(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeBooking(); });
  $$('[data-booking-close]', dialog).forEach((b) => b.addEventListener('click', closeBooking));
  $$('[data-book]').forEach((b) => b.addEventListener('click', openBooking));

  /* Patient stop */
  function syncPatient() {
    const blocked = CONFIG.patientStop && form.elements.patient.value === 'Nieuwe patiënt';
    stopNotice.hidden = !blocked;
    submitBtn.disabled = blocked;
    if (blocked) setStatus('');
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'patient') syncPatient(); });

  /* Validation */
  const rules = {
    naam: (v) => v.trim().length >= 2 || 'Vul uw naam in.',
    telefoon: (v) => v.replace(/\D/g, '').length >= 9 || 'Vul een geldig telefoonnummer in.',
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Vul een geldig e-mailadres in.',
    reden: (v) => !!v || 'Kies een reden voor uw bezoek.',
    datum: (v) => {
      if (!v) return true;
      if (v < brusselsNow().iso) return 'Kies een datum vanaf vandaag.';
      const day = new Date(`${v}T12:00:00`).getDay();
      return !!CONFIG.hours[day] || `Op ${DAY_NAMES[day]} is de praktijk gesloten. Kies ma, di, wo of vr.`;
    },
    toestemming: (_v, el) => el.checked || 'Uw toestemming is nodig om de aanvraag te verwerken.',
  };

  function validateField(name) {
    const el = form.elements[name];
    const result = rules[name](el.value, el);
    const message = result === true ? '' : result;
    const err = $(`[data-error-for="${name}"]`, form);
    err.id = `err-${name}`;
    err.textContent = message;
    el.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (message) el.setAttribute('aria-describedby', err.id);
    else el.removeAttribute('aria-describedby');
    return !message;
  }

  Object.keys(rules).forEach((name) => {
    const el = form.elements[name];
    el.addEventListener('blur', () => { if (el.value || el.type === 'checkbox') validateField(name); });
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
      if (el.getAttribute('aria-invalid') === 'true' || el.type === 'date') validateField(name);
    });
  });

  function setStatus(content, isError = false) {
    statusEl.replaceChildren(...(Array.isArray(content) ? content : [content]));
    statusEl.classList.toggle('is-error', isError);
  }
  function setLoading(on) {
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.disabled = on;
    submitBtn.setAttribute('aria-busy', String(on));
  }
  const prettyDate = (iso) => new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${iso}T12:00:00`));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const names = Object.keys(rules);
    const results = names.map(validateField);
    const firstInvalid = names[results.indexOf(false)];
    if (firstInvalid) {
      form.elements[firstInvalid].focus();
      setStatus('Controleer de gemarkeerde velden.', true);
      return;
    }
    if (form.elements._honey.value) return; // bot trap

    const data = Object.fromEntries(new FormData(form));
    const payload = {
      _subject: `Afspraakaanvraag via website — ${data.naam.trim()}`,
      _template: 'table',
      _captcha: 'false',
      Naam: data.naam.trim(),
      Telefoon: data.telefoon.trim(),
      email: data.email.trim(),
      Patiënt: data.patient,
      Reden: data.reden,
      Voorkeursdatum: data.datum ? prettyDate(data.datum) : 'Geen voorkeur',
      Moment: data.moment,
      Bericht: data.bericht?.trim() || '—',
      Verzonden: new Date().toLocaleString('nl-BE', { timeZone: CONFIG.timeZone }),
    };

    setLoading(true);
    setStatus('Bezig met versturen…');
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONFIG.bookingEmail}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || `HTTP ${res.status}`);
      showSuccess(payload);
    } catch (err) {
      console.error('[booking]', err);
      if (/activat/i.test(err.message)) {
        setStatus('Dit formulier is nog niet geactiveerd. Open de activatiemail van FormSubmit in de inbox van het ontvangstadres en probeer opnieuw.', true);
      } else {
        const body = Object.entries(payload).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`).join('\n');
        const mail = Object.assign(document.createElement('a'), {
          href: `mailto:${CONFIG.bookingEmail}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`,
          textContent: 'stuur uw aanvraag per e-mail',
        });
        const tel = Object.assign(document.createElement('a'), { href: 'tel:+32477505034', textContent: '0477 50 50 34' });
        setStatus(['Versturen is niet gelukt. Bel ons op ', tel, ' of ', mail, '.'], true);
      }
    } finally {
      setLoading(false);
      syncPatient();
    }
  });

  function showSuccess(payload) {
    $('[data-success-name]', dialog).textContent = payload.Naam.split(/\s+/)[0];
    $('[data-success-phone]', dialog).textContent = payload.Telefoon;
    showView('success');
    $('[data-success-title]', dialog).focus();
  }

  function resetForm() {
    form.reset();
    $$('[aria-invalid]', form).forEach((el) => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    $$('[data-error-for]', form).forEach((el) => { el.textContent = ''; });
    setStatus('');
    syncPatient();
    showView('form');
  }

  syncPatient();

  /* ------------------------------------------------------------------
     Misc
     ------------------------------------------------------------------ */
  $('[data-year]').textContent = new Date().getFullYear();
})();
