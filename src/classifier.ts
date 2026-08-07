import type { ElementAttributes, ElementRole } from './selector-types.js';

const EMAIL_PATTERNS = ['email', 'e-mail', 'e mail', 'mail', 'courriel', 'adresse'];
const PASSWORD_PATTERNS = ['password', 'passwd', 'pwd', 'pass phrase', 'mot de passe', 'mdp', 'contraseña'];
const USERNAME_PATTERNS = ['username', 'user name', 'user', 'utilisateur', 'identifiant', 'pseudo', 'nick', 'login'];
const SUBMIT_PATTERNS = [
  'login',
  'log in',
  'sign in',
  'signin',
  'sign-in',
  'se connecter',
  'connecter',
  'connexion',
  'submit',
  'envoyer',
  'valider',
  'entrar',
  'ingresar',
  'iniciar sesion',
  'iniciar sesión',
  'log on'
];

/**
 * Normalizes a string for pattern matching: lowercase + strips accents.
 * This keeps the heuristics robust against accented French/Spanish labels.
 */
function normalize(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Classifies a DOM element using lightweight heuristics.
 *
 * Returns a role and a 0-100 reliability score so multiple matches can be
 * ranked. Earlier checks win (password beats email on shared keywords, etc.).
 */
export function classifyElement(attributes: ElementAttributes): { role: ElementRole; score: number } {
  const tag = attributes.tagName.toLowerCase();
  const type = normalize(attributes.type);
  const name = normalize(attributes.name);
  const placeholder = normalize(attributes.placeholder);
  const label = normalize(attributes.ariaLabel);
  const text = normalize(attributes.innerText ?? attributes.value ?? '');
  const haystack = [name, placeholder, label, text].join(' ');

  // --- PASSWORD ---
  if (type === 'password') {
    return { role: 'password', score: 100 };
  }
  if (PASSWORD_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return { role: 'password', score: 80 };
  }

  // --- EMAIL ---
  if (type === 'email') {
    return { role: 'email', score: 100 };
  }
  if (EMAIL_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return { role: 'email', score: 90 };
  }

  // --- SUBMIT ---
  const isButton = tag === 'button' || (tag === 'input' && (type === 'submit' || type === 'button'));
  if (isButton) {
    if (type === 'submit') {
      return { role: 'submit', score: 85 };
    }
    if (SUBMIT_PATTERNS.some((pattern) => haystack.includes(pattern))) {
      return { role: 'submit', score: 100 };
    }
    if (tag === 'button') {
      // Generic button without a recognizable label: low confidence.
      return { role: 'submit', score: 40 };
    }
  }

  // --- USERNAME (only text-like inputs, never a password/email) ---
  if (tag === 'input' && (type === '' || type === 'text' || type === 'tel')) {
    if (USERNAME_PATTERNS.some((pattern) => haystack.includes(pattern))) {
      return { role: 'username', score: 80 };
    }
  }

  return { role: 'other', score: 0 };
}
