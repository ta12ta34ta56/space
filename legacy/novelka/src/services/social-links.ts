/**
 * Social links — the creator's public presence.
 *
 * Fill in your real URLs once and they appear on the home screen footer and
 * the about dialog everywhere else. Empty entries are hidden, so leave a
 * handle blank until the account exists.
 */

export interface SocialLink {
  id: string;
  name: string;
  /** brand icon name in the Icon set */
  icon: string;
  /** https URL. Use empty string to hide this network until it exists. */
  url: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { id: 'youtube', name: 'YouTube', icon: 'youtube', url: 'https://youtube.com/@yourhandle' },
  { id: 'instagram', name: 'Instagram', icon: 'instagram', url: 'https://instagram.com/yourhandle' },
  { id: 'tiktok', name: 'TikTok', icon: 'tiktok', url: 'https://tiktok.com/@yourhandle' },
  { id: 'facebook', name: 'Facebook', icon: 'facebook', url: 'https://facebook.com/yourhandle' },
  { id: 'x', name: 'X (Twitter)', icon: 'x', url: 'https://x.com/yourhandle' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', url: 'https://linkedin.com/in/yourhandle' },
  { id: 'github', name: 'GitHub', icon: 'github', url: 'https://github.com/yourhandle' },
  { id: 'email', name: 'Email', icon: 'mail', url: 'mailto:hello@yourdomain.com' },
];

/** Only the links the owner has actually filled in. */
export const visibleSocialLinks = (): SocialLink[] =>
  SOCIAL_LINKS.filter((l) => l.url.trim() !== '' && !l.url.includes('yourhandle') && !l.url.includes('yourdomain'));
