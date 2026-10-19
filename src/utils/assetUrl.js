const assetOrigin = 'https://dogeub-assets.pages.dev';

export function getAssetUrl(value) {
  if (typeof value !== 'string' || (import.meta.env.VITE_SITES_HOSTED !== true && import.meta.env.VITE_PROXY_RUNTIME !== true)) return value;

  if (value.startsWith('/assets/img/')) {
    return `${assetOrigin}/img/${value.slice('/assets/img/'.length)}`;
  }
  if (value.startsWith('/assets-fb/')) {
    return `${assetOrigin}/img/server/${value.slice('/assets-fb/'.length)}`;
  }
  return value;
}
