'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'styles.css'), 'utf8');

describe('estrutura acessível da página (RNF02, RNF03)', () => {
  const { document } = new JSDOM(html).window;

  test('idioma, título e viewport definidos', () => {
    expect(document.documentElement.getAttribute('lang')).toBe('pt-BR');
    expect(document.title.trim()).not.toBe('');
    expect(document.querySelector('meta[name="viewport"]').content).toContain('width=device-width');
  });

  test('landmarks: header, nav identificado, main e footer', () => {
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelector('nav').getAttribute('aria-label')).toBeTruthy();
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
  });

  test('link para pular ao conteúdo aponta para um destino existente', () => {
    const skip = document.querySelector('a.skip-link');
    expect(skip).not.toBeNull();
    expect(document.querySelector(skip.getAttribute('href'))).not.toBeNull();
  });

  test('região viva para anunciar mensagens e alternativa sem JavaScript', () => {
    expect(document.querySelector('[aria-live="polite"][role="status"]')).not.toBeNull();
    expect(document.querySelector('noscript').textContent).toMatch(/JavaScript/);
  });

  test('o script externo é carregado do próprio servidor (compatível com a CSP)', () => {
    const scripts = [...document.querySelectorAll('script')];
    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach((s) => expect(s.getAttribute('src')).toMatch(/^\//));
    expect(document.querySelectorAll('script:not([src])')).toHaveLength(0);
  });
});

describe('estilos de acessibilidade e responsividade', () => {
  test('foco visível, movimento reduzido e layout para 360 px', () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/max-width:\s*40rem/); // tabela vira cartões em telas estreitas
    expect(css).toMatch(/overflow-wrap:\s*anywhere/); // evita rolagem horizontal
  });
});
