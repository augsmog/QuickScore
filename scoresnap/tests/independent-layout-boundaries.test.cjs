const fs=require('node:fs');
const src=fs.readFileSync('app/contest/new.tsx','utf8');
test('wizard scroll and footer share the keyboard avoiding boundary',()=>{
 expect(src.indexOf('<KeyboardAvoidingView')).toBeLessThan(src.indexOf('testID="contest-scroll"'));
 expect(src.indexOf('</ScrollView>',src.indexOf('testID="contest-scroll"'))).toBeLessThan(src.indexOf('testID="contest-footer"'));
 expect(src.indexOf('testID="contest-footer"')).toBeLessThan(src.indexOf('</KeyboardAvoidingView>'));
});
test('native switches retain intrinsic sizing and Android targets are selected explicitly',()=>{
 expect(src).toContain('setupTargets(Platform.OS)');
 expect(src.match(/style=\{Platform.OS === "web" \? \{ width: 88, height: 44 \} : undefined\}/g)).toHaveLength(2);
});
test('paywall action can grow with full label',()=>{
 const paywall=fs.readFileSync('app/paywall.tsx','utf8');
 expect(paywall).not.toContain('numberOfLines');
 expect(paywall).toMatch(/cta:.*minHeight:/);
});
