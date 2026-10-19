export function browserBackendOrigin(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('VITE_PROXY_BACKEND_URL must be an HTTPS origin');
  return url.origin;
}
export const browserSettingKeys = [
  'bookmarks','quickLinks','engine','prType','showTb','tabName','tabIcon','clkOff','type','theme','themeName',
  'bgColor','siteTextColor','barColor','tabColor','tabOutline','tabBarColor',
  'omninputColor','menuColor','bgDesign','bgDesignColor','navScale',
];
export function browserSettings(options) {
  return Object.fromEntries(browserSettingKeys.filter(key => key in options).map(key => [key, options[key]]));
}
