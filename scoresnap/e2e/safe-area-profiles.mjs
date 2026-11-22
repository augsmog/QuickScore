export const SAFE_AREA_PROFILES = Object.freeze({
  'iphone-se': Object.freeze({width:375,height:667,top:20,bottom:0}),
  'iphone-15-pro': Object.freeze({width:393,height:852,top:59,bottom:34}),
  // AUG-1367: dynamic-island 6.3" class (iPhone 16 Pro) regression coverage for the
  // New Contest spacing audit, per the reconciled Fable+Astra plan.
  'iphone-16-pro': Object.freeze({width:402,height:874,top:59,bottom:34}),
  'iphone-pro-max': Object.freeze({width:430,height:932,top:59,bottom:34}),
});

export function getSafeAreaProfile(name = 'iphone-15-pro') {
  if (!Object.hasOwn(SAFE_AREA_PROFILES, name)) {
    throw new Error(`Unknown DEVICE_PROFILE ${name}; expected ${Object.keys(SAFE_AREA_PROFILES).join(', ')}`);
  }
  const profile = SAFE_AREA_PROFILES[name];
  return profile;
}

// Override only safe-area-context's hidden CSS environment measurement.
export const simulateSafeArea = ({top,bottom}) => {
    const original = window.getComputedStyle;
    window.getComputedStyle = function(element, ...args) {
      const style = original.call(this,element,...args);
      if (element.style.position === 'fixed' && element.style.visibility === 'hidden' && element.style.transitionProperty === 'padding') {
        return new Proxy(style,{get(target,key) {
          if (key === 'paddingTop') return `${top}px`;
          if (key === 'paddingBottom') return `${bottom}px`;
          const value = Reflect.get(target,key,target);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      }
      return style;
    };
  };
