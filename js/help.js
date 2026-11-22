/**
 * Auren — help page: contact form.
 * The form is validated in the browser only. It is not connected to a
 * mail server, and the result message says so.
 */
(function () {
  'use strict';

  const { setupValidation, escapeHtml } = window.Auren;

  const form = document.querySelector('[data-contact-form]');
  const result = document.querySelector('[data-contact-result]');
  if (!form || !result) return;

  setupValidation(form, (data) => {
    result.innerHTML = `
      <h3 class="notice__title">Your message is valid — but it was not sent</h3>
      <p>Thanks, ${escapeHtml(data.name)}. This is a demonstration site with no mail server, so the form only checks what you typed. Nothing left your browser.</p>
      <p><a class="link-arrow" href="https://auren.com">auren.com</a></p>`;
    result.hidden = false;
    result.focus();
  });

  form.addEventListener('input', () => {
    result.hidden = true;
  });
})();
