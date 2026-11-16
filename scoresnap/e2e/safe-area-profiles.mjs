export const SAFE_AREA_PROFILES = Object.freeze({
  'iphone-se': Object.freeze({width:375,height:667,top:20,bottom:0}),
  'iphone-15-pro': Object.freeze({width:393,height:852,top:59,bottom:34}),
  'iphone-pro-max': Object.freeze({width:430,height:932,top:59,bottom:34}),
  // AUG-313 phase 1b: notch (pre-Dynamic-Island) and newer Dynamic Island devices.
  'iphone-13-mini': Object.freeze({width:375,height:812,top:50,bottom:34}),
  'iphone-13-notch': Object.freeze({width:390,height:844,top:47,bottom:34}),
  'iphone-16-pro': Object.freeze({width:402,height:874,top:62,bottom:34}),
  'iphone-16-pro-max': Object.freeze({width:440,height:956,top:62,bottom:34}),
});

export function getSafeAreaProfile(name = 'iphone-15-pro') {
  if (!Object.hasOwn(SAFE_AREA_PROFILES, name)) {
    throw new Error(`Unknown DEVICE_PROFILE ${name}; expected ${Object.keys(SAFE_AREA_PROFILES).join(', ')}`);
  }
  const profile = SAFE_AREA_PROFILES[name];
  return profile;
}
